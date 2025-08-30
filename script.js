// script.js

// Importaciones de Firebase (deben ir al principio si el archivo es un módulo)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAo325hrKgKqntm_dak8OvO8wmVR4WvrNA",
    authDomain: "pruebaimg-f6ce6.firebaseapp.com",
    projectId: "pruebaimg-f6ce6",
    storageBucket: "pruebaimg-f6ce6.firebasestorage.app",
    messagingSenderId: "924488543285",
    appId: "1:924488543285:web:bf8a7c9f902d291c6d157c",
    measurementId: "G-3XRGM0W9N3"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

// --- Elementos del DOM para el Chat ---
const form = document.getElementById('calc-form');
const inputEditableDiv = document.getElementById('user-input-editable');
const chatMessagesContainer = document.getElementById('chat-messages');
const placeholder = document.getElementById('placeholder');
const newChatBtn = document.getElementById('new-chat');

// --- Elementos del DOM para la Carga de Archivos ---
const fileInput = document.getElementById('file-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const previewImageElement = document.getElementById('preview-image');
const removeImagePreviewBtn = document.getElementById('remove-image-preview');

// --- Elementos del DOM para el Tema ---
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const body = document.body;

let selectedFile = null;

// --- Funciones del Chat ---
function addMessage(text, sender, isImage = false, imageUrl = null, isThumbnail = false) {
    const msg = document.createElement('div');
    msg.classList.add('message', sender);

    if (isImage && imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;

        if (isThumbnail) {
            img.style.maxWidth = '100px';
            img.style.maxHeight = '100px';
            img.style.objectFit = 'contain';
            img.style.marginRight = '8px';
            img.style.verticalAlign = 'middle';
            img.style.border = '1px solid #ddd';
            img.style.padding = '2px';
            img.style.borderRadius = '4px';
        } else {
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
        }
        msg.appendChild(img);

        if (text && !(sender === 'bot' && text.startsWith('http'))) {
            const textSpan = document.createElement('span');
            textSpan.innerHTML = text;
            msg.appendChild(textSpan);
            MathJax.typesetPromise([textSpan]);
        }

    } else {
        if (sender === 'bot' && text.startsWith('http') && (text.includes('.jpg') || text.includes('.png') || text.includes('.jpeg') || text.includes('.gif'))) {
            const img = document.createElement('img');
            img.src = text;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            msg.appendChild(img);
        } else {
            msg.innerHTML = text;
            MathJax.typesetPromise([msg]);
        }
    }

    chatMessagesContainer.appendChild(msg);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    updatePlaceholderVisibility();
}

function updatePlaceholderVisibility() {
    if (
        chatMessagesContainer.children.length === 1 &&
        chatMessagesContainer.querySelector('.placeholder') &&
        inputEditableDiv.textContent.trim() === '' &&
        selectedFile === null
    ) {
        placeholder.style.opacity = '1';
    } else {
        placeholder.style.opacity = '0';
    }
}

async function getBotResponse(question, type = 'texto') {
    addMessage('⌛ Procesando...', 'bot');

    const cleanQuestion = question.toLowerCase().trim();
    const isGreeting = ['hola', 'saludos', 'que tal', 'hey', 'hello'].includes(cleanQuestion);

    // Check for general questions that aren't math-related
    // This is a simplified check for demo purposes.
    const isMathQuestion =
        cleanQuestion.includes('ecuacion') ||
        cleanQuestion.includes('álgebra') ||
        cleanQuestion.includes('geometria') ||
        cleanQuestion.includes('cálculo') ||
        cleanQuestion.includes('matemáticas') ||
        cleanQuestion.includes('problema') ||
        cleanQuestion.includes('cuadrática') ||
        cleanQuestion.includes('derivar') ||
        cleanQuestion.includes('integrar') ||
        // Check for common math symbols
        /[0-9+\-*/=^x()√π]/.test(cleanQuestion);

    const lastBotMessage = chatMessagesContainer.querySelector('.message.bot:last-child');
    if (lastBotMessage && lastBotMessage.textContent.includes('⌛ Procesando...')) {
        lastBotMessage.remove();
    }

    // Handle greetings
    if (isGreeting) {
        const greetingResponse = "¡Hola! Soy Match.IA, un asistente amigable y útil especializado en matemáticas. Mi objetivo principal es resolver problemas matemáticos y analizar imágenes que contengan ecuaciones o ejercicios. No puedo ayudarte con preguntas no relacionadas con las matemáticas. ¡Pregúntame un ejercicio y lo resolveremos!";
        addMessage(greetingResponse, 'bot');
        return;
    }

    // Handle non-math questions based on the prompt's strict rules
    if (type === 'texto' && !isMathQuestion) {
        const cannedResponse = 'Lo siento, mi especialidad son las matemáticas y el análisis de problemas en imágenes. No puedo ayudarte con preguntas no relacionadas con las matemáticas. ¡Pregúntame un ejercicio y lo resolveremos!';
        addMessage(cannedResponse, 'bot');
        return;
    }

    // If it's a math question or an image, proceed with the original logic
    try {
        const response = await fetch('http://localhost:5000/api/resolver', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                expresion: question,
                tipo: type
            })
        });

        const data = await response.json();
        addMessage(`${data.explicacion}`, 'bot');

    } catch (error) {
        console.error('Error al obtener respuesta:', error);
        addMessage('❌ Error al conectar con el servidor.', 'bot error');
    }
}

async function uploadImageToFirebase(file) {
    const uniqueFileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, 'images/' + uniqueFileName);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload is ' + progress + '% done');
            },
            (error) => {
                reject(error);
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    resolve(downloadURL);
                });
            }
        );
    });
}

// --- Event Listeners ---
form.addEventListener('submit', async e => {
    e.preventDefault();
    const question = inputEditableDiv.textContent.trim();

    // Oculta y limpia la previsualización al enviar el formulario
    if (imagePreviewContainer) {
        imagePreviewContainer.style.display = 'none';
        previewImageElement.src = '#';
    }

    if (selectedFile) {
        try {
            // Muestra el mensaje final del usuario (imagen y texto si lo hay)
            addMessage(question, 'user', true, URL.createObjectURL(selectedFile), false);

            addMessage('⌛ Subiendo imagen...', 'bot');

            const downloadURL = await uploadImageToFirebase(selectedFile);

            // Elimina el mensaje temporal de "Subiendo imagen..."
            const lastBotUploadMessage = chatMessagesContainer.querySelector('.message.bot:last-child');
            if (lastBotUploadMessage && lastBotUploadMessage.textContent.includes('⌛ Subiendo imagen...')) {
                lastBotUploadMessage.remove();
            }

            addMessage(`✅ Imagen subida con éxito. Se procederá a examinarla.`, 'bot');
            getBotResponse(downloadURL, 'imagen'); // Envía la URL de la imagen al backend
        } catch (error) {
            console.error('Error al subir la imagen:', error);
            const lastBotUploadMessage = chatMessagesContainer.querySelector('.message.bot:last-child');
            if (lastBotUploadMessage && lastBotUploadMessage.textContent.includes('⌛ Subiendo imagen...')) {
                lastBotUploadMessage.remove();
            }
            addMessage(`❌ Error al subir la imagen: ${error.message}`, 'bot error');
        } finally {
            selectedFile = null;
            fileInput.value = '';
            inputEditableDiv.textContent = '';
            updatePlaceholderVisibility();
            inputEditableDiv.focus();
        }
    } else if (question) {
        addMessage(question, 'user');
        inputEditableDiv.textContent = '';
        updatePlaceholderVisibility();
        inputEditableDiv.focus();
        getBotResponse(question, 'texto');
    }
});

// --- Nuevo Evento para la tecla Enter ---
inputEditableDiv.addEventListener('keydown', e => {
    // 13 es el código de la tecla 'Enter'
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Evita el salto de línea por defecto
        form.dispatchEvent(new Event('submit')); // Dispara el evento 'submit' del formulario
    }
});

inputEditableDiv.addEventListener('input', () => {
    if (inputEditableDiv.textContent.trim() !== '' || selectedFile !== null) {
        placeholder.style.opacity = '0';
    } else {
        if (
            chatMessagesContainer.children.length === 1 &&
            chatMessagesContainer.querySelector('.placeholder')
        ) {
            placeholder.style.opacity = '1';
        }
    }
});

newChatBtn.addEventListener('click', () => {
    chatMessagesContainer.innerHTML = '';
    chatMessagesContainer.appendChild(placeholder);
    placeholder.style.opacity = '1';
    inputEditableDiv.textContent = '';
    selectedFile = null;
    fileInput.value = '';

    if (imagePreviewContainer) {
        imagePreviewContainer.style.display = 'none';
        previewImageElement.src = '#';
    }
    inputEditableDiv.focus();
});

fileInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files.length > 0 ? event.target.files.item(0) : null;

    if (file) {
        selectedFile = file;
        console.log("Archivo seleccionado:", file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            previewImageElement.src = imageUrl;
            imagePreviewContainer.style.display = 'inline-block';

            if (inputEditableDiv.firstChild !== imagePreviewContainer) {
                inputEditableDiv.prepend(imagePreviewContainer);
            }

            placeholder.style.opacity = '0';
            inputEditableDiv.focus();
        };
        reader.onerror = (error) => {
            console.error("Error al leer el archivo:", error);
            selectedFile = null;
            fileInput.value = '';
            imagePreviewContainer.style.display = 'none';
            previewImageElement.src = '#';
            updatePlaceholderVisibility();
        };
        reader.readAsDataURL(file);
    } else {
        selectedFile = null;
        imagePreviewContainer.style.display = 'none';
        previewImageElement.src = '#';
        updatePlaceholderVisibility();
    }
});

removeImagePreviewBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    imagePreviewContainer.style.display = 'none';
    previewImageElement.src = '#';
    updatePlaceholderVisibility();
    inputEditableDiv.focus();
});

// --- Nuevo Listener para el Tema ---
themeToggleBtn.addEventListener('click', () => {
    if (body.getAttribute('data-theme') === 'light') {
        body.setAttribute('data-theme', 'dark');
        themeToggleBtn.textContent = '☀️ Modo Claro';
    } else {
        body.setAttribute('data-theme', 'light');
        themeToggleBtn.textContent = '🌙 Modo Oscuro';
    }
});


// Inicialización al cargar la página
updatePlaceholderVisibility();