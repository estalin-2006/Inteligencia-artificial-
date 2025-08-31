from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import re
from sympy import Eq, solve, symbols, sympify, Add, Mul
from sympy.parsing.sympy_parser import parse_expr

# ¡IMPORTANTE! NUNCA expongas tu clave de API directamente en código de producción.
# Para este ejemplo, la mantendremos, pero en un entorno real, usa variables de entorno.
OPENAI_API_KEY = "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"

app = Flask(__name__)
CORS(app)

# Función para detectar si una expresión es una operación matemática simple que se puede resolver localmente.
def is_simple_math_problem(expresion):
    """
    Verifica si una expresión de texto es un problema matemático simple (ej. "5+3" o "2x=10").
    Esto nos permite resolverlo localmente sin llamar a la API de OpenAI,
    haciendo la respuesta mucho más rápida.
    """
    # Expresiones de álgebra básica como "2x+5=10"
    if '=' in expresion:
        # Verifica que la expresión contenga al menos una variable común (x, y, z)
        return re.search(r'[xyz]', expresion, re.IGNORECASE) is not None
    
    # Operaciones aritméticas simples (ej. "5 + 3", "20 / 4")
    # Usa una expresión regular para detectar números y operadores.
    # Evita que frases como "cuanto es el doble de 5" se detecten como simples.
    arithmetic_pattern = r'^\s*[-+]?\d*\.?\d+(?:\s*[-+*/]\s*[-+]?\d*\.?\d+)*\s*$'
    if re.match(arithmetic_pattern, expresion):
        return True
    
    return False

def solve_with_sympy(expresion):
    """
    Resuelve una ecuación o una operación aritmética usando la librería SymPy.
    """
    try:
        # Si es una ecuación
        if '=' in expresion:
            x = symbols('x y z')
            lado_izq, lado_der = expresion.split('=')
            
            # Reemplaza 'x' por la variable simbólica para evitar conflictos.
            expresion_simbolica = Eq(parse_expr(lado_izq), parse_expr(lado_der))
            
            # Encuentra las variables de la ecuación
            variables = list(expresion_simbolica.free_symbols)
            
            if not variables:
                return "No se encontraron variables para resolver la ecuación."

            solucion = solve(expresion_simbolica, variables[0])

            if solucion:
                return f"Este es un problema de álgebra.\n\nSe resuelve la ecuación: ${expresion}$\n\nDespejando la variable se obtiene:\n$ {variables[0]} = {solucion[0]} $"
            else:
                return "La ecuación no tiene una solución obvia o es demasiado compleja."

        # Si es una operación aritmética simple
        else:
            expresion_simbolica = sympify(expresion)
            resultado = expresion_simbolica.evalf()
            
            # Convierte a entero si es un número entero.
            # Esta es la parte modificada para solucionar el problema del 4.000000
            if resultado.is_integer():
                resultado = int(resultado)
                
            return f"Este es un problema de aritmética.\n\nEl resultado de la operación ${expresion}$ es: ${resultado}$"
    except Exception as e:
        # Devuelve None si no puede resolverlo, para que el código principal
        # recurra a la API de OpenAI
        print(f"Error al resolver con SymPy: {e}")
        return None

@app.route('/api/resolver', methods=['POST'])
def resolver():
    data = request.get_json()
    expresion_original = data.get('expresion', '').strip()
    expresion_lower = expresion_original.lower()

    if not expresion_original:
        return jsonify({
            "explicacion": "❌ No se recibió ningún mensaje. Por favor, escribe algo para que pueda ayudarte."
        })
    
    # --- LÓGICA DE SALUDOS DIRECTOS (se mantiene para respuestas rápidas) ---
    greetings = ["hola", "qué tal", "buenos días", "buenas tardes", "buenas noches"]
    for greeting_phrase in greetings:
        if expresion_lower.startswith(greeting_phrase):
            return jsonify({
                "explicacion": "¡Hola! 👋 Soy un asistente diseñado para ayudarte con problemas matemáticos y analizar imágenes. ¿En qué puedo asistirte hoy?"
            })
    # --- FIN LÓGICA DE SALUDOS DIRECTOS ---

    # --- NUEVA LÓGICA DE RESOLUCIÓN LOCAL RÁPIDA ---
    if is_simple_math_problem(expresion_original):
        explicacion_local = solve_with_sympy(expresion_original)
        if explicacion_local:
            return jsonify({"explicacion": explicacion_local})
    # --- FIN LÓGICA DE RESOLUCIÓN LOCAL RÁPIDA ---

    messages_content = []
    
    # Define el comportamiento general del asistente
    system_instruction = (
        "Eres Match.IA, un asistente amigable y útil especializado en matemáticas. "
        "Tu objetivo principal es resolver problemas matemáticos y analizar imágenes que contengan ecuaciones o ejercicios. "
        "Cuando recibas una pregunta, por favor, sigue estas reglas estrictas:\n\n"
        "1.  **Clasificación de la Pregunta:** Determina si la pregunta está relacionada con matemáticas (álgebra, geometría, cálculo, aritmética, etc.) o si es una pregunta general/no matemática (saludo que no fue detectado, chiste, información histórica, etc.).\n"
        "2.  **Respuesta No Matemática:** Si la pregunta NO es un problema matemático, responde ÚNICAMENTE con el siguiente mensaje: "
        "'Lo siento, mi especialidad son las matemáticas y el análisis de problemas en imágenes. No puedo ayudarte con preguntas no relacionadas con las matemáticas. ¡Pregúntame un ejercicio y lo resolveremos!'. "
        "No intentes responder a la pregunta general.\n"
        "3.  **Detección de Tipo de Ejercicio (Matemático):** Si la pregunta ES un problema matemático, primero identifica y menciona claramente el tipo de ejercicio (ej. 'Este es un problema de álgebra lineal', 'Este es un ejercicio de cálculo integral', 'Parece ser un problema de geometría', 'Este es un problema verbal de aritmética').\n"
        "4.  **Resolución Paso a Paso:** Después de identificar el tipo, procede a resolver el ejercicio matemático paso a paso, explicando cada parte claramente. Utiliza formato LaTeX ($...$) para todas las expresiones matemáticas y ecuaciones para una mejor legibilidad.\n"
        "5.  **Análisis de Imagen:** Si se proporciona una imagen, concéntrate en extraer y resolver el problema matemático de la imagen. Si hay texto adicional del usuario con la imagen, úsalo como contexto para entender mejor el problema de la imagen.\n"
        "6.  **Claridad:** Sé conciso y directo en tus explicaciones."
    )

    messages_content.append({"type": "text", "text": system_instruction})

    # Detectar si la expresión original es una URL de imagen (sensible a mayúsculas)
    if expresion_original.startswith('http') and \
        any(ext in expresion_original for ext in ['.jpg', '.png', '.jpeg', '.gif']):
        
        # Separar la URL del posible texto adicional del usuario
        parts = expresion_original.split(' ', 1) 
        image_url = parts[0]
        user_text_context = parts[1] if len(parts) > 1 else "" 

        messages_content.append({
            "type": "image_url",
            "image_url": {
                "url": image_url
            }
        })
        # Incluye el contexto del usuario en la parte de texto
        messages_content.append({
            "type": "text",
            "text": f"Aquí está la imagen. Mi pregunta sobre la imagen es: '{user_text_context}'"
        })
    else:
        # Si es solo texto y no fue detectado como un saludo directo.
        messages_content.append({
            "type": "text",
            "text": expresion_original
        })

    openai_url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    body = {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": messages_content}],
        "max_tokens": 500,
        "temperature": 0.5
    }

    try:
        response = requests.post(openai_url, json=body, headers=headers)
        response.raise_for_status() 
        respuesta = response.json()
        explicacion = respuesta['choices'][0]['message']['content'].strip()

        return jsonify({
            "explicacion": explicacion
        })

    except requests.exceptions.HTTPError as errh:
        print(f"Error HTTP al conectar con OpenAI: {errh}")
        return jsonify({
            "explicacion": f"❌ Error HTTP al conectar con OpenAI: {str(errh)}. Asegúrate de que tu clave API sea válida y tengas conexión a internet."
        })
    except requests.exceptions.ConnectionError as errc:
        print(f"Error de Conexión al conectar con OpenAI: {errc}")
        return jsonify({
            "explicacion": f"❌ Error de conexión al intentar comunicarse con OpenAI: {str(errc)}. Revisa tu conexión a internet."
        })
    except requests.exceptions.Timeout as errt:
        print(f"Tiempo de espera agotado al conectar con OpenAI: {errt}")
        return jsonify({
            "explicacion": f"❌ La conexión a OpenAI tardó demasiado. Por favor, inténtalo de nuevo: {str(errt)}"
        })
    except requests.exceptions.RequestException as err:
        print(f"Error general de solicitud con OpenAI: {err}")
        return jsonify({
            "explicacion": f"❌ Ocurrió un error inesperado al procesar tu solicitud con OpenAI: {str(err)}"
        })
    except Exception as e:
        print(f"Error inesperado en el servidor: {e}")
        return jsonify({
            "explicacion": f"❌ Hubo un problema al procesar la solicitud. Detalles: {str(e)}"
        })

# La ruta /resolver-ecuacion ya no es necesaria, ya que la lógica fue integrada.
# Puedes eliminarla si lo deseas.

if __name__ == '__main__':
    app.run(debug=True)