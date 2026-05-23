#!/usr/bin/env python3
"""
Interview Arena - Flask Server
Install: pip install flask requests
Run:     ANTHROPIC_API_KEY=your_key python app.py
Open:    http://localhost:5000

Folder structure:
  app.py
  templates/
    index.html
"""

from flask import Flask, render_template, request, jsonify
import webbrowser
import threading
import requests
import os
import tempfile
from faster_whisper import WhisperModel

app = Flask(__name__)  # Flask automatically looks for /templates and /static

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "tiny")
whisper_model = None
whisper_lock = threading.Lock()


def get_whisper_model():
    global whisper_model
    if whisper_model is None:
        with whisper_lock:
            if whisper_model is None:
                print("Loading faster-whisper model...")
                whisper_model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device="cpu",
                    compute_type="int8"
                )
                print("faster-whisper model loaded.")
    return whisper_model

@app.route("/")
def index():
    return render_template("index.html")  # loads from templates/


@app.route("/api/claude", methods=["POST"])
def claude_proxy():
    """Proxy requests to Gemini API (drop-in replacement for Anthropic)."""
    if not GEMINI_API_KEY:
        return jsonify({"error": {"message": "GEMINI_API_KEY not set on server."}}), 500

    try:
        payload = request.get_json()

        # Convert Anthropic format → Gemini format
        system_prompt = payload.get("system", "")
        messages = payload.get("messages", [])

        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        gemini_payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {"maxOutputTokens": payload.get("max_tokens", 1000)}
        }

        response = requests.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            headers={"Content-Type": "application/json"},
            params={"key": GEMINI_API_KEY},
            json=gemini_payload,
            timeout=60,
        )

        gemini_data = response.json()
        print("GEMINI RESPONSE:", gemini_data)

        if "error" in gemini_data:
            return jsonify({"error": {"message": gemini_data["error"]["message"]}}), 500

        # Convert Gemini response → Anthropic format (so script.js needs zero changes)
        text = gemini_data["candidates"][0]["content"]["parts"][0]["text"]
        return jsonify({"content": [{"type": "text", "text": text}]}), 200

    except Exception as e:
        return jsonify({"error": {"message": str(e)}}), 500

@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    if "audio" not in request.files:
        return jsonify({"error": {"message": "No audio file uploaded."}}), 400

    audio_file = request.files["audio"]
    audio_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
            audio_path = tmp.name
            audio_file.save(audio_path)

        model = get_whisper_model()

        segments, info = model.transcribe(
            audio_path,
            language="en",
            vad_filter=True,
            beam_size=1
        )

        text = " ".join(segment.text.strip() for segment in segments).strip()
        print("TRANSCRIPT:", text)

        return jsonify({"text": text}), 200

    except Exception as e:
        print("TRANSCRIPTION ERROR:", str(e))
        return jsonify({"error": {"message": str(e)}}), 500

    finally:
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except OSError:
                pass

def open_browser():
    import time
    time.sleep(0.8)
    webbrowser.open("http://localhost:5000")


if __name__ == "__main__":
    # Check if template exists
    template_path = os.path.join(os.path.dirname(__file__), "templates", "index.html")
    if not os.path.exists(template_path):
        print("ERROR: 'templates/index.html' not found")
        exit(1)

    if not GEMINI_API_KEY:
        print("WARNING: GEMINI_API_KEY environment variable not set.")
        print("  Set it with: export GEMINI_API_KEY=your_key_here")

    print("=" * 50)
    print("  INTERVIEW ARENA")
    print("=" * 50)
    print("  URL:  http://localhost:5000")
    print("  Stop: Ctrl+C")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()
    app.run(debug=False, port=5000)
