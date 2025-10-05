// Studio 42 - Ollama Chat Interface
// Frontend Application Logic with Streaming TTS and STT

// State management
let conversations = [{ id: 1, title: 'New Chat', messages: [] }];
let currentConvId = 1;
let models = [];
let selectedModel = '';
let ollamaStatus = 'checking';
let uploadedImage = null;

// Settings
let temperature = 0.7;
let topP = 0.9;
let topK = 40;
let contextWindow = 4096;

// TTS/STT State
let ttsEnabled = false;
let ttsVoice = 'af_bella';
let ttsSpeed = 1.0;
let autoPlayResponses = true;
let currentAudio = null;
let ttsAvailable = false;
let voices = [];

// Speech Recognition
let recognition = null;
let isRecording = false;

// Sound Effects
let soundsEnabled = true;
let soundsInitialized = false;
const sounds = {};

// ==================== STREAMING TTS PLAYER ====================

class StreamingTTSPlayer {
    constructor() {
        this.audioQueue = [];
        this.isPlaying = false;
        this.currentAudio = null;
    }
    
    async playNext() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            console.log('✓ TTS playback complete');
            return;
        }
        
        this.isPlaying = true;
        const audioData = this.audioQueue.shift();
        
        this.currentAudio = new Audio(audioData);
        this.currentAudio.onended = () => this.playNext();
        this.currentAudio.onerror = (e) => {
            console.error('Audio playback error:', e);
            this.playNext();
        };
        
        try {
            await this.currentAudio.play();
        } catch (err) {
            console.error('Failed to play audio chunk:', err);
            this.playNext();
        }
    }
    
    addChunk(audioData) {
        this.audioQueue.push(audioData);
        if (!this.isPlaying) {
            this.playNext();
        }
    }
    
    stop() {
        this.audioQueue = [];
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.isPlaying = false;
    }
    
    getQueueLength() {
        return this.audioQueue.length;
    }
}

const ttsPlayer = new StreamingTTSPlayer();

// ==================== SOUND EFFECTS ====================

function initializeSounds() {
    if (soundsInitialized) return;
    
    try {
        sounds.beep = new Audio('/static/sounds/beep.wav');
        sounds.click = new Audio('/static/sounds/click.wav');
        sounds.error = new Audio('/static/sounds/error.wav');
        sounds.success = new Audio('/static/sounds/success.ogg');
        
        Object.keys(sounds).forEach(key => {
            sounds[key].preload = 'auto';
            sounds[key].volume = 0.3;
            
            sounds[key].addEventListener('error', (e) => {
                console.error(`Failed to load sound: ${key}`, e);
            });
            
            sounds[key].addEventListener('canplaythrough', () => {
                console.log(`✓ Sound loaded: ${key}`);
            }, { once: true });
        });
        
        soundsInitialized = true;
        console.log('✓ Sound effects initialized');
    } catch (error) {
        console.error('Failed to initialize sounds:', error);
    }
}

function playSound(soundName) {
    if (!soundsEnabled) return;
    
    if (!soundsInitialized) {
        initializeSounds();
    }
    
    const sound = sounds[soundName];
    if (!sound) {
        console.warn(`Sound not found: ${soundName}`);
        return;
    }
    
    try {
        const soundClone = sound.cloneNode();
        soundClone.volume = sound.volume;
        soundClone.play().catch(err => {
            console.warn(`Sound playback failed for ${soundName}:`, err.message);
        });
    } catch (error) {
        console.error(`Error playing sound ${soundName}:`, error);
    }
}

function toggleSounds(enabled) {
    soundsEnabled = enabled;
    console.log(`Sound effects ${enabled ? 'enabled' : 'disabled'}`);
    
    if (enabled && !soundsInitialized) {
        initializeSounds();
    }
}

function toggleTTS(enabled) {
    ttsEnabled = enabled;
    const ttsSettings = document.getElementById('ttsSettings');
    if (ttsSettings) {
        ttsSettings.style.display = enabled ? 'block' : 'none';
    }
    
    if (enabled && !ttsAvailable) {
        alert('⚠️ TTS not available. Install with:\npip install kokoro soundfile pydub');
        const ttsEnabledCheckbox = document.getElementById('ttsEnabled');
        if (ttsEnabledCheckbox) ttsEnabledCheckbox.checked = false;
        ttsEnabled = false;
    }
}

function toggleThinking(thinkId) {
    const content = document.getElementById(thinkId);
    const arrow = document.getElementById(thinkId + '-arrow');
    
    if (content && arrow) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
        playSound('click');
    }
}

// Make functions globally available
window.toggleSounds = toggleSounds;
window.toggleTTS = toggleTTS;
window.toggleThinking = toggleThinking;

// DOM Elements
let statusBadge, modelSelect, visionBadge, conversationList, messagesContainer;
let messageInput, sendBtn, newChatBtn, settingsBtn, settingsPanel;
let imageInput, imageUploadBtn, imagePreview, previewImage, removeImageBtn, micBtn;
let tempSlider, tempValue, topPSlider, topPValue, topKSlider, topKValue, contextSelect;
let ttsEnabledCheckbox, ttsSettings, voiceSelect, ttsSpeedSlider, ttsSpeedValue, autoPlayCheckbox;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Studio 42 Ollama Chat initializing...');
    
    initializeDOMElements();
    checkOllamaStatus();
    checkTTSStatus();
    setupEventListeners();
    setupSettingsListeners();
    setupTTSListeners();
    initSpeechRecognition();
    renderConversations();
    
    document.addEventListener('click', initializeSounds, { once: true });
    
    console.log('✓ Initialization complete');
});

function initializeDOMElements() {
    statusBadge = document.getElementById('statusBadge');
    modelSelect = document.getElementById('modelSelect');
    visionBadge = document.getElementById('visionBadge');
    conversationList = document.getElementById('conversationList');
    messagesContainer = document.getElementById('messagesContainer');
    messageInput = document.getElementById('messageInput');
    sendBtn = document.getElementById('sendBtn');
    newChatBtn = document.getElementById('newChatBtn');
    settingsBtn = document.getElementById('settingsBtn');
    settingsPanel = document.getElementById('settingsPanel');
    imageInput = document.getElementById('imageInput');
    imageUploadBtn = document.getElementById('imageUploadBtn');
    imagePreview = document.getElementById('imagePreview');
    previewImage = document.getElementById('previewImage');
    removeImageBtn = document.getElementById('removeImageBtn');
    micBtn = document.getElementById('micBtn');
    tempSlider = document.getElementById('tempSlider');
    tempValue = document.getElementById('tempValue');
    topPSlider = document.getElementById('topPSlider');
    topPValue = document.getElementById('topPValue');
    topKSlider = document.getElementById('topKSlider');
    topKValue = document.getElementById('topKValue');
    contextSelect = document.getElementById('contextSelect');
    ttsEnabledCheckbox = document.getElementById('ttsEnabled');
    ttsSettings = document.getElementById('ttsSettings');
    voiceSelect = document.getElementById('voiceSelect');
    ttsSpeedSlider = document.getElementById('ttsSpeed');
    ttsSpeedValue = document.getElementById('ttsSpeedValue');
    autoPlayCheckbox = document.getElementById('autoPlay');
}

// ==================== MESSAGE PARSING ====================

function parseThinkingContent(text) {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    const thoughts = [];
    let match;
    let cleanedText = text;
    
    while ((match = thinkRegex.exec(text)) !== null) {
        thoughts.push(match[1].trim());
        cleanedText = cleanedText.replace(match[0], '');
    }
    
    return {
        thoughts: thoughts,
        content: cleanedText.trim()
    };
}

function createThinkingBubble(thoughts, isComplete = true) {
    const thinkId = 'think-' + Date.now();
    const label = isComplete ? '💭 Thought' : '🤔 Thinking...';
    
    const html = `
        <div class="thinking-bubble" style="margin-bottom: 10px;">
            <div class="thinking-toggle" onclick="window.toggleThinking('${thinkId}')" style="
                background: rgba(153, 102, 204, 0.2);
                border: 2px solid #9966cc;
                border-radius: 10px;
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.85em;
                color: #9966cc;
                user-select: none;
            ">
                <span id="${thinkId}-arrow" style="transition: transform 0.3s;">▶</span>
                <span>${label}</span>
            </div>
            <div id="${thinkId}" class="thinking-content" style="
                display: none;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #9966cc;
                border-radius: 8px;
                padding: 12px;
                margin-top: 8px;
                font-size: 0.85em;
                color: #9966cc;
                white-space: pre-wrap;
                max-height: 300px;
                overflow-y: auto;
            ">${escapeHtml(thoughts.join('\n\n'))}</div>
        </div>
    `;
    
    return html;
}

// ==================== TTS FUNCTIONS ====================

async function checkTTSStatus() {
    try {
        const response = await fetch('/api/tts/status');
        const data = await response.json();
        ttsAvailable = data.available;
        
        if (ttsAvailable) {
            console.log('✓ TTS available:', data.engine);
            await loadVoices();
        } else {
            console.log('⚠ TTS not available');
            if (ttsEnabledCheckbox) {
                ttsEnabledCheckbox.disabled = true;
                ttsEnabledCheckbox.parentElement.title = 'TTS not installed (pip install kokoro soundfile pydub)';
            }
        }
    } catch (error) {
        console.error('TTS check failed:', error);
        ttsAvailable = false;
    }
}

async function loadVoices() {
    try {
        const response = await fetch('/api/tts/voices');
        const data = await response.json();
        voices = data.voices || [];
        
        if (voiceSelect) {
            voiceSelect.innerHTML = '';
            voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.id;
                option.textContent = `${voice.name} (${voice.accent} ${voice.gender})`;
                voiceSelect.appendChild(option);
            });
        }
        
        console.log(`✓ Loaded ${voices.length} voices`);
    } catch (error) {
        console.error('Failed to load voices:', error);
    }
}

function setupTTSListeners() {
    if (ttsSpeedSlider) {
        ttsSpeedSlider.addEventListener('input', (e) => {
            ttsSpeed = parseFloat(e.target.value);
            if (ttsSpeedValue) ttsSpeedValue.textContent = ttsSpeed.toFixed(1);
        });
    }
    
    if (voiceSelect) {
        voiceSelect.addEventListener('change', (e) => {
            ttsVoice = e.target.value;
        });
    }
    
    if (autoPlayCheckbox) {
        autoPlayCheckbox.addEventListener('change', (e) => {
            autoPlayResponses = e.target.checked;
        });
    }
}

function cleanTextForTTS(text) {
    return text
        .replace(/\*\*/g, '')
        .replace(/\n\d+\.\s+/g, '. ')
        .replace(/\n+/g, '. ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function speakText(text) {
    if (!ttsEnabled || !ttsAvailable || !text) return;
    
    // Stop any currently playing audio
    ttsPlayer.stop();
    
    try {
        const cleanedText = cleanTextForTTS(text);
        
        console.log(`🎤 Starting TTS stream for ${cleanedText.length} chars...`);
        
        const response = await fetch('/api/tts/speak/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: cleanedText.substring(0, 5000),
                voice: ttsVoice,
                speed: ttsSpeed
            })
        });
        
        if (!response.ok) {
            throw new Error(`TTS failed: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.error) {
                            console.error('TTS streaming error:', data.error);
                            break;
                        }
                        
                        if (data.chunk) {
                            // Add Opus audio chunk to queue for immediate playback
                            ttsPlayer.addChunk(`data:audio/ogg;base64,${data.chunk}`);
                            console.log(`🔊 TTS chunk ${data.index} queued (queue: ${ttsPlayer.getQueueLength()})`);
                        }
                        
                        if (data.done) {
                            console.log(`✓ TTS streaming complete: ${data.total_chunks} chunks`);
                        }
                    } catch (e) {
                        console.error('Failed to parse TTS chunk:', e);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('TTS streaming error:', error);
    }
}

// ==================== SPEECH RECOGNITION ====================

function initSpeechRecognition() {
    if (!micBtn) {
        console.warn('⚠ Microphone button not found');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn('⚠ Speech Recognition not supported in this browser');
        micBtn.disabled = true;
        micBtn.title = 'Speech recognition not supported in this browser';
        micBtn.style.opacity = '0.5';
        return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add('recording');
        playSound('beep');
        console.log('🎤 Recording started...');
    };
    
    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove('recording');
        playSound('click');
        console.log('🎤 Recording stopped');
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('Recognized:', transcript);
        
        if (messageInput) {
            const currentText = messageInput.value;
            messageInput.value = currentText ? `${currentText} ${transcript}` : transcript;
            messageInput.focus();
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        isRecording = false;
        micBtn.classList.remove('recording');
        
        if (event.error === 'no-speech') {
            console.log('No speech detected');
        } else if (event.error === 'not-allowed') {
            alert('⚠️ Microphone access denied. Please allow microphone access in your browser settings.');
        }
    };
    
    micBtn.addEventListener('mousedown', startRecording);
    micBtn.addEventListener('mouseup', stopRecording);
    micBtn.addEventListener('mouseleave', stopRecording);
    micBtn.addEventListener('touchstart', startRecording);
    micBtn.addEventListener('touchend', stopRecording);
    
    console.log('✓ Speech recognition initialized');
}

function startRecording(e) {
    e.preventDefault();
    if (!recognition || isRecording) return;
    
    try {
        recognition.start();
    } catch (error) {
        console.error('Failed to start recognition:', error);
    }
}

function stopRecording(e) {
    e.preventDefault();
    if (!recognition || !isRecording) return;
    
    try {
        recognition.stop();
    } catch (error) {
        console.error('Failed to stop recognition:', error);
    }
}

// ==================== OLLAMA FUNCTIONS ====================

async function checkOllamaStatus() {
    try {
        const response = await fetch('/api/ollama/status');
        if (response.ok) {
            const data = await response.json();
            models = data.models || [];
            ollamaStatus = 'online';
            
            updateStatusBadge('online');
            updateModelSelect();
            
            const visionModel = models.find(m => 
                m.name.includes('llava') || 
                m.name.includes('vision') || 
                m.name.includes('llama3.2')
            );
            selectedModel = visionModel?.name || models[0]?.name || '';
            
            if (selectedModel && modelSelect) {
                modelSelect.value = selectedModel;
                updateVisionBadge();
            }
            
            updateInfoBox();
            console.log(`✓ Ollama online: ${models.length} models available`);
        } else {
            throw new Error('Ollama returned error response');
        }
    } catch (error) {
        console.error('✗ Ollama check failed:', error);
        ollamaStatus = 'offline';
        updateStatusBadge('offline');
        updateInfoBox();
        if (modelSelect) {
            modelSelect.innerHTML = '<option>⚠️ Ollama offline - Start with: ollama serve</option>';
        }
    }
}

function updateStatusBadge(status) {
    if (statusBadge) {
        statusBadge.className = `status-badge status-${status}`;
        statusBadge.innerHTML = status === 'online' ? '⚡ ONLINE' : '✗ OFFLINE';
    }
}

function updateModelSelect() {
    if (!modelSelect) return;
    
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        const isVision = model.name.includes('vision') || model.name.includes('llava');
        option.textContent = `${model.name} ${isVision ? '🖼️' : ''}`;
        modelSelect.appendChild(option);
    });
}

function updateVisionBadge() {
    if (!visionBadge || !imageUploadBtn) return;
    
    const isVision = selectedModel.includes('llava') || 
                     selectedModel.includes('vision') || 
                     selectedModel.includes('llama3.2');
    visionBadge.style.display = isVision ? 'block' : 'none';
    imageUploadBtn.style.display = isVision ? 'block' : 'none';
}

function updateInfoBox() {
    const modelCount = document.getElementById('modelCount');
    const activeModel = document.getElementById('activeModel');
    const statusInfo = document.getElementById('statusInfo');
    
    if (modelCount) modelCount.textContent = models.length;
    if (activeModel) activeModel.textContent = selectedModel || 'None';
    if (statusInfo) statusInfo.textContent = ollamaStatus;
}

function setupEventListeners() {
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            playSound('beep');
            sendMessage();
        });
    }
    
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                playSound('beep');
                sendMessage();
            }
        });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            playSound('click');
            createNewChat();
        });
    }

    if (settingsBtn && settingsPanel) {
        settingsBtn.addEventListener('click', () => {
            playSound('click');
            const isVisible = settingsPanel.style.display !== 'none';
            settingsPanel.style.display = isVisible ? 'none' : 'block';
        });
    }

    if (modelSelect) {
        modelSelect.addEventListener('change', (e) => {
            playSound('click');
            selectedModel = e.target.value;
            updateVisionBadge();
            updateInfoBox();
            console.log(`Model switched to: ${selectedModel}`);
        });
    }

    if (imageUploadBtn && imageInput) {
        imageUploadBtn.addEventListener('click', () => {
            playSound('click');
            imageInput.click();
        });
        imageInput.addEventListener('change', handleImageUpload);
    }
    
    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            playSound('click');
            clearImage();
        });
    }
}

function setupSettingsListeners() {
    if (tempSlider && tempValue) {
        tempSlider.addEventListener('input', (e) => {
            temperature = parseFloat(e.target.value);
            tempValue.textContent = temperature;
        });
    }

    if (topPSlider && topPValue) {
        topPSlider.addEventListener('input', (e) => {
            topP = parseFloat(e.target.value);
            topPValue.textContent = topP;
        });
    }

    if (topKSlider && topKValue) {
        topKSlider.addEventListener('input', (e) => {
            topK = parseInt(e.target.value);
            topKValue.textContent = topK;
        });
    }

    if (contextSelect) {
        contextSelect.addEventListener('change', (e) => {
            contextWindow = parseInt(e.target.value);
        });
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            playSound('error');
            alert('⚠️ Please upload an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage = e.target.result;
            if (previewImage && imagePreview) {
                previewImage.src = uploadedImage;
                imagePreview.style.display = 'block';
                playSound('success');
            }
            console.log('✓ Image uploaded');
        };
        reader.readAsDataURL(file);
    }
}

function clearImage() {
    uploadedImage = null;
    if (imagePreview && imageInput) {
        imagePreview.style.display = 'none';
        imageInput.value = '';
    }
}

function createNewChat() {
    const newId = Math.max(...conversations.map(c => c.id)) + 1;
    conversations.push({ id: newId, title: 'New Chat', messages: [] });
    currentConvId = newId;
    renderConversations();
    renderMessages();
    console.log(`Created new chat: ${newId}`);
}

function deleteConversation(id) {
    if (conversations.length === 1) {
        alert('⚠️ Cannot delete the last conversation');
        return;
    }
    conversations = conversations.filter(c => c.id !== id);
    if (currentConvId === id) {
        currentConvId = conversations[0].id;
    }
    renderConversations();
    renderMessages();
}

function renderConversations() {
    if (!conversationList) return;
    
    conversationList.innerHTML = '';
    conversations.forEach(conv => {
        const div = document.createElement('div');
        div.className = `conversation-item ${conv.id === currentConvId ? 'active' : ''}`;
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                <span>💬</span>
                <span style="font-size: 0.85em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${conv.title}
                </span>
            </div>
            ${conversations.length > 1 ? `<span class="delete-btn" style="cursor: pointer; color: #ff3366; font-size: 1.2em;">🗑️</span>` : ''}
        `;
        
        div.onclick = (e) => {
            if (e.target.classList.contains('delete-btn')) {
                playSound('error');
                deleteConversation(conv.id);
            } else {
                playSound('click');
                currentConvId = conv.id;
                renderConversations();
                renderMessages();
            }
        };
        
        conversationList.appendChild(div);
    });
}

function renderMessages() {
    if (!messagesContainer) return;
    
    const currentConv = conversations.find(c => c.id === currentConvId);
    messagesContainer.innerHTML = '';

    if (currentConv.messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 3em; margin-bottom: 20px; opacity: 0.5;">🌙</div>
                <div>Start a conversation with Ollama</div>
                <div style="font-size: 0.7em; margin-top: 10px; opacity: 0.7;">
                    Don't Panic! Just type your message below.
                </div>
            </div>
        `;
        return;
    }

    currentConv.messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role}`;
        
        let imageHtml = '';
        if (msg.image) {
            imageHtml = `<img src="${msg.image}" class="message-image" alt="uploaded">`;
        }

        let thinkingHtml = '';
        let messageContent = msg.content;
        
        if (msg.role === 'assistant') {
            const parsed = parseThinkingContent(msg.content);
            if (parsed.thoughts.length > 0) {
                thinkingHtml = createThinkingBubble(parsed.thoughts, true);
            }
            messageContent = parsed.content;
        }

        messageDiv.innerHTML = `
            <div class="message-bubble">
                ${imageHtml}
                ${thinkingHtml}
                <div style="white-space: pre-wrap;">${escapeHtml(messageContent)}</div>
                <div class="message-meta">
                    ${new Date(msg.timestamp).toLocaleTimeString()}
                    ${msg.model ? ` • ${msg.model}` : ''}
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(messageDiv);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    if (!messageInput) return;
    
    const input = messageInput.value.trim();
    
    if (!input && !uploadedImage) return;

    if (ollamaStatus !== 'online') {
        alert('⚠️ Ollama is offline. Please start Ollama server with: ollama serve');
        return;
    }

    if (!selectedModel) {
        alert('⚠️ Please select a model');
        return;
    }

    const userMessage = {
        role: 'user',
        content: input,
        image: uploadedImage,
        timestamp: new Date().toISOString()
    };

    const currentConv = conversations.find(c => c.id === currentConvId);
    
    if (currentConv.messages.length === 0 && input) {
        currentConv.title = input.substring(0, 30) + (input.length > 30 ? '...' : '');
    }

    currentConv.messages.push(userMessage);
    messageInput.value = '';
    clearImage();
    renderConversations();
    renderMessages();

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.innerHTML = `
        <div class="message-bubble">
            <div class="loading-indicator">
                <span class="loading-dot">●</span>
                <span class="loading-dot">●</span>
                <span class="loading-dot">●</span>
            </div>
        </div>
    `;
    if (messagesContainer) {
        messagesContainer.appendChild(loadingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '⏳ SENDING...';
    }

    try {
        const ollamaMessages = currentConv.messages.map(msg => {
            const ollamaMsg = {
                role: msg.role,
                content: msg.content
            };
            
            if (msg.image && msg.role === 'user') {
                const base64Data = msg.image.split(',')[1];
                ollamaMsg.images = [base64Data];
            }
            
            return ollamaMsg;
        });

        console.log('Sending to Ollama:', {
            model: selectedModel,
            messageCount: ollamaMessages.length,
            hasImages: ollamaMessages.some(m => m.images)
        });

        const response = await fetch('/api/ollama/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: ollamaMessages,
                stream: false,
                options: {
                    temperature: temperature,
                    top_p: topP,
                    top_k: topK,
                    num_ctx: contextWindow
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.message) {
            const assistantMessage = {
                role: 'assistant',
                content: data.message.content,
                timestamp: new Date().toISOString(),
                model: selectedModel
            };

            currentConv.messages.push(assistantMessage);
            console.log('✓ Response received');
            
            playSound('success');
            
            // Speak the content (not thinking tags)
            if (ttsEnabled && autoPlayResponses) {
                const parsed = parseThinkingContent(assistantMessage.content);
                if (parsed.content) {
                    speakText(parsed.content);
                }
            }
        } else {
            throw new Error('No message in response');
        }

    } catch (error) {
        console.error('✗ Chat error:', error);
        playSound('error');
        alert(`✗ Failed to get response: ${error.message}\n\nMake sure Ollama is running: ollama serve`);
        currentConv.messages.pop();
    } finally {
        loadingDiv.remove();
        
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '➤ SEND';
        }
        
        renderConversations();
        renderMessages();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('Studio 42 Ollama Chat loaded ✓');
console.log('Don\'t Panic! 🌟');