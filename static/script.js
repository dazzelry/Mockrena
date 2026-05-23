// ============================================================
//  GAME STATE
// ============================================================
const LEVELS = [
  { name: 'INTERN', min: 0, max: 499 },
  { name: 'JUNIOR', min: 500, max: 1499 },
  { name: 'MID-LEVEL', min: 1500, max: 2999 },
  { name: 'SENIOR', min: 3000, max: 4999 },
  { name: 'STAFF', min: 5000, max: 7999 },
  { name: 'PRINCIPAL', min: 8000, max: 11999 },
  { name: 'DIRECTOR', min: 12000, max: 17999 },
  { name: 'VP', min: 18000, max: 24999 },
  { name: 'C-SUITE', min: 25000, max: 34999 },
  { name: 'LEGEND', min: 35000, max: Infinity },
];

const ROUNDS = [
  { id: 'phone', name: 'PHONE SCREEN', desc: '3 questions — behavioral basics', emoji: '📞', qs: 3, time: 90 },
  { id: 'hiring', name: 'HIRING MANAGER', desc: '4 questions — motivation & fit', emoji: '🧑‍💼', qs: 4, time: 120 },
  { id: 'technical', name: 'TECHNICAL ROUND', desc: '4 questions — skills & experience', emoji: '⚡', qs: 4, time: 150 },
  { id: 'panel', name: 'PANEL INTERVIEW', desc: '5 questions — multi-stakeholder', emoji: '👥', qs: 5, time: 120 },
  { id: 'exec', name: 'EXECUTIVE ROUND', desc: '3 questions — vision & leadership (BOSS)', emoji: '👔', qs: 3, time: 180 },
];

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'sort of', 'kind of', 'basically', 'literally', 'actually', 'right', 'so yeah', 'i mean'];

const BADGES_DEF = [
  { id: 'sharpshooter', name: 'SHARPSHOOTER', desc: 'Perfect pacing (130-160 WPM)', color: 'badge-green' },
  { id: 'ice_breaker', name: 'ICE BREAKER', desc: 'Zero filler words', color: 'badge-blue' },
  { id: 'storyteller', name: 'STORYTELLER', desc: '150+ word detailed answer', color: 'badge-amber' },
  { id: 'eye_contact', name: 'EYE CONTACT', desc: 'High eye contact maintained', color: 'badge-green' },
  { id: 'speed_demon', name: 'SPEED DEMON', desc: 'Answered in under 90 seconds', color: 'badge-amber' },
  { id: 'combo_king', name: 'COMBO KING', desc: '3+ answer combo', color: 'badge-amber' },
  { id: 'cool_head', name: 'COOL HEAD', desc: 'Consistently calm expression', color: 'badge-blue' },
  { id: 'wordsmith', name: 'WORDSMITH', desc: '200+ words per answer', color: 'badge-green' },
];

let state = {
  // Setup data
  jobTitle: '', candidateName: '', jobListing: '', resumeText: '',
  // Player progress
  totalXP: 0, totalScore: 0, streak: 0, comboMultiplier: 1, consecutiveGood: 0,
  earnedBadges: new Set(),
  roundsCompleted: new Set(),
  // Current round/question
  currentRound: null,
  currentQuestions: [],
  currentQIndex: 0,
  currentSessionAnswers: [],
  // Live metrics
  transcript: '', interimTranscript: '',
  wordCount: 0, fillerCount: 0,
  startTime: null, answerStartTime: null,
  timerInterval: null, timerSeconds: 0,
  recognition: null,
  stream: null,
  faceDetectionInterval: null,
  // Face metrics
  eyeContactScore: 0, eyeContactSamples: 0,
  calmScore: 0, calmSamples: 0,
  faceApiLoaded: false,

  mediaRecorder: null,
  audioStream: null,
  transcriptionPromises: [],
  recognitionActive: false,
};

// ============================================================
//  UTILITIES
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showLoading(msg) {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function getLevel() {
  return LEVELS.find(l => state.totalXP >= l.min && state.totalXP <= l.max) || LEVELS[LEVELS.length-1];
}

function getLevelNum() {
  return LEVELS.findIndex(l => state.totalXP >= l.min && state.totalXP <= l.max) + 1;
}

function initials(name) {
  return name.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2) || '??';
}

function showComboFlash(text) {
  const el = document.createElement('div');
  el.className = 'combo-flash';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function showFillerAlert(word) {
  const el = document.createElement('div');
  el.className = 'filler-alert';
  el.textContent = `FILLER: "${word}"`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// ============================================================
//  ANTHROPIC API
// ============================================================
async function callClaude(messages, systemPrompt, maxTokens = 1000) {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.find(b => b.type === 'text')?.text || '';
}

// ============================================================
//  SCREEN 1: SETUP
// ============================================================
function loadDemo() {
  document.getElementById('job-title').value = 'Senior Product Manager at Stripe';
  document.getElementById('candidate-name').value = 'Alex Chen';
  document.getElementById('job-listing').value = `We are looking for a Senior Product Manager to join Stripe's core payments team.

Responsibilities:
- Define and execute product strategy for our payment processing infrastructure
- Work cross-functionally with engineering, design, data science, and go-to-market teams
- Analyze market trends and competitive landscape to identify opportunities
- Define success metrics and drive data-informed decisions
- Manage a complex roadmap balancing short-term needs and long-term vision

Requirements:
- 5+ years of product management experience, preferably in fintech or developer tools
- Strong technical background — ability to deeply engage with engineering teams
- Experience with B2B/API products and developer-facing platforms
- Data-driven mindset with experience using analytics tools
- Excellent communication skills; able to distill complexity for executive audiences
- Track record of shipping products used at scale

Nice to have:
- Experience at high-growth fintech companies
- Understanding of payments infrastructure and compliance`;

  document.getElementById('resume-text').value = `Alex Chen — Product Manager
alex.chen@email.com | linkedin.com/in/alexchen

EXPERIENCE
Senior PM, Payments Platform — Plaid (2021–Present)
- Led launch of Plaid Transfer, a new ACH payment product reaching $2B+ annualized volume in 12 months
- Managed roadmap for 3 core API products serving 6,000+ developers
- Partnered with Compliance to ship PCI-DSS Level 1 certification across platform
- Increased API response time by 40% by driving infrastructure investment with engineering

PM, Developer Experience — Twilio (2019–2021)  
- Rebuilt Twilio Console onboarding; reduced time-to-first-API-call by 65%
- Launched SMS Copilot AI assistant used by 12,000 developers monthly

EDUCATION
BS Computer Science — UC Berkeley, 2018

SKILLS
SQL, Python, Figma, Mixpanel, Amplitude, JIRA
Payments: ACH, card networks, ISO 20022, Open Banking`;
}

async function startSetup() {
  const jobTitle = document.getElementById('job-title').value.trim();
  const candidateName = document.getElementById('candidate-name').value.trim();
  const jobListing = document.getElementById('job-listing').value.trim();
  const resumeText = document.getElementById('resume-text').value.trim();
  const errEl = document.getElementById('setup-error');

  if (!jobTitle || !jobListing || !resumeText) {
    errEl.textContent = 'ERROR: Fill in all fields to proceed.';
    return;
  }
  errEl.textContent = '';

  state.jobTitle = jobTitle;
  state.candidateName = candidateName || 'CANDIDATE';
  state.jobListing = jobListing;
  state.resumeText = resumeText;
  state.totalXP = 0; state.totalScore = 0;
  state.streak = 0; state.comboMultiplier = 1;
  state.earnedBadges = new Set();
  state.roundsCompleted = new Set();
  state.currentSessionAnswers = [];

  showLoading('LOADING FACE-API MODELS...');

  try {
    await loadFaceApi();
  } catch(e) {
    console.warn('Face API failed to load:', e);
    state.faceApiLoaded = false;
  }

  hideLoading();
  renderLobby();
  showScreen('screen-lobby');
}

// ============================================================
//  FACE API
// ============================================================
async function loadFaceApi() {
  if (state.faceApiLoaded) return;
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
  ]);
  state.faceApiLoaded = true;
}

async function startWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
    state.stream = stream;
    const video = document.getElementById('webcam-feed');
    video.srcObject = stream;
    await new Promise(r => video.onloadedmetadata = r);
    video.play();
    if (state.faceApiLoaded) startFaceDetection();
  } catch(e) {
    console.warn('Webcam unavailable:', e);
  }
}

function stopWebcam() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  if (state.faceDetectionInterval) {
    clearInterval(state.faceDetectionInterval);
    state.faceDetectionInterval = null;
  }
}

function startFaceDetection() {
  const video = document.getElementById('webcam-feed');
  const canvas = document.getElementById('face-canvas');
  const emotionTag = document.getElementById('emotion-tag');
  const statEmotion = document.getElementById('stat-emotion');

  // Reset state
  state.eyeHistory = [];
  state.calmScore = 0;
  state.calmSamples = 0;

  state.faceDetectionInterval = setInterval(async () => {
    if (!state.faceApiLoaded || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 }))
        .withFaceExpressions();

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detection) {
        const { box } = detection.detection;
        const expressions = detection.expressions;

        // Draw face box
        ctx.strokeStyle = 'rgba(0,255,136,0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Eye contact heuristic
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const frameW = canvas.width;
        const frameH = canvas.height;

        const centered =
          Math.abs(centerX - frameW / 2) < frameW * 0.25 &&
          Math.abs(centerY - frameH / 2) < frameH * 0.3;

        const goodSize = box.width > frameW * 0.15;
        const eyeContact = centered && goodSize ? 1 : 0;

        // ✅ Sliding window (last 30 frames)
        state.eyeHistory.push(eyeContact);
        if (state.eyeHistory.length > 30) {
          state.eyeHistory.shift();
        }

        const eyePct = Math.round(
          (state.eyeHistory.reduce((a, b) => a + b, 0) / state.eyeHistory.length) * 100
        );

        updateMeter('m-eye', eyePct);
        document.getElementById('m-eye-val').textContent = eyePct + '%';

        // Dominant expression
        let dominant = 'neutral';
        let domScore = 0;
        for (const [k, v] of Object.entries(expressions)) {
          if (v > domScore) {
            domScore = v;
            dominant = k;
          }
        }

        // Calm score
        const calm = (expressions.neutral || 0) + (expressions.happy || 0) * 0.5;
        state.calmScore += clamp(calm, 0, 1);
        state.calmSamples++;

        // Confidence
        const conf = Math.round(
          clamp(calm * 100 * (eyeContact ? 1.2 : 0.7), 0, 100)
        );
        updateMeter('m-conf', conf);
        document.getElementById('m-conf-val').textContent = conf + '%';

        // Clarity
        const clarity = Math.round(eyePct * 0.4 + conf * 0.6);
        updateMeter('m-clarity', clarity);
        document.getElementById('m-clarity-val').textContent = clarity + '%';

        // Emotion tag
        const emotionMap = {
          happy: 'CONFIDENT',
          neutral: 'COMPOSED',
          surprised: 'ALERT',
          fearful: 'NERVOUS',
          disgusted: 'UNEASY',
          angry: 'TENSE',
          sad: 'FLAT'
        };

        const emotionLabel = emotionMap[dominant] || dominant.toUpperCase();
        emotionTag.textContent = emotionLabel;
        statEmotion.textContent = emotionLabel;

        // Color styling
        const positives = ['happy', 'neutral'];
        const negatives = ['fearful', 'disgusted', 'angry', 'sad'];

        if (positives.includes(dominant)) {
          emotionTag.style.color = 'var(--neon)';
          emotionTag.style.borderColor = 'var(--neon)';
        } else if (negatives.includes(dominant)) {
          emotionTag.style.color = 'var(--amber)';
          emotionTag.style.borderColor = 'var(--amber)';
        }

      } else {
        // No face detected
        emotionTag.textContent = 'NO FACE';
        emotionTag.style.color = 'var(--red)';
        emotionTag.style.borderColor = 'var(--red)';

        // Still update history so it drops naturally
        state.eyeHistory.push(0);
        if (state.eyeHistory.length > 30) {
          state.eyeHistory.shift();
        }

        const eyePct = Math.round(
          (state.eyeHistory.reduce((a, b) => a + b, 0) / state.eyeHistory.length) * 100
        );

        updateMeter('m-eye', eyePct);
        document.getElementById('m-eye-val').textContent = eyePct + '%';
      }

    } catch (e) {
      // silent
    }
  }, 400);
}


function updateMeter(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = pct + '%';
  el.className = 'meter-fill';
  if (pct >= 70) el.classList.add('good');
  else if (pct >= 40) el.classList.add('warn');
  else el.classList.add('bad');
}

// ============================================================
//  SCREEN 2: LOBBY
// ============================================================
function renderLobby() {
  const level = getLevel();
  const levelNum = getLevelNum();
  const nextLevel = LEVELS[levelNum] || level;
  const xpInLevel = state.totalXP - level.min;
  const xpNeeded = nextLevel.min - level.min;
  const xpPct = xpNeeded > 0 ? Math.round((xpInLevel / xpNeeded) * 100) : 100;

  document.getElementById('lobby-avatar').textContent = initials(state.candidateName);
  document.getElementById('lobby-level').textContent = `LEVEL ${levelNum} — ${level.name}`;
  document.getElementById('lobby-name').textContent = state.candidateName.toUpperCase();
  document.getElementById('lobby-role').textContent = `Applying for: ${state.jobTitle}`;
  document.getElementById('lobby-score-display').textContent = state.totalScore.toLocaleString();

  document.getElementById('hud-xp').textContent = `${state.totalXP} / ${nextLevel.min === Infinity ? '∞' : nextLevel.min}`;
  document.getElementById('hud-xp-bar').style.width = xpPct + '%';
  document.getElementById('hud-streak').textContent = state.streak;
  document.getElementById('hud-combo').textContent = 'x' + state.comboMultiplier;
  document.getElementById('iv-combo').textContent = 'x' + state.comboMultiplier;

  // Badges
  const badgeContainer = document.getElementById('lobby-badges');
  badgeContainer.innerHTML = '';
  for (const id of state.earnedBadges) {
    const def = BADGES_DEF.find(b => b.id === id);
    if (def) {
      const span = document.createElement('span');
      span.className = `badge ${def.color}`;
      span.textContent = def.name;
      span.title = def.desc;
      badgeContainer.appendChild(span);
    }
  }

  // Rounds
  const roundList = document.getElementById('round-list');
  roundList.innerHTML = '';
  ROUNDS.forEach((round, i) => {
    const completed = state.roundsCompleted.has(round.id);
    const available = i === 0 || state.roundsCompleted.has(ROUNDS[i-1].id);
    const div = document.createElement('div');
    div.className = `round-item neon-box ${available ? 'available' : ''} ${completed ? 'completed' : ''}`;
    div.innerHTML = `
      <div class="round-num">0${i+1}</div>
      <div>
        <div class="round-name">${round.name} ${completed ? '<span style="color:var(--neon);font-size:12px;">✓</span>' : ''}</div>
        <div class="round-desc">${round.desc} — ${round.time}s per question</div>
      </div>
      <div style="margin-left:auto;font-family:var(--display);font-size:11px;color:var(--text-dim);">${round.qs}Q</div>
    `;
    if (available) {
      div.onclick = () => startRound(round);
    }
    roundList.appendChild(div);
  });
}

// ============================================================
//  ROUND FLOW
// ============================================================
function extractJSON(str) {
  if (!str || typeof str !== 'string') return null;

  const start = str.indexOf('[');
  const end = str.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) return null;

  return str.slice(start, end + 1);
}
async function startRound(round) {
  state.currentRound = round;
  state.currentQIndex = 0;
  state.currentSessionAnswers = [];

  showLoading('GENERATING QUESTIONS...');

  try {
    const questionsJson = await callClaude([{
      role: 'user',
      content: `Generate ${round.qs} interview questions for this round.

Round: ${round.name}
Job: ${state.jobTitle}
Job Listing: ${state.jobListing}

Candidate Resume: ${state.resumeText}

Return ONLY a JSON array of objects like:
[{"question": "...", "tip": "hint about what to cover", "type": "behavioral|technical|motivational"}]

Make questions specific to this candidate's background and the job requirements. No preamble, no markdown, just the JSON array.`
    }], `You are an expert interviewer and talent coach. Generate challenging, relevant interview questions. Always respond with only valid JSON.`);

    let questions;

    try {
      const extracted = extractJSON(questionsJson);

      if (!extracted) {
        throw new Error("No valid JSON array found in response");
      }

      questions = JSON.parse(extracted);

      // ✅ Basic validation
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error("Parsed JSON is not a valid questions array");
      }

    } catch (e) {
      // Fallback
      questions = Array.from({length: round.qs}, (_, i) => ({
        question: `Tell me about a time you demonstrated ${['leadership', 'problem-solving', 'collaboration', 'technical excellence', 'strategic thinking'][i % 5]} in your role.`,
        tip: 'Use the STAR method: Situation, Task, Action, Result.',
        type: 'behavioral'
      }));
    }

    state.currentQuestions = questions;
  } catch(e) {
    console.error('Question gen failed:', e);
    state.currentQuestions = Array.from({length: round.qs}, (_, i) => ({
      question: `Tell me about a key achievement from your career related to ${state.jobTitle}.`,
      tip: 'Be specific with numbers and outcomes.',
      type: 'behavioral'
    }));
  }

  hideLoading();
  await startWebcam();
  renderQuestion();
  showScreen('screen-interview');
}

function renderQuestion() {
  const q = state.currentQuestions[state.currentQIndex];
  const total = state.currentQuestions.length;

  document.getElementById('iv-round-label').textContent = state.currentRound.name;
  document.getElementById('q-number').textContent = `QUESTION ${String(state.currentQIndex+1).padStart(2,'0')} OF ${String(total).padStart(2,'0')}`;
  document.getElementById('q-text').textContent = q.question;
  document.getElementById('q-tip').textContent = `// TIP: ${q.tip}`;
  document.getElementById('iv-score').textContent = state.totalScore.toLocaleString();
  document.getElementById('iv-combo').textContent = 'x' + state.comboMultiplier;

  // Progress dots
  const dotsEl = document.getElementById('iv-progress');
  dotsEl.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot';
    if (i < state.currentQIndex) dot.classList.add('done');
    else if (i === state.currentQIndex) dot.classList.add('active');
    dotsEl.appendChild(dot);
  }

  // Reset for this question
  state.transcript = '';
  state.interimTranscript = '';
  state.wordCount = 0;
  state.fillerCount = 0;
  state.answerStartTime = null;
  state.timerSeconds = state.currentRound.time;

  document.getElementById('transcript-box').innerHTML = '<span style="color:var(--text-dim);font-family:var(--mono);font-size:11px;">Waiting for your response...</span>';
  document.getElementById('stat-wpm').textContent = '—';
  document.getElementById('stat-wpm').className = 'val';
  document.getElementById('stat-words').textContent = '0';
  document.getElementById('stat-fillers').textContent = '0';
  document.getElementById('stat-emotion').textContent = '—';
  document.getElementById('m-pace').style.width = '50%';
  document.getElementById('m-pace-val').textContent = '—';

  updateStars(0);
  resetTimer();

  document.getElementById('btn-start-speaking').style.display = '';
  document.getElementById('btn-submit').style.display = 'none';
  document.getElementById('rec-dot').style.display = 'none';
  document.getElementById('rec-label').textContent = 'STANDBY';
  document.getElementById('feedback-section').style.display = 'none';
}

function resetTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  updateTimerDisplay(state.currentRound.time);
}

function updateTimerDisplay(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  document.getElementById('timer-text').textContent = `${mins}:${String(secs).padStart(2,'0')}`;
  const total = state.currentRound.time;
  const pct = seconds / total;
  const circumference = 163;
  const offset = circumference * (1 - pct);
  const arc = document.getElementById('timer-arc');
  arc.setAttribute('stroke-dashoffset', Math.round(offset));
  arc.style.stroke = seconds < 30 ? 'var(--red)' : seconds < 60 ? 'var(--amber)' : 'var(--neon)';
}

// ============================================================
//  SPEECH RECOGNITION via local faster-whisper API
// ============================================================
async function startSpeaking() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    state.audioStream = stream;
    state.mediaRecorder = null;
    state.transcriptionPromises = [];
    state.transcriptionChain = Promise.resolve();
    state.recognitionActive = true;

    state.transcript = '';
    state.wordCount = 0;
    state.fillerCount = 0;
    state.answerStartTime = Date.now();
    state.timerSeconds = state.currentRound.time;

    document.getElementById('btn-start-speaking').style.display = 'none';
    document.getElementById('btn-submit').style.display = '';
    document.getElementById('rec-dot').style.display = '';
    document.getElementById('rec-label').textContent = 'RECORDING';
    document.getElementById('transcript-box').textContent = '';

    state.timerInterval = setInterval(() => {
      state.timerSeconds--;
      updateTimerDisplay(state.timerSeconds);

      if (state.timerSeconds <= 0) {
        submitAnswer();
      }
    }, 1000);

    recordNextAudioSegment();
  } catch (e) {
    console.error('Microphone start failed:', e);
    alert('Could not access microphone. Check browser microphone permissions.');
  }
}

function recordNextAudioSegment() {
  if (!state.recognitionActive || !state.audioStream) return;

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  const recorder = new MediaRecorder(state.audioStream, { mimeType });
  state.mediaRecorder = recorder;

  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = () => {
    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: mimeType });

      state.transcriptionChain = state.transcriptionChain
        .then(() => transcribeAudioChunk(blob))
        .catch(e => console.warn('Transcription chain failed:', e));

      state.transcriptionPromises.push(state.transcriptionChain);
    }

    if (state.recognitionActive) {
      recordNextAudioSegment();
    }
  };

  recorder.onerror = (event) => {
    console.error('MediaRecorder error:', event.error);
    document.getElementById('rec-label').textContent = 'AUDIO ERROR';
  };

  recorder.start();

  setTimeout(() => {
    if (state.recognitionActive && recorder.state === 'recording') {
      recorder.stop();
    }
  }, 5000);
}

async function transcribeAudioChunk(blob) {
  document.getElementById('rec-label').textContent = 'TRANSCRIBING';

  const form = new FormData();
  form.append('audio', blob, 'answer.webm');

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: form,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    const msg = data.error?.message || 'Transcription failed';
    console.error('Transcription failed:', msg);
    document.getElementById('rec-label').textContent = 'TRANSCRIPT ERROR';
    return;
  }

  const text = (data.text || '').trim();

  if (text) {
    state.transcript = `${state.transcript} ${text}`.replace(/\s+/g, ' ').trim();

    checkFillerWords(text);
    updateTranscriptStats();

    const box = document.getElementById('transcript-box');
    box.textContent = state.transcript;
    box.scrollTop = box.scrollHeight;
  }

  document.getElementById('rec-label').textContent =
    state.recognitionActive ? 'RECORDING' : 'ANALYZING';
}

function updateTranscriptStats() {
  const words = state.transcript.trim().split(/\s+/).filter(Boolean);
  state.wordCount = words.length;

  document.getElementById('stat-words').textContent = state.wordCount;
  document.getElementById('stat-fillers').textContent = state.fillerCount;

  const elapsed = (Date.now() - state.answerStartTime) / 60000;
  if (elapsed > 0.1) {
    const wpm = Math.round(state.wordCount / elapsed);
    const wpmEl = document.getElementById('stat-wpm');

    wpmEl.textContent = wpm;
    wpmEl.className = 'val';

    if (wpm < 100 || wpm > 200) wpmEl.classList.add('wpm-danger');
    else if (wpm < 120 || wpm > 175) wpmEl.classList.add('wpm-warning');
    else wpmEl.classList.add('wpm-good');

    const paceScore =
      wpm >= 120 && wpm <= 175 ? 80 :
      wpm >= 100 && wpm <= 200 ? 50 :
      20;

    updateMeter('m-pace', paceScore);
    document.getElementById('m-pace-val').textContent = wpm + ' WPM';
  }

  updateStars(Math.min(3, Math.floor(state.wordCount / 60)));
}

function checkFillerWords(text) {
  const lower = text.toLowerCase();

  for (const word of FILLER_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = lower.match(regex);

    if (matches) {
      state.fillerCount += matches.length;
      document.getElementById('stat-fillers').textContent = state.fillerCount;
      showFillerAlert(word);
    }
  }
}

function updateStars(count) {
  const stars = document.querySelectorAll('#iv-stars .star');
  stars.forEach((s, i) => {
    s.className = 'star ' + (i < count ? 'lit' : 'dim');
  });
}

// ============================================================
//  SUBMIT ANSWER + AI FEEDBACK
// ============================================================
async function submitAnswer() {
  if (!state.recognitionActive && document.getElementById('rec-label').textContent === 'ANALYZING') {
    return;
  }

  state.recognitionActive = false;

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  document.getElementById('btn-submit').style.display = 'none';
  document.getElementById('btn-start-speaking').style.display = 'none';
  document.getElementById('rec-dot').style.display = 'none';
  document.getElementById('rec-label').textContent = 'ANALYZING';

  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    await new Promise(resolve => {
      state.mediaRecorder.addEventListener('stop', resolve, { once: true });
      state.mediaRecorder.stop();
    });
  }

  await Promise.allSettled(state.transcriptionPromises || []);

  if (state.audioStream) {
    state.audioStream.getTracks().forEach(track => track.stop());
    state.audioStream = null;
  }

  updateTranscriptStats();

  let answerText = state.transcript.trim();
  if (!answerText) {
    answerText = '[No verbal response given]';
    state.transcript = answerText;
  }

  // Gather metrics
  const elapsed = state.answerStartTime ? (Date.now() - state.answerStartTime) / 1000 : 0;
  const wpm = elapsed > 0 ? Math.round(state.wordCount / (elapsed/60)) : 0;
  const eyePct = state.eyeContactSamples > 0 ? Math.round((state.eyeContactScore/state.eyeContactSamples)*100) : 50;
  const calmPct = state.calmSamples > 0 ? Math.round((state.calmScore/state.calmSamples)*100) : 50;
  const q = state.currentQuestions[state.currentQIndex];

  showLoading('AI IS EVALUATING YOUR RESPONSE...');

  let feedback;
  try {
    const raw = await callClaude([{
      role: 'user',
      content: `Evaluate this interview answer.

Question: ${q.question}
Question Type: ${q.type}
Job: ${state.jobTitle}
Job Requirements: ${state.jobListing}
Candidate Resume: ${state.resumeText}

Candidate's Answer: "${answerText}"

Speech Metrics:
- Words: ${state.wordCount}
- WPM: ${wpm} (ideal: 130-160)
- Filler words: ${state.fillerCount}
- Answer duration: ${Math.round(elapsed)}s
- Eye contact score: ${eyePct}%
- Composure score: ${calmPct}%

Respond ONLY with this JSON (no markdown, no preamble):
{
  "score": <integer 0-100>,
  "stars": <1|2|3>,
  "content_feedback": "<2-3 sentences on answer quality, specificity, structure>",
  "delivery_feedback": "<1-2 sentences on pacing, clarity, filler words, eye contact>",
  "improvement_tip": "<one actionable specific tip>",
  "badges": ["<badge_id>", ...],
  "xp_earned": <integer 50-300>
}

Badge IDs to award if earned: sharpshooter (130-160 WPM), ice_breaker (0 fillers), storyteller (150+ words), eye_contact (70%+ eye contact), speed_demon (answered in <90s), wordsmith (200+ words).`
    }], 'You are a tough but fair interview coach. Be direct and specific. Respond only with valid JSON.');

    const cleaned = raw.replace(/```json|```/g, '').trim();
    feedback = JSON.parse(cleaned);
  } catch(e) {
    console.error('Feedback failed:', e);
    feedback = {
      score: 60, stars: 2,
      content_feedback: 'Your answer touched on the key points. Try to be more specific with quantifiable outcomes.',
      delivery_feedback: wpm > 0 ? `You spoke at ${wpm} WPM. ${wpm > 175 ? 'Slow down slightly.' : wpm < 120 ? 'Try to speak a bit faster.' : 'Good pace.'}` : 'Work on speaking more clearly.',
      improvement_tip: 'Use the STAR method: Situation, Task, Action, Result.',
      badges: [],
      xp_earned: 100
    };
  }

  hideLoading();

  // Apply badges
  for (const b of (feedback.badges || [])) {
    state.earnedBadges.add(b);
  }

  // Combo system
  if (feedback.stars >= 2) {
    state.consecutiveGood++;
    if (state.consecutiveGood >= 3 && state.comboMultiplier < 4) {
      state.comboMultiplier = Math.min(4, state.comboMultiplier + 1);
      showComboFlash('COMBO x' + state.comboMultiplier + '!');
      state.earnedBadges.add('combo_king');
    }
  } else {
    state.consecutiveGood = 0;
    state.comboMultiplier = Math.max(1, state.comboMultiplier - 1);
  }

  const xpEarned = Math.round(feedback.xp_earned * state.comboMultiplier);
  const scoreEarned = Math.round(feedback.score * state.comboMultiplier);
  state.totalXP += xpEarned;
  state.totalScore += scoreEarned;
  state.streak = feedback.stars >= 2 ? state.streak + 1 : 0;

  // Store result
  state.currentSessionAnswers.push({
    question: q.question,
    answer: answerText,
    feedback,
    metrics: { wpm, wordCount: state.wordCount, fillerCount: state.fillerCount, eyePct, calmPct, elapsed: Math.round(elapsed) },
    xpEarned, scoreEarned,
    comboMultiplier: state.comboMultiplier,
  });

  // Update UI
  updateStars(feedback.stars);
  document.getElementById('iv-score').textContent = state.totalScore.toLocaleString();
  document.getElementById('iv-combo').textContent = 'x' + state.comboMultiplier;
  document.getElementById('hud-streak').textContent = state.streak;
  document.getElementById('hud-combo').textContent = 'x' + state.comboMultiplier;
  document.getElementById('hud-xp').textContent = state.totalXP;

  document.getElementById('feedback-section').style.display = '';
  document.getElementById('feedback-text').textContent = feedback.content_feedback + ' ' + feedback.delivery_feedback;
  document.getElementById('rec-label').textContent = 'DONE';

  // Advance or end
  await new Promise(r => setTimeout(r, 2000));

  state.currentQIndex++;
  if (state.currentQIndex < state.currentQuestions.length) {
    renderQuestion();
  } else {
    // Round complete
    state.roundsCompleted.add(state.currentRound.id);
    stopWebcam();
    showResults();
  }
}

// ============================================================
//  SCREEN 4: RESULTS
// ============================================================
function showResults() {
  const answers = state.currentSessionAnswers;
  const avgStars = answers.length ? answers.reduce((a, b) => a + b.feedback.stars, 0) / answers.length : 0;
  const totalXpSession = answers.reduce((a, b) => a + b.xpEarned, 0);

  // Grade
  const avgScore = answers.length ? answers.reduce((a, b) => a + b.feedback.score, 0) / answers.length : 0;
  let grade = 'REJECTED';
  if (avgScore >= 90) grade = 'OFFER EXTENDED — OUTSTANDING';
  else if (avgScore >= 75) grade = 'OFFER LIKELY — STRONG CANDIDATE';
  else if (avgScore >= 60) grade = 'ADVANCING TO NEXT ROUND';
  else if (avgScore >= 45) grade = 'BORDERLINE — NEEDS IMPROVEMENT';
  else grade = 'REJECTED — TRY AGAIN';

  document.getElementById('final-score-display').textContent = state.totalScore.toLocaleString();
  document.getElementById('final-grade').textContent = grade;
  document.getElementById('xp-gained-display').textContent = `+${totalXpSession} XP EARNED`;

  // Badges
  const badgesEl = document.getElementById('badges-earned');
  badgesEl.innerHTML = '';
  if (state.earnedBadges.size === 0) {
    badgesEl.innerHTML = '<span style="font-family:var(--mono);font-size:12px;color:var(--text-dim);">No badges earned this session. Keep improving!</span>';
  } else {
    for (const id of state.earnedBadges) {
      const def = BADGES_DEF.find(b => b.id === id);
      if (def) {
        const span = document.createElement('span');
        span.className = `badge ${def.color}`;
        span.innerHTML = `${def.name} <span style="opacity:0.6">${def.desc}</span>`;
        badgesEl.appendChild(span);
      }
    }
  }

  // Q breakdown
  const listEl = document.getElementById('q-results-list');
  listEl.innerHTML = '';
  answers.forEach((a, i) => {
    const card = document.createElement('div');
    card.className = 'q-result-card neon-box fade-in';
    card.style.animationDelay = (i * 0.1) + 's';
    const starsHtml = '★'.repeat(a.feedback.stars) + '☆'.repeat(3-a.feedback.stars);
    card.innerHTML = `
      <div class="q-result-top">
        <div class="q-result-question">${a.question}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
          <div style="font-family:var(--display);font-size:16px;color:var(--amber);letter-spacing:1px;">${starsHtml}</div>
          <div style="font-family:var(--display);font-size:13px;color:var(--neon);">+${a.xpEarned} XP</div>
          ${a.comboMultiplier > 1 ? `<div class="badge badge-amber">x${a.comboMultiplier} COMBO</div>` : ''}
        </div>
      </div>
      <div class="q-result-feedback">${a.feedback.content_feedback}</div>
      <div class="q-result-feedback" style="margin-top:6px;color:var(--text-dim);">${a.feedback.delivery_feedback}</div>
      <div style="margin-top:8px;padding:8px;background:var(--bg3);border-left:2px solid var(--neon);font-family:var(--mono);font-size:11px;color:var(--neon);">
        TIP: ${a.feedback.improvement_tip}
      </div>
      <div class="metrics-row">
        <span class="badge ${a.metrics.wpm >= 120 && a.metrics.wpm <= 175 ? 'badge-green' : 'badge-amber'}">${a.metrics.wpm} WPM</span>
        <span class="badge badge-blue">${a.metrics.wordCount} WORDS</span>
        ${a.metrics.fillerCount > 0 ? `<span class="badge badge-red">${a.metrics.fillerCount} FILLERS</span>` : '<span class="badge badge-green">0 FILLERS</span>'}
        <span class="badge badge-blue">${a.metrics.elapsed}s</span>
        <span class="badge badge-green">${a.metrics.eyePct}% EYE CONTACT</span>
      </div>
    `;
    listEl.appendChild(card);
  });

  showScreen('screen-results');
}

function endInterview() {
  state.recognitionActive = false;

  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }

  if (state.audioStream) {
    state.audioStream.getTracks().forEach(track => track.stop());
    state.audioStream = null;
  }

  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }

  stopWebcam();

  if (state.currentSessionAnswers.length > 0) {
    state.roundsCompleted.add(state.currentRound.id);
    showResults();
  } else {
    goToLobby();
  }
}

function goToLobby() {
  renderLobby();
  showScreen('screen-lobby');
}

function goToSetup() {
  state = { ...state, jobTitle: '', candidateName: '', jobListing: '', resumeText: '',
    totalXP: 0, totalScore: 0, streak: 0, comboMultiplier: 1, consecutiveGood: 0,
    earnedBadges: new Set(), roundsCompleted: new Set(), currentSessionAnswers: [] };
  showScreen('screen-setup');
}
