#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Studio 42 - Ollama Chat Interface
A Claude-like chat UI for Ollama with vision support, TTS, and STT
"""
from flask import Flask, render_template, jsonify, request, Response
import json
import requests
import logging
from pathlib import Path
import io
import base64
import warnings
import numpy as np
import re

# Suppress warnings from Kokoro TTS library (upstream issues)
# These warnings come from inside the Kokoro library's neural network code:
# 1. Dropout warning: Kokoro's model has dropout=0.2 but num_layers=1 (dropout does nothing with 1 layer)
# 2. weight_norm warning: Kokoro uses deprecated PyTorch API (they need to update their code)
warnings.filterwarnings('ignore', category=UserWarning, module='torch.nn.modules.rnn')
warnings.filterwarnings('ignore', category=FutureWarning, module='torch.nn.utils.weight_norm')

# TTS imports
try:
    from kokoro import KPipeline
    import soundfile as sf
    TTS_AVAILABLE = True
    logger = logging.getLogger(__name__)
    logger.info("Kokoro TTS loaded successfully")
except ImportError:
    TTS_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("Kokoro TTS not available. Install with: pip install kokoro soundfile")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False

OLLAMA_BASE_URL = 'http://localhost:11434'

# Initialize TTS pipeline (if available)
tts_pipeline = None
if TTS_AVAILABLE:
    try:
        # Explicitly specify repo_id to avoid warning (proper fix, not suppression)
        tts_pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
        logger.info("TTS pipeline initialized")
    except Exception as e:
        logger.error(f"Failed to initialize TTS: {e}")
        TTS_AVAILABLE = False

@app.route('/')
def index():
    """Serve the main chat interface"""
    try:
        return render_template('chat.html')
    except Exception as e:
        logger.error(f"Error serving index: {e}")
        return jsonify({'error': 'Failed to load application'}), 500

# ==================== OLLAMA API ENDPOINTS ====================

@app.route('/api/ollama/status')
def ollama_status():
    """Check if Ollama is running"""
    try:
        response = requests.get(f'{OLLAMA_BASE_URL}/api/tags', timeout=3)
        if response.status_code == 200:
            data = response.json()
            return jsonify({
                'status': 'online',
                'models': data.get('models', [])
            })
        return jsonify({'status': 'offline'}), 503
    except requests.exceptions.ConnectionError:
        return jsonify({'status': 'offline', 'error': 'Ollama not running'}), 503
    except requests.exceptions.Timeout:
        return jsonify({'status': 'timeout'}), 504
    except Exception as e:
        logger.error(f"Status check error: {e}")
        return jsonify({'status': 'error', 'error': str(e)}), 500

@app.route('/api/ollama/models')
def get_models():
    """Get list of available models"""
    try:
        response = requests.get(f'{OLLAMA_BASE_URL}/api/tags', timeout=5)
        if response.status_code == 200:
            data = response.json()
            models = data.get('models', [])
            logger.info(f"Found {len(models)} models")
            return jsonify({'models': models})
        return jsonify({'error': 'Failed to fetch models'}), response.status_code
    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Ollama not running'}), 503
    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ollama/pull', methods=['POST'])
def pull_model():
    """Pull a model from Ollama library"""
    try:
        data = request.json
        model_name = data.get('model')
        
        if not model_name:
            return jsonify({'error': 'Model name required'}), 400

        def generate():
            try:
                response = requests.post(
                    f'{OLLAMA_BASE_URL}/api/pull',
                    json={'model': model_name, 'stream': True},
                    stream=True
                )
                
                for line in response.iter_lines():
                    if line:
                        yield f"data: {line.decode('utf-8')}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return Response(generate(), mimetype='text/event-stream')
    except Exception as e:
        logger.error(f"Pull error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ollama/delete', methods=['POST'])
def delete_model():
    """Delete a model"""
    try:
        data = request.json
        model_name = data.get('model')
        
        if not model_name:
            return jsonify({'error': 'Model name required'}), 400

        response = requests.delete(
            f'{OLLAMA_BASE_URL}/api/delete',
            json={'model': model_name}
        )
        
        if response.status_code == 200:
            return jsonify({'success': True, 'message': f'Deleted {model_name}'})
        return jsonify({'error': 'Failed to delete model'}), response.status_code
    except Exception as e:
        logger.error(f"Delete error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ollama/chat', methods=['POST'])
def chat():
    """Chat with Ollama model - supports streaming"""
    try:
        data = request.json
        model = data.get('model')
        messages = data.get('messages', [])
        stream = data.get('stream', False)
        options = data.get('options', {})
        
        if not model:
            return jsonify({'error': 'Model name required'}), 400
        
        if not messages:
            return jsonify({'error': 'Messages required'}), 400

        logger.info(f"Chat request: model={model}, messages={len(messages)}, stream={stream}")

        ollama_request = {
            'model': model,
            'messages': messages,
            'stream': stream,
            'options': options
        }

        if stream:
            def generate():
                try:
                    response = requests.post(
                        f'{OLLAMA_BASE_URL}/api/chat',
                        json=ollama_request,
                        stream=True,
                        timeout=120
                    )
                    
                    for line in response.iter_lines():
                        if line:
                            yield f"data: {line.decode('utf-8')}\n\n"
                except Exception as e:
                    logger.error(f"Streaming error: {e}")
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return Response(generate(), mimetype='text/event-stream')
        else:
            response = requests.post(
                f'{OLLAMA_BASE_URL}/api/chat',
                json=ollama_request,
                timeout=120
            )
            
            if response.status_code == 200:
                return jsonify(response.json())
            return jsonify({'error': 'Chat request failed'}), response.status_code

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timed out'}), 504
    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Cannot connect to Ollama'}), 503
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/ollama/generate', methods=['POST'])
def generate():
    """Generate completion (for non-chat scenarios)"""
    try:
        data = request.json
        model = data.get('model')
        prompt = data.get('prompt')
        stream = data.get('stream', False)
        options = data.get('options', {})
        images = data.get('images', [])
        
        if not model or not prompt:
            return jsonify({'error': 'Model and prompt required'}), 400

        ollama_request = {
            'model': model,
            'prompt': prompt,
            'stream': stream,
            'options': options
        }
        
        if images:
            ollama_request['images'] = images

        if stream:
            def generate():
                try:
                    response = requests.post(
                        f'{OLLAMA_BASE_URL}/api/generate',
                        json=ollama_request,
                        stream=True,
                        timeout=120
                    )
                    
                    for line in response.iter_lines():
                        if line:
                            yield f"data: {line.decode('utf-8')}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"

            return Response(generate(), mimetype='text/event-stream')
        else:
            response = requests.post(
                f'{OLLAMA_BASE_URL}/api/generate',
                json=ollama_request,
                timeout=120
            )
            
            if response.status_code == 200:
                return jsonify(response.json())
            return jsonify({'error': 'Generation failed'}), response.status_code

    except Exception as e:
        logger.error(f"Generate error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ollama/embeddings', methods=['POST'])
def embeddings():
    """Generate embeddings"""
    try:
        data = request.json
        model = data.get('model')
        input_text = data.get('input')
        
        if not model or not input_text:
            return jsonify({'error': 'Model and input required'}), 400

        response = requests.post(
            f'{OLLAMA_BASE_URL}/api/embed',
            json={'model': model, 'input': input_text},
            timeout=30
        )
        
        if response.status_code == 200:
            return jsonify(response.json())
        return jsonify({'error': 'Embedding failed'}), response.status_code

    except Exception as e:
        logger.error(f"Embedding error: {e}")
        return jsonify({'error': str(e)}), 500

# ==================== TTS ENDPOINTS ====================

@app.route('/api/tts/status')
def tts_status():
    """Check if TTS is available"""
    return jsonify({
        'available': TTS_AVAILABLE,
        'engine': 'Kokoro-82M' if TTS_AVAILABLE else None
    })

@app.route('/api/tts/voices')
def list_voices():
    """List available TTS voices"""
    if not TTS_AVAILABLE:
        return jsonify({'error': 'TTS not available'}), 503
    
    voices = [
        # American Female
        {'id': 'af_bella', 'name': 'Bella', 'gender': 'female', 'accent': 'American', 'language': 'en-US'},
        {'id': 'af_sarah', 'name': 'Sarah', 'gender': 'female', 'accent': 'American', 'language': 'en-US'},
        {'id': 'af_nicole', 'name': 'Nicole', 'gender': 'female', 'accent': 'American', 'language': 'en-US'},
        {'id': 'af_sky', 'name': 'Sky', 'gender': 'female', 'accent': 'American', 'language': 'en-US'},
        
        # American Male
        {'id': 'am_adam', 'name': 'Adam', 'gender': 'male', 'accent': 'American', 'language': 'en-US'},
        {'id': 'am_michael', 'name': 'Michael', 'gender': 'male', 'accent': 'American', 'language': 'en-US'},
        
        # British Female
        {'id': 'bf_emma', 'name': 'Emma', 'gender': 'female', 'accent': 'British', 'language': 'en-GB'},
        {'id': 'bf_isabella', 'name': 'Isabella', 'gender': 'female', 'accent': 'British', 'language': 'en-GB'},
        
        # British Male
        {'id': 'bm_george', 'name': 'George', 'gender': 'male', 'accent': 'British', 'language': 'en-GB'},
        {'id': 'bm_lewis', 'name': 'Lewis', 'gender': 'male', 'accent': 'British', 'language': 'en-GB'},
    ]
    
    return jsonify({'voices': voices})

def clean_text_for_tts(text):
    """Clean text for better TTS output"""
    # Remove markdown bold markers
    text = re.sub(r'\*\*', '', text)
    # Convert numbered lists to sentences
    text = re.sub(r'\n\d+\.\s+', '. ', text)
    # Convert multiple newlines to periods
    text = re.sub(r'\n+', '. ', text)
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

@app.route('/api/tts/speak', methods=['POST'])
def speak():
    """Convert text to speech using Kokoro TTS"""
    if not TTS_AVAILABLE:
        return jsonify({'error': 'TTS not available. Install: pip install kokoro soundfile'}), 503
    
    try:
        data = request.json
        text = data.get('text', '').strip()
        voice = data.get('voice', 'af_bella')
        speed = float(data.get('speed', 1.0))
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        if len(text) > 5000:
            return jsonify({'error': 'Text too long (max 5000 characters)'}), 400
        
        # Clean text for better TTS output
        text = clean_text_for_tts(text)
        
        logger.info(f"TTS request: {len(text)} chars, voice={voice}, speed={speed}")
        
        # Generate audio using Kokoro
        generator = tts_pipeline(text, voice=voice, speed=speed)
        
        # Kokoro returns a generator - collect ALL audio chunks
        audio_chunks = []
        for _, _, audio in generator:
            audio_chunks.append(audio)
        
        if not audio_chunks:
            return jsonify({'error': 'Failed to generate audio'}), 500
        
        # Concatenate all audio chunks into one array
        audio_data = np.concatenate(audio_chunks)
        
        # Convert to WAV format and encode as base64
        buffer = io.BytesIO()
        sf.write(buffer, audio_data, 24000, format='WAV')
        buffer.seek(0)
        audio_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        
        logger.info(f"TTS generated: {len(audio_data) / 24000:.2f}s of audio")
        
        return jsonify({
            'audio': f'data:audio/wav;base64,{audio_base64}',
            'voice': voice,
            'duration': len(audio_data) / 24000,
            'text_length': len(text)
        })
    
    except Exception as e:
        logger.error(f"TTS error: {e}", exc_info=True)
        return jsonify({'error': f'TTS generation failed: {str(e)}'}), 500

# ==================== SHOW MODEL INFO ====================

@app.route('/api/ollama/show', methods=['POST'])
def show_model():
    """Get model information"""
    try:
        data = request.json
        model = data.get('model')
        
        if not model:
            return jsonify({'error': 'Model name required'}), 400

        response = requests.post(
            f'{OLLAMA_BASE_URL}/api/show',
            json={'model': model}
        )
        
        if response.status_code == 200:
            return jsonify(response.json())
        return jsonify({'error': 'Failed to get model info'}), response.status_code

    except Exception as e:
        logger.error(f"Show model error: {e}")
        return jsonify({'error': str(e)}), 500

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {e}")
    return jsonify({'error': 'Internal server error'}), 500

# ==================== INITIALIZATION ====================

def initialize_app():
    """Initialize application directories and resources"""
    try:
        Path('templates').mkdir(exist_ok=True)
        Path('static').mkdir(exist_ok=True)
        Path('static/sounds').mkdir(exist_ok=True)
        logger.info("Application directories initialized")
        
        # Check for sound effects
        sound_files = ['beep.wav', 'click.wav', 'error.wav', 'success.ogg']
        sounds_available = all((Path('static/sounds') / f).exists() for f in sound_files)
        if sounds_available:
            logger.info("✓ LCARS sound effects available")
        else:
            logger.warning("⚠ Some sound effects missing in static/sounds/")
        
        if TTS_AVAILABLE:
            logger.info("✓ Kokoro TTS is available")
        else:
            logger.warning("⚠ Kokoro TTS not available (install: pip install kokoro soundfile)")
        
        try:
            response = requests.get(f'{OLLAMA_BASE_URL}/api/tags', timeout=3)
            if response.status_code == 200:
                models = response.json().get('models', [])
                logger.info(f"✓ Connected to Ollama - {len(models)} models available")
            else:
                logger.warning("⚠ Ollama is running but returned unexpected response")
        except requests.exceptions.ConnectionError:
            logger.warning("⚠ Cannot connect to Ollama. Make sure Ollama is running:")
            logger.warning("  Start Ollama with: ollama serve")
        except Exception as e:
            logger.error(f"Ollama check failed: {e}")
            
    except Exception as e:
        logger.error(f"Failed to initialize: {e}")
        raise

if __name__ == '__main__':
    try:
        initialize_app()
        
        print("\n" + "="*70)
        print("STUDIO 42 - OLLAMA CHAT INTERFACE")
        print("="*70)
        print("\nA Claude-like chat interface for Ollama")
        print("Features:")
        print("  ✓ Multi-model support with easy switching")
        print("  ✓ Vision model support (llava, llama3.2-vision, etc.)")
        print("  ✓ Multiple conversation threads")
        print("  ✓ Image upload for vision models")
        print("  ✓ Adjustable generation parameters")
        if TTS_AVAILABLE:
            print("  ✓ Text-to-Speech (Kokoro-82M)")
            print("  ✓ Speech-to-Text (Web Speech API)")
        else:
            print("  ⚠ TTS disabled (install: pip install kokoro soundfile)")
        print("  ✓ LCARS-inspired UI from Star Trek")
        print("\nServer running at: http://127.0.0.1:5000")
        print("\nMake sure Ollama is running:")
        print("  ollama serve")
        print("\nRecommended models to pull:")
        print("  ollama pull llama3.2-vision  # Vision support")
        print("  ollama pull llama3.2          # Fast text model")
        print("  ollama pull qwen2.5           # Good all-around")
        print("="*70 + "\n")
        
        try:
            from waitress import serve
            logger.info("Starting production server with Waitress")
            serve(app, host='127.0.0.1', port=5000, threads=4, channel_timeout=120)
        except ImportError:
            logger.warning("Waitress not installed, using development server")
            print("\n[INFO] Install Waitress for production: pip install waitress\n")
            app.run(host='127.0.0.1', port=5000, debug=False, threaded=True)
            
    except Exception as e:
        logger.critical(f"Failed to start application: {e}")
        print(f"\n[CRITICAL ERROR] Application failed to start: {e}\n")
        exit(1)