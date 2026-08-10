# Mockrena
**Gamified AI-powered mock interview platform combining LLMs, speech recognition, ML libraries, and computer vision.**

## Overview

Mockrena simulates technical and behavioral interviews and analyzes user responses through multiple AI modalities.

## Tech Stack

* **Python / Flask** — backend and API
* **Google Gemini API** — AI-powered response analysis
* **faster-whisper** — local speech-to-text transcription
* **face-api.js** — real-time facial landmark and expression detection
* **JavaScript / HTML / CSS** — frontend

## Highlights

* Integrates multiple pretrained AI models and APIs into a single application
* Runs Whisper inference locally through `faster-whisper`
* Uses asynchronous/thread-safe model initialization for speech processing
* Processes video and audio independently before combining results for interview evaluation

