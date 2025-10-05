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
    repeat: 'none', // 'none', 'all', 'one'
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
        });
        soundsInitialized = true;
        console.log('✓ Sound effects initialized');
    } catch (error) {
        console.error('Failed to initialize sounds:', error);
    }
}

function playSound(soundName) {
    if (!soundsEnabled) return;
    if (!soundsInitialized) initializeSounds();
    const sound = sounds[soundName];
    if (sound) {
        sound.cloneNode().play().catch(e => console.warn(`Sound playback failed for ${soundName}:`, e.message));
    }
}

function toggleSounds(enabled) {
    soundsEnabled = enabled;
    if (enabled && !soundsInitialized) initializeSounds();
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
    return { thoughts, content: cleanedText.trim() };
}

function createThinkingBubble(thoughts, isComplete = true) {
    thinkingBubbleCounter++;
    const thinkId = 'think-' + thinkingBubbleCounter;
    const label = isComplete ? '💭 Thought' : '🤔 Thinking...';
    return `
        <div class="thinking-bubble" style="margin-bottom: 10px;">
            <div class="thinking-toggle" onclick="window.toggleThinking('${thinkId}')" style="background: rgba(153, 102, 204, 0.2); border: 2px solid #9966cc; border-radius: 10px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.85em; color: #9966cc; user-select: none;">
                <span id="${thinkId}-arrow" style="transition: transform 0.3s;">▶</span>
                <span>${label}</span>
            </div>
            <div id="${thinkId}" class="thinking-content" style="display: none; background: rgba(0, 0, 0, 0.3); border: 1px solid #9966cc; border-radius: 8px; padding: 12px; margin-top: 8px; font-size: 0.85em; color: #9966cc; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">${escapeHtml(thoughts.join('\n\n'))}</div>
        </div>`;
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

// ==================== TTS FUNCTIONS ====================

async function checkTTSStatus() {
    try {
        const response = await fetch('/api/tts/status');
        const data = await response.json();
        ttsAvailable = data.available;
        if (ttsAvailable) await loadVoices();
        else if (ttsEnabledCheckbox) {
            ttsEnabledCheckbox.disabled = true;
            ttsEnabledCheckbox.parentElement.title = 'TTS not installed (pip install kokoro soundfile)';
        }
    } catch (error) {
        console.error('TTS check failed:', error);
        ttsAvailable = false;
    }
}

async function loadVoices() {
    try {
        const response = await fetch('/api/tts/voices');
        voices = (await response.json()).voices || [];
        if (voiceSelect) {
            voiceSelect.innerHTML = voices.map(v => `<option value="${v.id}">${v.name} (${v.accent} ${v.gender})</option>`).join('');
        }
    } catch (error) {
        console.error('Failed to load voices:', error);
    }
}

function setupTTSListeners() {
    if (ttsSpeedSlider) ttsSpeedSlider.addEventListener('input', (e) => (ttsSpeed = parseFloat(e.target.value), ttsSpeedValue.textContent = ttsSpeed.toFixed(1)));
    if (voiceSelect) voiceSelect.addEventListener('change', (e) => (ttsVoice = e.target.value));
    if (autoPlayCheckbox) autoPlayCheckbox.addEventListener('change', (e) => (autoPlayResponses = e.target.checked));
}

function toggleTTS(enabled) {
    ttsEnabled = enabled;
    if (ttsSettings) ttsSettings.style.display = enabled ? 'block' : 'none';
    if (enabled && !ttsAvailable) {
        alert('⚠️ TTS not available.');
        if (ttsEnabledCheckbox) ttsEnabledCheckbox.checked = false;
        ttsEnabled = false;
    }
}

async function speakText(text) {
    if (!ttsEnabled || !ttsAvailable || !text.trim()) return;
    if (currentAudio) currentAudio.pause();
    isTTSGenerating = true;
    updateTTSStatus('Generating speech...', true);
    try {
        const response = await fetch('/api/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.substring(0, 8000), voice: ttsVoice, speed: ttsSpeed })
        });
        if (!response.ok) throw new Error(`TTS failed: ${response.statusText}`);
        const data = await response.json();
        if (data.audio) {
            currentAudio = new Audio(data.audio);
            currentAudio.onended = () => { isTTSGenerating = false; updateTTSStatus(''); };
            await currentAudio.play();
        }
    } catch (error) {
        console.error('TTS error:', error);
        isTTSGenerating = false;
        updateTTSStatus('TTS failed', false);
        setTimeout(() => updateTTSStatus(''), 3000);
    }
}

function updateTTSStatus(message, isActive = false) {
    const statusBadge = document.getElementById('statusBadge');
    if (!statusBadge || !message) {
        if (statusBadge && !isActive) updateStatusBadge(ollamaStatus);
        return;
    }
    if (isActive) {
        statusBadge.className = 'status-badge status-checking';
        statusBadge.innerHTML = `🗣️ ${message}`;
    }
}

// ==================== SPEECH RECOGNITION ====================

function initSpeechRecognition() {
    if (!micBtn) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.disabled = true;
        micBtn.title = 'Speech recognition not supported';
        return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => (isRecording = true, micBtn.classList.add('recording'), playSound('beep'));
    recognition.onend = () => (isRecording = false, micBtn.classList.remove('recording'), playSound('click'));
    recognition.onresult = (e) => (messageInput.value += ` ${e.results[0][0].transcript}`, messageInput.focus());
    recognition.onerror = (e) => (isRecording = false, micBtn.classList.remove('recording'), console.error('Speech recognition error:', e.error));
    ['mousedown', 'touchstart'].forEach(evt => micBtn.addEventListener(evt, e => (e.preventDefault(), !isRecording && recognition.start())));
    ['mouseup', 'mouseleave', 'touchend'].forEach(evt => micBtn.addEventListener(evt, e => (e.preventDefault(), isRecording && recognition.stop())));
}

// ==================== MUSIC PLAYER ====================

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function loadPlaylist() {
    const saved = localStorage.getItem('studio42_playlist');
    if (saved) {
        try {
            // Filter out old invalid blob URLs from previous sessions
            musicPlayer.playlist = JSON.parse(saved).filter(track => !track.url.startsWith('blob:'));
            console.log(`✓ Loaded ${musicPlayer.playlist.length} tracks from playlist`);
        } catch (e) {
            console.error('Failed to load playlist:', e);
        }
    }
}

function savePlaylist() {
    // Don't save local files with blob URLs as they become invalid
    const savablePlaylist = musicPlayer.playlist.filter(track => track.type !== 'local');
    localStorage.setItem('studio42_playlist', JSON.stringify(savablePlaylist));
}

function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function detectUrlType(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('soundcloud.com')) return 'soundcloud';
    if (lowerUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac|opus|mp4|webm|mov)(\?.*)?$/i)) return 'audio';
    return 'audio'; // Default to direct audio
}

function addTrackToPlaylist(track) {
    musicPlayer.playlist.push(track);
    savePlaylist();
    renderPlaylist();
    playSound('success');
    if (musicPlayer.playlist.length === 1) {
        playTrack(0);
    }
}

function removeTrack(id) {
    const track = musicPlayer.playlist.find(t => t.id === id);
    if (track && track.type === 'local' && track.url.startsWith('blob:')) {
        URL.revokeObjectURL(track.url); // Clean up blob URL
    }
    musicPlayer.playlist = musicPlayer.playlist.filter(t => t.id !== id);
    savePlaylist();
    if (musicPlayer.currentIndex >= musicPlayer.playlist.length) {
        musicPlayer.currentIndex = musicPlayer.playlist.length - 1;
    }
    renderPlaylist();
    updateNowPlaying();
}

async function playTrack(index) {
    if (index < 0 || index >= musicPlayer.playlist.length) return;

    musicPlayer.currentIndex = index;
    const track = musicPlayer.playlist[index];
    const externalPlayerContainer = document.getElementById('externalPlayerContainer');
    const externalPlayer = document.getElementById('externalPlayer');
    const seekBarContainer = document.getElementById('seekBarContainer');

    // Reset player state
    musicPlayer.audio.pause();
    externalPlayer.innerHTML = '';
    externalPlayerContainer.style.display = 'none';
    seekBarContainer.style.display = 'none';

    console.log('▶ Playing:', track.title, `(Type: ${track.type})`);

    switch (track.type) {
        case 'youtube':
            const videoId = getYoutubeId(track.url);
            if (videoId) {
                externalPlayer.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
                externalPlayerContainer.style.display = 'block';
                musicPlayer.isPlaying = true;
            } else {
                alert('⚠️ Invalid YouTube URL');
                musicPlayer.isPlaying = false;
            }
            break;

        case 'soundcloud':
            try {
                const response = await fetch(`https://soundcloud.com/oembed?format=json&url=${track.url}&auto_play=true`);
                const data = await response.json();
                externalPlayer.innerHTML = data.html;
                externalPlayerContainer.style.display = 'block';
                musicPlayer.isPlaying = true;
            } catch (error) {
                alert('⚠️ Could not load SoundCloud track.');
                console.error("SoundCloud embed error:", error);
                musicPlayer.isPlaying = false;
            }
            break;

        case 'local':
        case 'audio':
            seekBarContainer.style.display = 'block';
            musicPlayer.audio.src = track.url;
            musicPlayer.audio.volume = musicPlayer.volume;
            musicPlayer.audio.muted = musicPlayer.isMuted;
            musicPlayer.audio.play().catch(err => console.error('Playback failed:', err));
            break;
    }
    updateNowPlaying();
}

// ** NEW: Function to close the embedded player **
function closeExternalPlayer() {
    const externalPlayerContainer = document.getElementById('externalPlayerContainer');
    const externalPlayer = document.getElementById('externalPlayer');

    if (externalPlayerContainer) externalPlayerContainer.style.display = 'none';
    if (externalPlayer) externalPlayer.innerHTML = ''; // This stops the video by removing the iframe

    musicPlayer.isPlaying = false;
    updateNowPlaying();
    playSound('click');
}


function togglePlayPause() {
    if (musicPlayer.currentIndex === -1 && musicPlayer.playlist.length > 0) {
        playTrack(0);
        return;
    }
    if (musicPlayer.playlist.length === 0) return;
    const track = musicPlayer.playlist[musicPlayer.currentIndex];
    if (track.type === 'local' || track.type === 'audio') {
        if (musicPlayer.audio.paused) musicPlayer.audio.play();
        else musicPlayer.audio.pause();
    } else {
        alert(`▶ Playback for ${track.type} is controlled inside the embedded player.`);
    }
}

function nextTrack() {
    if (musicPlayer.playlist.length === 0) return;
    let nextIdx = musicPlayer.currentIndex;
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
    musicPlayer.repeat = modes[(modes.indexOf(musicPlayer.repeat) + 1) % modes.length];
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
        nowPlayingDiv.innerHTML = `
            <div style="color: #ffaa00; font-weight: 700;">${escapeHtml(currentTrack.title)}</div>
            <div style="color: #6699cc; font-size: 0.8em;">${escapeHtml(currentTrack.artist)}</div>
            <div style="color: #9966cc; font-size: 0.7em; margin-top: 4px; opacity: 0.7;">${currentTrack.type.toUpperCase()}</div>`;
        miniPlayer.textContent = `${musicPlayer.isPlaying ? '▶' : '⏸'} ${currentTrack.title.substring(0, 15)}...`;
    } else {
        nowPlayingDiv.innerHTML = `<div style="color: #6699cc;">No track playing</div>`;
        miniPlayer.textContent = 'MUSIC PLAYER';
    }
    playBtn.textContent = musicPlayer.isPlaying ? '⏸' : '▶';
}

function renderPlaylist() {
    const playlistDiv = document.getElementById('musicPlaylist');
    if (musicPlayer.playlist.length === 0) {
        playlistDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #6699cc;">No tracks in playlist</div>`;
        return;
    }
    playlistDiv.innerHTML = musicPlayer.playlist.map((track, idx) => `
        <div class="playlist-item ${idx === musicPlayer.currentIndex ? 'active' : ''}" data-index="${idx}" style="padding: 12px 15px; border-bottom: 1px solid rgba(153, 102, 204, 0.3); background: ${idx === musicPlayer.currentIndex ? 'rgba(255, 170, 0, 0.2)' : 'transparent'}; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="color: #ffaa00; font-size: 0.85em;">${idx + 1}. ${escapeHtml(track.title)}</div>
                <div style="color: #6699cc; font-size: 0.75em;">${escapeHtml(track.artist)} • ${track.type}</div>
            </div>
            <div>
                <button onclick="event.stopPropagation(); removeTrack(${track.id})" style="background: transparent; border: none; color: #ff3366; cursor: pointer; font-size: 1.1em;">🗑️</button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.playlist-item').forEach(item => {
        item.addEventListener('click', () => playTrack(parseInt(item.dataset.index)));
    });
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function initMusicPlayer() {
    loadPlaylist();
    const playerPanel = document.getElementById('musicPlayerPanel');
    const playerHeader = document.getElementById('musicPlayerHeader');
    makeDraggable(playerPanel, playerHeader);

    musicPlayer.audio.addEventListener('timeupdate', () => {
        const seekBar = document.getElementById('seekBar');
        const currentTimeSpan = document.getElementById('currentTime');
        if (seekBar) {
            seekBar.value = musicPlayer.audio.currentTime;
            seekBar.max = musicPlayer.audio.duration || 0;
        }
        if (currentTimeSpan) currentTimeSpan.textContent = formatTime(musicPlayer.audio.currentTime);
    });
    musicPlayer.audio.addEventListener('loadedmetadata', () => {
        const durationSpan = document.getElementById('duration');
        if (durationSpan) durationSpan.textContent = formatTime(musicPlayer.audio.duration);
    });
    musicPlayer.audio.addEventListener('ended', () => {
        if (musicPlayer.repeat !== 'one') nextTrack();
        else musicPlayer.audio.play();
    });
    musicPlayer.audio.addEventListener('play', () => (musicPlayer.isPlaying = true, updateNowPlaying()));
    musicPlayer.audio.addEventListener('pause', () => (musicPlayer.isPlaying = false, updateNowPlaying()));

    renderPlaylist();
    updateNowPlaying();
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
            selectedModel = models.find(m => m.name.includes('vision') || m.name.includes('llama3.2'))?.name || models[0]?.name || '';
            if (selectedModel) modelSelect.value = selectedModel;
            updateVisionBadge();
            updateInfoBox();
        } else throw new Error('Ollama error');
    } catch (error) {
        ollamaStatus = 'offline';
        updateStatusBadge('offline');
        updateInfoBox();
        if (modelSelect) modelSelect.innerHTML = '<option>⚠️ Ollama offline</option>';
    }
}

function updateStatusBadge(status) {
    if (statusBadge) {
        statusBadge.className = `status-badge status-${status}`;
        statusBadge.innerHTML = status === 'online' ? '⚡ ONLINE' : '✗ OFFLINE';
    }
}

function updateModelSelect() {
    if (modelSelect) {
        modelSelect.innerHTML = models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    }
}

function updateVisionBadge() {
    if (visionBadge && imageUploadBtn) {
        const isVision = selectedModel.includes('llava') || selectedModel.includes('vision') || selectedModel.includes('llama3.2');
        visionBadge.style.display = isVision ? 'block' : 'none';
        imageUploadBtn.style.display = isVision ? 'block' : 'none';
    }
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
    if (sendBtn) sendBtn.addEventListener('click', () => (playSound('beep'), sendMessage()));
    if (messageInput) messageInput.addEventListener('keydown', e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), playSound('beep'), sendMessage()));
    if (newChatBtn) newChatBtn.addEventListener('click', () => (playSound('click'), createNewChat()));
    if (settingsBtn) settingsBtn.addEventListener('click', () => (playSound('click'), settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none'));
    if (modelSelect) modelSelect.addEventListener('change', e => (playSound('click'), selectedModel = e.target.value, updateVisionBadge(), updateInfoBox()));
    if (imageUploadBtn) imageUploadBtn.addEventListener('click', () => (playSound('click'), imageInput.click()));
    if (imageInput) imageInput.addEventListener('change', handleImageUpload);
    if (removeImageBtn) removeImageBtn.addEventListener('click', () => (playSound('click'), clearImage()));
}

function setupSettingsListeners() {
    if (tempSlider) tempSlider.addEventListener('input', e => (temperature = parseFloat(e.target.value), tempValue.textContent = temperature));
    if (topPSlider) topPSlider.addEventListener('input', e => (topP = parseFloat(e.target.value), topPValue.textContent = topP));
    if (topKSlider) topKSlider.addEventListener('input', e => (topK = parseInt(e.target.value), topKValue.textContent = topK));
    if (contextSelect) contextSelect.addEventListener('change', e => (contextWindow = parseInt(e.target.value)));
}

function setupMusicPlayerListeners() {
    const musicToggle = document.getElementById('musicPlayerToggle');
    const closePlayer = document.getElementById('closeMusicPlayer');
    const toggleAddForm = document.getElementById('toggleAddForm');
    const addTrackBtn = document.getElementById('addTrackBtn');
    const cancelAddBtn = document.getElementById('cancelAddBtn');
    const addLocalFileBtn = document.getElementById('addLocalFileBtn');
    const localTrackInput = document.getElementById('localTrackInput');
    const closeExternalBtn = document.getElementById('closeExternalPlayerBtn'); // ** Get the new button

    if (musicToggle) musicToggle.addEventListener('click', () => (document.getElementById('musicPlayerPanel').style.display = 'block', musicToggle.style.display = 'none', playSound('click')));
    if (closePlayer) closePlayer.addEventListener('click', () => (document.getElementById('musicPlayerPanel').style.display = 'none', musicToggle.style.display = 'flex', playSound('click')));
    if (toggleAddForm) toggleAddForm.addEventListener('click', () => {
        const form = document.getElementById('addTrackForm');
        const isVisible = form.style.display === 'block';
        form.style.display = isVisible ? 'none' : 'block';
        toggleAddForm.textContent = isVisible ? '➕ ADD LINK' : 'CLOSE FORM';
        playSound('click');
    });
    if (addTrackBtn) addTrackBtn.addEventListener('click', () => {
        const url = document.getElementById('trackUrl').value.trim();
        if (!url) return;
        const track = {
            id: Date.now(),
            title: document.getElementById('trackTitle').value.trim() || url,
            artist: document.getElementById('trackArtist').value.trim() || 'Unknown Artist',
            url: url,
            type: detectUrlType(url),
        };
        addTrackToPlaylist(track);
        document.getElementById('addTrackForm').style.display = 'none';
        toggleAddForm.textContent = '➕ ADD LINK';
    });
    if (cancelAddBtn) cancelAddBtn.addEventListener('click', () => (document.getElementById('addTrackForm').style.display = 'none', toggleAddForm.textContent = '➕ ADD LINK', playSound('click')));
    if (addLocalFileBtn) addLocalFileBtn.addEventListener('click', () => localTrackInput.click());
    if (localTrackInput) localTrackInput.addEventListener('change', (e) => {
        for (const file of e.target.files) {
            const track = {
                id: Date.now(),
                title: file.name,
                artist: 'Local File',
                url: URL.createObjectURL(file),
                type: 'local',
            };
            addTrackToPlaylist(track);
        }
        e.target.value = null; // Reset input
    });
    if (closeExternalBtn) { // ** Add the event listener for the new button
        closeExternalBtn.addEventListener('click', closeExternalPlayer);
    }
    const seekBar = document.getElementById('seekBar');
    if (seekBar) seekBar.addEventListener('input', e => musicPlayer.audio.currentTime = parseFloat(e.target.value));
}

// ==================== CHAT FUNCTIONS ====================

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImage = e.target.result;
            previewImage.src = uploadedImage;
            imagePreview.style.display = 'block';
            playSound('success');
        };
        reader.readAsDataURL(file);
    }
}

function clearImage() {
    uploadedImage = null;
    imagePreview.style.display = 'none';
    imageInput.value = '';
}

function createNewChat() {
    const newId = Math.max(...conversations.map(c => c.id)) + 1;
    conversations.push({ id: newId, title: 'New Chat', messages: [] });
    currentConvId = newId;
    renderConversations();
    renderMessages();
}

function deleteConversation(id) {
    if (conversations.length === 1) return;
    conversations = conversations.filter(c => c.id !== id);
    if (currentConvId === id) currentConvId = conversations[0].id;
    renderConversations();
    renderMessages();
}

function renderConversations() {
    if (!conversationList) return;
    conversationList.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${conv.id === currentConvId ? 'active' : ''}" data-id="${conv.id}">
            <div class="conv-details" style="display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden;">
                <span>💬</span>
                <span class="conv-title" style="font-size: 0.85em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(conv.title)}</span>
            </div>
            ${conversations.length > 1 ? `<span class="delete-btn" data-id="${conv.id}" style="cursor: pointer; color: #ff3366; font-size: 1.2em;">🗑️</span>` : ''}
        </div>
    `).join('');

    conversationList.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const id = parseInt(item.dataset.id);
            if (e.target.classList.contains('delete-btn')) {
                playSound('error');
                deleteConversation(id);
            } else {
                playSound('click');
                currentConvId = id;
                renderConversations();
                renderMessages();
            }
        });
    });
}

function renderMessages() {
    const currentConv = conversations.find(c => c.id === currentConvId);
    if (!messagesContainer || !currentConv) return;
    if (currentConv.messages.length === 0) {
        messagesContainer.innerHTML = `<div class="empty-state">
            <div style="font-size: 3em; margin-bottom: 20px; opacity: 0.5;">🌙</div>
            <div>Start a conversation with Ollama</div>
            <div style="font-size: 0.7em; margin-top: 10px; opacity: 0.7;">
                Don't Panic! Just type your message below.
            </div>
        </div>`;
        return;
    }
    messagesContainer.innerHTML = currentConv.messages.map(msg => {
        const parsed = msg.role === 'assistant' ? parseThinkingContent(msg.content) : { thoughts: [], content: msg.content };
        const thinkingHtml = parsed.thoughts.length > 0 ? createThinkingBubble(parsed.thoughts) : '';
        return `
            <div class="message ${msg.role}">
                <div class="message-bubble">
                    ${msg.image ? `<img src="${msg.image}" class="message-image">` : ''}
                    ${thinkingHtml}
                    <div style="white-space: pre-wrap;">${escapeHtml(parsed.content)}</div>
                    <div class="message-meta">${new Date(msg.timestamp).toLocaleTimeString()}${msg.model ? ` • ${msg.model}` : ''}</div>
                </div>
            </div>`;
    }).join('');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    const input = messageInput.value.trim();
    if (!input && !uploadedImage) return;
    if (ollamaStatus !== 'online' || !selectedModel) {
        alert('⚠️ Ollama is offline or no model is selected.');
        return;
    }
    const currentConv = conversations.find(c => c.id === currentConvId);
    if (currentConv.messages.length === 0 && input) currentConv.title = input.substring(0, 30);
    const userMessage = { role: 'user', content: input, image: uploadedImage, timestamp: new Date().toISOString() };
    currentConv.messages.push(userMessage);
    messageInput.value = '';
    clearImage();
    renderConversations();
    renderMessages();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant';
    loadingDiv.innerHTML = `<div class="message-bubble"><div class="loading-indicator">
        <span class="loading-dot">●</span><span class="loading-dot">●</span><span class="loading-dot">●</span>
    </div></div>`;
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    sendBtn.disabled = true;

    try {
        const ollamaMessages = currentConv.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            ...(msg.image && { images: [msg.image.split(',')[1]] }),
        }));
        const response = await fetch('/api/ollama/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: selectedModel, messages: ollamaMessages, stream: false, options: { temperature, top_p: topP, top_k: topK, num_ctx: contextWindow } })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.message) {
            const assistantMessage = { role: 'assistant', content: data.message.content, timestamp: new Date().toISOString(), model: selectedModel };
            currentConv.messages.push(assistantMessage);
            playSound('success');
            if (ttsEnabled && autoPlayResponses) {
                speakText(parseThinkingContent(assistantMessage.content).content);
            }
        }
    } catch (error) {
        console.error('✗ Chat error:', error);
        playSound('error');
        currentConv.messages.pop(); // remove user message on failure
    } finally {
        loadingDiv.remove();
        sendBtn.disabled = false;
        renderConversations();
        renderMessages();
    }
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

window.toggleSounds = toggleSounds;
window.toggleTTS = toggleTTS;
window.toggleThinking = toggleThinking;
window.removeTrack = removeTrack;
window.playTrack = playTrack;
window.togglePlayPause = togglePlayPause;
window.nextTrack = nextTrack;
window.prevTrack = prevTrack;
window.setVolume = setVolume;
window.toggleMute = toggleMute;
window.toggleShuffle = toggleShuffle;
window.toggleRepeat = toggleRepeat;
window.closeExternalPlayer = closeExternalPlayer;

document.addEventListener('DOMContentLoaded', () => {
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
    console.log("Studio 42 Ollama Chat loaded ✓");
});

// Clean up blob URLs when the page is closed
window.addEventListener('beforeunload', () => {
    musicPlayer.playlist.forEach(track => {
        if (track.type === 'local' && track.url.startsWith('blob:')) {
            URL.revokeObjectURL(track.url);
        }
    });
});