// Studio 42 - Ollama Chat Interface
// Complete Frontend Application with Music Player, TTS, and STT

// ==================== STATE MANAGEMENT ====================

// Chat State
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
let isTTSGenerating = false;

// Speech Recognition
let recognition = null;
let isRecording = false;

// Sound Effects
let soundsEnabled = true;
let soundsInitialized = false;
const sounds = {};

// Thinking bubble counter for unique IDs
let thinkingBubbleCounter = 0;

// Music Player State
const musicPlayer = {
    playlist: [],
    currentIndex: -1,
    isPlaying: false,
    volume: 0.7,
    isMuted: false,
    shuffle: false,
    repeat: 'none',
    audio: new Audio(),
    isExpanded: false
};

// ==================== DOM ELEMENTS ====================

let statusBadge, modelSelect, visionBadge, conversationList, messagesContainer;
let messageInput, sendBtn, newChatBtn, settingsBtn, settingsPanel;
let imageInput, imageUploadBtn, imagePreview, previewImage, removeImageBtn, micBtn;
let tempSlider, tempValue, topPSlider, topPValue, topKSlider, topKValue, contextSelect;
let ttsEnabledCheckbox, ttsSettings, voiceSelect, ttsSpeedSlider, ttsSpeedValue, autoPlayCheckbox;

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
    thinkingBubbleCounter++;
    const thinkId = 'think-' + thinkingBubbleCounter;
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

function toggleThinking(thinkId) {
    const content = document.getElementById(thinkId);
    const arrow = document.getElementById(thinkId + '-arrow');
    
    if (content && arrow) {
        const isHidden = content.style.display === 'none';
        content.style.display = isHidden ? 'block' : 'none';
        arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
        playSound('click');
    } else {
        console.warn(`Thinking bubble not found: ${thinkId}`);
    }
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
                ttsEnabledCheckbox.parentElement.title = 'TTS not installed (pip install kokoro soundfile)';
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

function toggleTTS(enabled) {
    ttsEnabled = enabled;
    if (ttsSettings) {
        ttsSettings.style.display = enabled ? 'block' : 'none';
    }
    
    if (enabled && !ttsAvailable) {
        alert('⚠️ TTS not available. Install with:\npip install kokoro soundfile');
        if (ttsEnabledCheckbox) ttsEnabledCheckbox.checked = false;
        ttsEnabled = false;
    }
}

async function speakText(text) {
    if (!ttsEnabled || !ttsAvailable || !text) return;
    
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    
    const cleanText = text.trim();
    if (!cleanText) return;
    
    isTTSGenerating = true;
    updateTTSStatus('Generating speech...', true);
    
    try {
        // Don't split into sentences - just send the full text
        // Limit to 8000 characters for TTS
        let fullText = cleanText.substring(0, 8000);
        
        if (cleanText.length > 8000) {
            console.warn('Text truncated for TTS:', cleanText.length, '→ 8000 chars');
        }
        
        console.log('TTS: Sending', fullText.length, 'characters to backend');
        
        const response = await fetch('/api/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: fullText,
                voice: ttsVoice,
                speed: ttsSpeed
            })
        });
        
        if (!response.ok) {
            throw new Error(`TTS failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.audio) {
            currentAudio = new Audio(data.audio);
            
            currentAudio.onloadeddata = () => {
                updateTTSStatus('Playing...', true);
                console.log('TTS: Audio loaded, duration:', data.duration.toFixed(1), 'seconds');
            };
            
            currentAudio.onended = () => {
                isTTSGenerating = false;
                updateTTSStatus('');
                console.log('TTS: Playback finished');
            };
            
            currentAudio.onerror = (e) => {
                isTTSGenerating = false;
                updateTTSStatus('');
                console.error('TTS Audio playback error:', e);
            };
            
            await currentAudio.play();
            console.log(`✓ TTS playing: ${data.duration.toFixed(1)}s for ${data.text_length} chars`);
        }
    } catch (error) {
        console.error('TTS error:', error);
        isTTSGenerating = false;
        updateTTSStatus('TTS failed', false);
        setTimeout(() => updateTTSStatus(''), 3000);
    }
}

function splitIntoSentences(text) {
    // Don't split at all - just return the full text
    // The regex was causing issues with special characters
    return [text];
}

function updateTTSStatus(message, isActive = false) {
    const statusBadge = document.getElementById('statusBadge');
    if (!statusBadge || !message) {
        if (statusBadge && !isActive) {
            statusBadge.className = `status-badge status-${ollamaStatus}`;
            statusBadge.innerHTML = ollamaStatus === 'online' ? '⚡ ONLINE' : '✗ OFFLINE';
        }
        return;
    }
    
    if (isActive) {
        statusBadge.className = 'status-badge status-checking';
        statusBadge.innerHTML = `🗣️ ${message}`;
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

// ==================== MUSIC PLAYER ====================

function loadPlaylist() {
    const saved = localStorage.getItem('studio42_playlist');
    if (saved) {
        try {
            musicPlayer.playlist = JSON.parse(saved);
            console.log(`✓ Loaded ${musicPlayer.playlist.length} tracks from playlist`);
        } catch (e) {
            console.error('Failed to load playlist:', e);
        }
    }
}

function savePlaylist() {
    localStorage.setItem('studio42_playlist', JSON.stringify(musicPlayer.playlist));
}

function detectUrlType(url) {
    const lowerUrl = url.toLowerCase();
    
    // Check for audio file extensions
    if (lowerUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac|opus)(\?.*)?$/i)) {
        console.log('Detected as audio file (extension match)');
        return 'audio';
    }
    
    // Check for streaming services
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
        console.log('Detected as YouTube');
        return 'youtube';
    }
    if (lowerUrl.includes('soundcloud.com')) {
        console.log('Detected as SoundCloud');
        return 'soundcloud';
    }
    if (lowerUrl.includes('suno.com') || lowerUrl.includes('suno.ai')) {
        console.log('Detected as Suno');
        return 'suno';
    }
    if (lowerUrl.includes('udio.com')) {
        console.log('Detected as Udio');
        return 'udio';
    }
    
    // Check for common audio streaming patterns
    if (lowerUrl.includes('stream') || lowerUrl.includes('audio') || lowerUrl.includes('music')) {
        console.log('Detected as audio (pattern match)');
        return 'audio';
    }
    
    // Default to audio and let the browser try
    console.log('Defaulting to audio type');
    return 'audio';
}

function addTrackToPlaylist(title, artist, url) {
    if (!url.trim()) {
        alert('⚠️ Please enter a URL');
        return false;
    }

    // Validate and clean URL
    let cleanUrl = url.trim();
    
    // Add https:// if no protocol specified
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        console.log('Adding https:// to URL');
        cleanUrl = 'https://' + cleanUrl;
    }
    
    console.log('═══════════════════════════════════');
    console.log('➕ ADDING TRACK');
    console.log('URL (original):', url);
    console.log('URL (cleaned):', cleanUrl);
    
    const detectedType = detectUrlType(cleanUrl);
    console.log('Detected type:', detectedType);

    const track = {
        id: Date.now(),
        title: title.trim() || 'Unknown Title',
        artist: artist.trim() || 'Unknown Artist',
        url: cleanUrl,
        type: detectedType,
        added: new Date().toISOString()
    };
    
    console.log('Track object:', track);
    console.log('═══════════════════════════════════');

    musicPlayer.playlist.push(track);
    savePlaylist();
    renderPlaylist();
    
    playSound('success');
    
    // Show user what was detected
    let msg = `✓ Track Added!\n\n`;
    msg += `Title: ${track.title}\n`;
    msg += `Artist: ${track.artist}\n`;
    msg += `Type: ${track.type.toUpperCase()}\n\n`;
    
    if (track.type === 'audio') {
        msg += `This will play directly in the music player.`;
    } else {
        msg += `This will open in a new tab when played.`;
    }
    
    console.log(msg);
    
    // Auto-play first track
    if (musicPlayer.playlist.length === 1) {
        console.log('This is the first track, auto-playing in 500ms...');
        setTimeout(() => {
            console.log('Auto-play triggered');
            playTrack(0);
        }, 500);
    }
    
    return true;
}

function removeTrack(id) {
    musicPlayer.playlist = musicPlayer.playlist.filter(t => t.id !== id);
    savePlaylist();
    
    if (musicPlayer.currentIndex >= musicPlayer.playlist.length) {
        musicPlayer.currentIndex = musicPlayer.playlist.length - 1;
    }
    
    renderPlaylist();
    updateNowPlaying();
}

function playTrack(index) {
    if (index < 0 || index >= musicPlayer.playlist.length) return;
    
    musicPlayer.currentIndex = index;
    const track = musicPlayer.playlist[index];
    
    console.log('▶ Playing:', track.title);
    
    if (track.type === 'audio') {
        musicPlayer.audio.src = track.url;
        musicPlayer.audio.volume = musicPlayer.volume;
        musicPlayer.audio.muted = musicPlayer.isMuted;
        
        musicPlayer.audio.play().then(() => {
            musicPlayer.isPlaying = true;
            updateNowPlaying();
        }).catch(err => {
            console.error('Playback failed:', err);
            alert(`⚠️ Could not play track: ${err.message}\n\nTry opening the URL directly to test it.`);
        });
    } else {
        musicPlayer.isPlaying = true;
        updateNowPlaying();
        alert(`🎵 Opening ${track.type} track:\n${track.title}\n\nURL: ${track.url}`);
        window.open(track.url, '_blank');
    }
}

function togglePlayPause() {
    console.log('togglePlayPause called, currentIndex:', musicPlayer.currentIndex, 'isPlaying:', musicPlayer.isPlaying);
    
    // If no track selected, play first track
    if (musicPlayer.currentIndex === -1 && musicPlayer.playlist.length > 0) {
        console.log('No track selected, playing first track');
        playTrack(0);
        return;
    }
    
    // If no playlist, do nothing
    if (musicPlayer.playlist.length === 0) {
        console.log('No tracks in playlist');
        alert('⚠️ No tracks in playlist. Add a track first!');
        return;
    }
    
    const currentTrack = musicPlayer.playlist[musicPlayer.currentIndex];
    if (!currentTrack) {
        console.log('No current track');
        return;
    }
    
    console.log('Current track type:', currentTrack.type);
    
    // Only handle play/pause for direct audio files
    if (currentTrack.type === 'audio') {
        if (musicPlayer.isPlaying) {
            console.log('Pausing audio');
            musicPlayer.audio.pause();
            musicPlayer.isPlaying = false;
            playSound('click');
        } else {
            console.log('Resuming audio');
            const playPromise = musicPlayer.audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    musicPlayer.isPlaying = true;
                    playSound('click');
                }).catch(err => {
                    console.error('Failed to resume:', err);
                    alert('⚠️ Playback failed. Click play again.');
                });
            }
        }
        updateNowPlaying();
    } else {
        // For external services, just reopen the link
        console.log('External service, opening link');
        window.open(currentTrack.url, '_blank');
        alert(`🎵 This is a ${currentTrack.type.toUpperCase()} link.\n\nIt will open in a new tab.`);
    }
}

function nextTrack() {
    if (musicPlayer.playlist.length === 0) return;
    
    let nextIdx;
    
    if (musicPlayer.repeat === 'one') {
        nextIdx = musicPlayer.currentIndex;
    } else if (musicPlayer.shuffle) {
        nextIdx = Math.floor(Math.random() * musicPlayer.playlist.length);
    } else {
        nextIdx = (musicPlayer.currentIndex + 1) % musicPlayer.playlist.length;
    }
    
    playTrack(nextIdx);
}

function prevTrack() {
    if (musicPlayer.playlist.length === 0) return;
    
    if (musicPlayer.audio.currentTime > 3) {
        musicPlayer.audio.currentTime = 0;
    } else {
        const prevIdx = (musicPlayer.currentIndex - 1 + musicPlayer.playlist.length) % musicPlayer.playlist.length;
        playTrack(prevIdx);
    }
}

function setVolume(value) {
    musicPlayer.volume = value;
    musicPlayer.audio.volume = value;
    if (value > 0) musicPlayer.isMuted = false;
    document.getElementById('musicVolume').value = value;
}

function toggleMute() {
    musicPlayer.isMuted = !musicPlayer.isMuted;
    musicPlayer.audio.muted = musicPlayer.isMuted;
    document.getElementById('muteBtn').textContent = musicPlayer.isMuted ? '🔇' : '🔊';
}

function toggleShuffle() {
    musicPlayer.shuffle = !musicPlayer.shuffle;
    const btn = document.getElementById('shuffleBtn');
    btn.style.background = musicPlayer.shuffle ? '#ffaa00' : 'transparent';
    btn.style.color = musicPlayer.shuffle ? '#000' : '#9966cc';
}

function toggleRepeat() {
    const modes = ['none', 'all', 'one'];
    const currentIdx = modes.indexOf(musicPlayer.repeat);
    musicPlayer.repeat = modes[(currentIdx + 1) % modes.length];
    
    const btn = document.getElementById('repeatBtn');
    btn.textContent = musicPlayer.repeat === 'one' ? '🔂' : '🔁';
    btn.style.background = musicPlayer.repeat !== 'none' ? '#ffaa00' : 'transparent';
    btn.style.color = musicPlayer.repeat !== 'none' ? '#000' : '#9966cc';
}

function updateNowPlaying() {
    const currentTrack = musicPlayer.playlist[musicPlayer.currentIndex];
    const nowPlayingDiv = document.getElementById('nowPlaying');
    const playBtn = document.getElementById('playPauseBtn');
    const miniPlayer = document.getElementById('miniPlayerText');
    
    if (currentTrack) {
        if (nowPlayingDiv) {
            nowPlayingDiv.innerHTML = `
                <div style="color: #ffaa00; font-weight: 700; font-size: 0.95em; margin-bottom: 4px;">
                    ${currentTrack.title}
                </div>
                <div style="color: #6699cc; font-size: 0.8em;">
                    ${currentTrack.artist}
                </div>
                <div style="color: #9966cc; font-size: 0.7em; margin-top: 4px; opacity: 0.7;">
                    ${currentTrack.type.toUpperCase()}
                </div>
            `;
        }
        
        if (miniPlayer) {
            miniPlayer.textContent = `${musicPlayer.isPlaying ? '▶' : '⏸'} ${currentTrack.title.substring(0, 15)}...`;
        }
    } else {
        if (nowPlayingDiv) {
            nowPlayingDiv.innerHTML = `<div style="color: #6699cc; font-size: 0.9em;">No track playing</div>`;
        }
        if (miniPlayer) {
            miniPlayer.textContent = 'MUSIC PLAYER';
        }
    }
    
    if (playBtn) {
        playBtn.textContent = musicPlayer.isPlaying ? '⏸' : '▶';
    }
    
    updateSeekBarVisibility();
}

function renderPlaylist() {
    const playlistDiv = document.getElementById('musicPlaylist');
    if (!playlistDiv) return;
    
    if (musicPlayer.playlist.length === 0) {
        playlistDiv.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #6699cc; font-size: 0.85em;">
                No tracks in playlist<br>
                <span style="font-size: 0.75em; opacity: 0.7;">Click "ADD TRACK" to get started</span>
            </div>
        `;
        return;
    }
    
    playlistDiv.innerHTML = musicPlayer.playlist.map((track, idx) => `
        <div class="playlist-item ${idx === musicPlayer.currentIndex ? 'active' : ''}" 
             data-index="${idx}"
             style="
                padding: 12px 15px;
                border-bottom: 1px solid rgba(153, 102, 204, 0.3);
                background: ${idx === musicPlayer.currentIndex ? 'rgba(255, 170, 0, 0.2)' : 'transparent'};
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: background 0.2s;
             ">
            <div style="flex: 1;">
                <div style="color: #ffaa00; font-size: 0.85em; font-weight: 700;">
                    ${idx + 1}. ${escapeHtml(track.title)}
                </div>
                <div style="color: #6699cc; font-size: 0.75em;">
                    ${escapeHtml(track.artist)} • ${track.type}
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <a href="${track.url}" target="_blank" onclick="event.stopPropagation()" 
                   style="color: #9966cc; text-decoration: none;">🔗</a>
                <button onclick="event.stopPropagation(); removeTrack(${track.id})" 
                        style="background: transparent; border: none; color: #ff3366; cursor: pointer; font-size: 1.1em;">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.playlist-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.index);
            playTrack(idx);
        });
        
        item.addEventListener('mouseenter', () => {
            if (parseInt(item.dataset.index) !== musicPlayer.currentIndex) {
                item.style.background = 'rgba(102, 153, 204, 0.2)';
            }
        });
        
        item.addEventListener('mouseleave', () => {
            if (parseInt(item.dataset.index) !== musicPlayer.currentIndex) {
                item.style.background = 'transparent';
            }
        });
    });
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateSeekBarVisibility() {
    const seekContainer = document.getElementById('seekBarContainer');
    const currentTrack = musicPlayer.playlist[musicPlayer.currentIndex];
    
    if (seekContainer) {
        seekContainer.style.display = (currentTrack && currentTrack.type === 'audio') ? 'block' : 'none';
    }
}

function initMusicPlayer() {
    loadPlaylist();
    
    // Set up audio element with CORS
    musicPlayer.audio.crossOrigin = 'anonymous';
    musicPlayer.audio.preload = 'auto';
    
    musicPlayer.audio.addEventListener('timeupdate', () => {
        const seekBar = document.getElementById('seekBar');
        const currentTimeSpan = document.getElementById('currentTime');
        
        if (seekBar) {
            seekBar.value = musicPlayer.audio.currentTime;
            seekBar.max = musicPlayer.audio.duration || 0;
        }
        
        if (currentTimeSpan) {
            currentTimeSpan.textContent = formatTime(musicPlayer.audio.currentTime);
        }
    });
    
    musicPlayer.audio.addEventListener('loadedmetadata', () => {
        const durationSpan = document.getElementById('duration');
        if (durationSpan) {
            durationSpan.textContent = formatTime(musicPlayer.audio.duration);
        }
        console.log('✓ Audio loaded:', formatTime(musicPlayer.audio.duration));
    });
    
    musicPlayer.audio.addEventListener('ended', () => {
        console.log('Track ended');
        if (musicPlayer.repeat === 'one') {
            musicPlayer.audio.currentTime = 0;
            musicPlayer.audio.play();
        } else {
            nextTrack();
        }
    });
    
    musicPlayer.audio.addEventListener('play', () => {
        musicPlayer.isPlaying = true;
        updateNowPlaying();
    });
    
    musicPlayer.audio.addEventListener('pause', () => {
        musicPlayer.isPlaying = false;
        updateNowPlaying();
    });
    
    musicPlayer.audio.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        const error = musicPlayer.audio.error;
        if (error) {
            console.error('Error code:', error.code, 'Message:', error.message);
        }
    });
    
    renderPlaylist();
    updateNowPlaying();
    
    console.log('✓ Music player initialized');
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

// ==================== EVENT LISTENERS ====================

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

function setupMusicPlayerListeners() {
    const musicToggle = document.getElementById('musicPlayerToggle');
    const closePlayer = document.getElementById('closeMusicPlayer');
    const toggleAddForm = document.getElementById('toggleAddForm');
    const addTrackBtn = document.getElementById('addTrackBtn');
    const cancelAddBtn = document.getElementById('cancelAddBtn');
    const seekBar = document.getElementById('seekBar');
    
    if (musicToggle) {
        musicToggle.addEventListener('click', () => {
            const panel = document.getElementById('musicPlayerPanel');
            if (panel) {
                panel.style.display = 'block';
                musicToggle.style.display = 'none';
                playSound('click');
            }
        });
    }
    
    if (closePlayer) {
        closePlayer.addEventListener('click', () => {
            const panel = document.getElementById('musicPlayerPanel');
            if (panel && musicToggle) {
                panel.style.display = 'none';
                musicToggle.style.display = 'flex';
                playSound('click');
            }
        });
    }
    
    if (toggleAddForm) {
        toggleAddForm.addEventListener('click', () => {
            const form = document.getElementById('addTrackForm');
            if (form) {
                const isVisible = form.style.display === 'block';
                form.style.display = isVisible ? 'none' : 'block';
                toggleAddForm.textContent = isVisible ? '➕ ADD TRACK' : 'CLOSE FORM';
                playSound('click');
            }
        });
    }
    
    if (addTrackBtn) {
        addTrackBtn.addEventListener('click', () => {
            const title = document.getElementById('trackTitle').value;
            const artist = document.getElementById('trackArtist').value;
            const url = document.getElementById('trackUrl').value;
            
            if (addTrackToPlaylist(title, artist, url)) {
                document.getElementById('trackTitle').value = '';
                document.getElementById('trackArtist').value = '';
                document.getElementById('trackUrl').value = '';
                document.getElementById('addTrackForm').style.display = 'none';
                if (toggleAddForm) toggleAddForm.textContent = '➕ ADD TRACK';
            }
        });
    }
    
    if (cancelAddBtn) {
        cancelAddBtn.addEventListener('click', () => {
            document.getElementById('addTrackForm').style.display = 'none';
            if (toggleAddForm) toggleAddForm.textContent = '➕ ADD TRACK';
            playSound('click');
        });
    }
    
    if (seekBar) {
        seekBar.addEventListener('input', (e) => {
            if (musicPlayer.audio.duration) {
                musicPlayer.audio.currentTime = parseFloat(e.target.value);
            }
        });
    }
}

// ==================== CHAT FUNCTIONS ====================

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
                    ${escapeHtml(conv.title)}
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

// ==================== INITIALIZATION ====================

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

// Make functions globally available
window.toggleSounds = toggleSounds;
window.toggleTTS = toggleTTS;
window.toggleThinking = toggleThinking;
window.addTrackToPlaylist = addTrackToPlaylist;
window.removeTrack = removeTrack;
window.playTrack = playTrack;
window.togglePlayPause = togglePlayPause;
window.nextTrack = nextTrack;
window.prevTrack = prevTrack;
window.setVolume = setVolume;
window.toggleMute = toggleMute;
window.toggleShuffle = toggleShuffle;
window.toggleRepeat = toggleRepeat;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Studio 42 Ollama Chat initializing...');
    
    initializeDOMElements();
    checkOllamaStatus();
    checkTTSStatus();
    setupEventListeners();
    setupSettingsListeners();
    setupTTSListeners();
    setupMusicPlayerListeners();
    initSpeechRecognition();
    initMusicPlayer();
    renderConversations();
    
    document.addEventListener('click', initializeSounds, { once: true });
    
    console.log('✓ Initialization complete');
    console.log('Studio 42 Ollama Chat loaded ✓');
    console.log("Don't Panic! 🌟");
});