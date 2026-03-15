const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const buttons = document.querySelectorAll('.mode-btn');

const MODES = Object.freeze({
  FINGER_EFFECTS: 'finger-effects',
  AIR_DRAWING: 'air-drawing',
  MUSIC_GRID: 'music-grid',
});

const INSTRUMENTS = Object.freeze({
  PIANO: 'piano',
  GUITAR: 'guitar',
});

let activeMode = null;
let globalSecondHandCount = 0; 
let selectedInstrument = INSTRUMENTS.PIANO;


const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
console.log(`[Device] Running on ${isMobile ? 'Mobile' : 'Desktop'}`);

document.body.addEventListener('touchstart', async () => {
  if (!toneStarted) {
    await Tone.start();
    toneStarted = true;
    console.log('[Audio] Tone.js unlocked via touch');
  }
}, { once: true });


const instrumentMenu = document.getElementById('instrument-menu');
const instrumentButtons = document.querySelectorAll('.toggle-btn[data-instrument]');


function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();


async function initWebcam() {
  try {
    const videoConstraints = isMobile 
      ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      : { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } };

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    video.srcObject = stream;
    console.log('[webcam] stream started with mobile setup:', isMobile);
  } catch (err) {
    console.error('[webcam] could not access camera:', err);
  }
}
initWebcam();


function logState() {
  console.log('[State]', {
    activeMode,
    selectedInstrument: activeMode === MODES.MUSIC_GRID ? selectedInstrument : '—',
  });
}

function updateInstrumentMenu() {
  instrumentMenu.classList.toggle('visible', activeMode === MODES.MUSIC_GRID);
}

// audio
const PENTATONIC = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5'];
const POWER_CHORDS = [
  ['C2', 'G2'], ['D2', 'A2'], ['Eb2', 'Bb2'],
  ['F2', 'C3'], ['G2', 'D3'], ['Bb2', 'F3'],
];

let toneStarted = false;

const pianoSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.02, decay: 0.3, sustain: 0.1, release: 0.8 },
  volume: -8,
});
pianoSynth.toDestination();

const guitarDistortion = new Tone.Distortion({ distortion: 0.9, oversample: '4x' });
const guitarFilter = new Tone.Filter({ type: 'lowpass', frequency: 2500, rolloff: -24 });
const guitarEcho = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 0.35 });

const guitarSynth = new Tone.PolySynth(Tone.FMSynth, {
  harmonicity: 2,
  modulationIndex: 8,
  oscillator: { type: 'sawtooth' },
  modulation: { type: 'square' },
  envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.8 },
  modulationEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.25, release: 0.5 },
  volume: -6,
});
guitarSynth.chain(guitarDistortion, guitarFilter, guitarEcho, Tone.Destination);

async function ensureToneStarted() {
  if (!toneStarted) {
    await Tone.start();
    toneStarted = true;
    console.log('[Audio] Tone.js context started');
  }
}

function playNote() {
  if (selectedInstrument === INSTRUMENTS.PIANO) {
    const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    pianoSynth.triggerAttackRelease(note, '8n');
  } else {
    const chord = POWER_CHORDS[Math.floor(Math.random() * POWER_CHORDS.length)];
    guitarSynth.triggerAttackRelease(chord, '8n');
  }
}

// music grid
const GRID_COLS = 8;
const GRID_ROWS = 6;
const palette = ['#ffc900', '#ff90e8', '#00ffff', '#39ff14', '#9500ff'];

let lastCell = { col: -1, row: -1 };
let activeCell = null;

// draw grid
function drawGrid() {
  const w = canvas.width;
  const h = canvas.height;
  const cellW = w / GRID_COLS;
  const cellH = h / GRID_ROWS;

  if (activeCell) {
    ctx.fillStyle = activeCell.color;
    ctx.fillRect(activeCell.col * cellW, activeCell.row * cellH, cellW, cellH);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.strokeRect(activeCell.col * cellW, activeCell.row * cellH, cellW, cellH);
  }

  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;

  for (let i = 0; i <= GRID_COLS; i++) {
    const x = Math.round(i * cellW);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  for (let j = 0; j <= GRID_ROWS; j++) {
    const y = Math.round(j * cellH);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// mediapipe
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: isMobile ? 0 : 1, 
  minDetectionConfidence: isMobile ? 0.5 : 0.7,
  minTrackingConfidence: isMobile ? 0.5 : 0.6,
});

let latestResults = null;

hands.onResults((results) => {
  latestResults = results;
});

const mpCamera = new Camera(video, {
  onFrame: async () => {
    await hands.send({ image: video });
  },
  width: 1280,
  height: 720,
});
mpCamera.start();
console.log('[MediaPipe] Hands camera loop started');

// finger effects
const offscreenCanvas = document.createElement('canvas');
const offCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
offscreenCanvas.width = 640;
offscreenCanvas.height = 480;

const trailBuffer = document.createElement('canvas');
const trailCtx = trailBuffer.getContext('2d', { willReadFrequently: true });
trailBuffer.width = 640;
trailBuffer.height = 480;

const frozenBackgroundBuffer = document.createElement('canvas');
const frozenCtx = frozenBackgroundBuffer.getContext('2d', { willReadFrequently: true });
frozenBackgroundBuffer.width = 640;
frozenBackgroundBuffer.height = 480;
let isFrozen = false;

let fireParticles = [];

// air drawing
let airStrokes = []; 
let currentAirStroke = null; 
let lastPinchPos = null; 
let draggedStroke = null; 

function countFingers(landmarks) {
  let count = 0;
  const fingers = [
    { tip: 8, pip: 6 }, 
    { tip: 12, pip: 10 }, 
    { tip: 16, pip: 14 }, 
    { tip: 20, pip: 18 }  
  ];
  for (const f of fingers) {
    if (landmarks[f.tip].y < landmarks[f.pip].y) {
      count++;
    }
  }
  const distTip = Math.hypot(landmarks[4].x - landmarks[17].x, landmarks[4].y - landmarks[17].y);
  const distIP = Math.hypot(landmarks[3].x - landmarks[17].x, landmarks[3].y - landmarks[17].y);
  if (distTip > distIP) {
    count++;
  }
  return count;
}

function drawAirStrokes() {
  ctx.strokeStyle = '#00ffff'; 
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 15; 

  for (let stroke of airStrokes) {
    if (stroke.length < 2) continue;

    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);

    let i;
    for (i = 1; i < stroke.length - 2; i++) {
      const xc = (stroke[i].x + stroke[i + 1].x) / 2;
      const yc = (stroke[i].y + stroke[i + 1].y) / 2;
      ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, xc, yc);
    }

    if (stroke.length > 2) {
      ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, stroke[i + 1].x, stroke[i + 1].y);
    }

    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

// render loop
function renderLoop() {
  let fingerCount = 0;
  let secondHandCount = 0;

  let currentFingerCount = 0;
  globalSecondHandCount = 0;

  if (latestResults && latestResults.multiHandLandmarks && latestResults.multiHandLandmarks.length > 0) {
    for (let i = 0; i < latestResults.multiHandedness.length; i++) {
      const label = latestResults.multiHandedness[i].label;
      const count = countFingers(latestResults.multiHandLandmarks[i]);

      if (label === 'Left') {
        currentFingerCount = count;
      } else if (label === 'Right') {
        globalSecondHandCount = count;
      }
    }
  }

  if (activeMode === MODES.FINGER_EFFECTS) {
    if (latestResults && latestResults.multiHandLandmarks && latestResults.multiHandLandmarks.length > 0) {
      fingerCount = 0;
      secondHandCount = 0;

      for (let i = 0; i < latestResults.multiHandedness.length; i++) {
        const label = latestResults.multiHandedness[i].label;
        const count = countFingers(latestResults.multiHandLandmarks[i]);

        if (label === 'Left') {
          fingerCount = count; 
        } else if (label === 'Right') {
          secondHandCount = count; 
        }
      }
    }
  }

  if (!(activeMode === MODES.FINGER_EFFECTS && (fingerCount === 3 || fingerCount === 4))) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  if (activeMode === MODES.FINGER_EFFECTS) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';

    offCtx.save();
    offCtx.translate(offscreenCanvas.width, 0);
    offCtx.scale(-1, 1);

    if (fingerCount === 2) {
      offCtx.filter = 'blur(4px)';
    } else {
      offCtx.filter = 'none';
    }

    offCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    offCtx.restore();

    if (fingerCount === 3 || fingerCount === 4) {
      if (!window.feedbackBuffer) {
        window.feedbackBuffer = document.createElement('canvas');
        window.feedbackBuffer.width = offscreenCanvas.width;
        window.feedbackBuffer.height = offscreenCanvas.height;
        window.fbCtx = window.feedbackBuffer.getContext('2d', { willReadFrequently: true });
        window.fbCtx.fillStyle = '#000000';
        window.fbCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      }
    }

    const imgData = offCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    const scaleX = w / offscreenCanvas.width;
    const scaleY = h / offscreenCanvas.height;

    switch (fingerCount) {
      case 0:
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
        break;

      case 1: {
        let dotFillStyle = '#000000';
        let dotBgFillStyle = '#ffffff';

        switch (secondHandCount) {
          case 0: break; 
          case 1: dotFillStyle = '#1500ff'; break; 
          case 2: dotFillStyle = '#ff1493'; break; 
          case 3: dotFillStyle = '#a020f0'; break; 
          case 4: dotFillStyle = '#ffffff'; dotBgFillStyle = '#000000'; break; 
          case 5: dotFillStyle = '#00ff00'; break; 
        }

        ctx.fillStyle = dotBgFillStyle;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = dotFillStyle;
        for (let y = 0; y < offscreenCanvas.height; y += 4) {
          for (let x = 0; x < offscreenCanvas.width; x += 4) {
            const i = (y * offscreenCanvas.width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            let luma = 0.299 * r + 0.587 * g + 0.114 * b;

            luma = Math.pow(luma / 255, 1.5) * 255;

            const radius = 2.0 * (1 - luma / 255);
            if (radius > 0.2) {
              ctx.beginPath();
              ctx.arc(x * scaleX, y * scaleY, radius * scaleX, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        break;
      }

      case 2: {
        const stripWidth = 24;

        for (let x = 0; x < w; x += stripWidth) {
          let srcX = (x / w) * offscreenCanvas.width;
          let srcStripW = (stripWidth / w) * offscreenCanvas.width;

          let refractX = Math.max(0, srcX - 15);
          let refractW = srcStripW + 20;

          ctx.drawImage(
            offscreenCanvas,
            refractX, 0, refractW, offscreenCanvas.height,
            x, 0, stripWidth, h
          );

          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(x, 0, 2, h);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fillRect(x + stripWidth - 2, 0, 2, h);
        }
        break;
      }

      case 3: {
        window.fbCtx.globalAlpha = 0.1;
        window.fbCtx.drawImage(window.feedbackBuffer, 2, 2, offscreenCanvas.width + 4, offscreenCanvas.height + 4, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

        window.fbCtx.globalAlpha = 0.05;
        window.fbCtx.save();
        window.fbCtx.translate(offscreenCanvas.width, 0);
        window.fbCtx.scale(-1, 1);
        window.fbCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
        window.fbCtx.restore();
        window.fbCtx.globalAlpha = 1.0;

        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();

        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(window.feedbackBuffer, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }

      case 4: {
        if (!window.prevOffscreenCanvas) {
          window.prevOffscreenCanvas = document.createElement('canvas');
          window.prevOffscreenCanvas.width = offscreenCanvas.width;
          window.prevOffscreenCanvas.height = offscreenCanvas.height;
          window.prevOffCtx = window.prevOffscreenCanvas.getContext('2d', { willReadFrequently: true });
          window.prevOffCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        }

        const trailImgData = trailCtx.getImageData(0, 0, trailBuffer.width, trailBuffer.height);
        const trailData = trailImgData.data;
        const prevData = window.prevOffCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height).data;

        for (let i = 0; i < data.length; i += 4) {
          const diffR = Math.abs(data[i] - prevData[i]);
          const diffG = Math.abs(data[i + 1] - prevData[i + 1]);
          const diffB = Math.abs(data[i + 2] - prevData[i + 2]);
          const diff = (diffR + diffG + diffB) / 3;

          if (diff > 30) {
            trailData[i] = 0; 
            trailData[i + 1] = 255; 
            trailData[i + 2] = 255; 
            trailData[i + 3] = 255; 
          } else {
            trailData[i + 3] = Math.max(0, trailData[i + 3] - 15);
          }
        }
        trailCtx.putImageData(trailImgData, 0, 0);

        window.prevOffCtx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();

        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(trailBuffer, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        break;
      }

      case 5:
      default: {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        ctx.font = 'bold 12px monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        switch (secondHandCount) {
          case 0: ctx.fillStyle = '#ffffff'; break;
          case 1: ctx.fillStyle = '#ffd700'; break;
          case 2: ctx.fillStyle = '#ff1493'; break;
          case 3: ctx.fillStyle = '#a020f0'; break;
          case 4: ctx.fillStyle = '#00ffff'; break;
          case 5: ctx.fillStyle = '#00ff00'; break;
          default: ctx.fillStyle = '#ffffff'; break;
        }

        const density = 'Ñ@#W$9876543210?!abc;:+=-,._ ';

        for (let y = 0; y < offscreenCanvas.height; y += 10) {
          for (let x = 0; x < offscreenCanvas.width; x += 10) {
            const i = (y * offscreenCanvas.width + x) * 4;
            let luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

            luma = Math.pow(luma / 255, 1.3) * 255;

            let charIndex = Math.floor((1 - luma / 255) * (density.length - 1));
            charIndex = Math.max(0, Math.min(density.length - 1, charIndex));
            const char = density[charIndex];

            if (char !== ' ') {
              ctx.fillText(char, x * scaleX, y * scaleY);
            }
          }
        }
        ctx.shadowBlur = 0;
        break;
      }
    }

  } else if (activeMode === MODES.AIR_DRAWING) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (globalSecondHandCount === 5) {
      airStrokes = [];
      currentAirStroke = null;
      draggedStroke = null;
      console.log("[Air Drawing] Canvas cleared");
    }

    if (latestResults && latestResults.multiHandLandmarks && latestResults.multiHandLandmarks.length > 0) {
      const landmarks = latestResults.multiHandLandmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      const mx = (1 - indexTip.x) * canvas.width;
      const my = indexTip.y * canvas.height;
      const thumbX = (1 - thumbTip.x) * canvas.width;
      const thumbY = thumbTip.y * canvas.height;

      const pinchDist = Math.hypot(mx - thumbX, my - thumbY);
      const isPinching = pinchDist < 45; 

      const isPointing = (landmarks[8].y < landmarks[6].y) && (landmarks[12].y > landmarks[10].y) && !isPinching;

      if (isPinching) {
        currentAirStroke = null; 
        const pinchCenter = { x: (mx + thumbX) / 2, y: (my + thumbY) / 2 };

        if (!lastPinchPos) {
          draggedStroke = null; 

          if (airStrokes.length > 0) {
            const lastStroke = airStrokes[airStrokes.length - 1];
            let hitLast = false;
            for (let pt of lastStroke) {
              if (Math.hypot(pinchCenter.x - pt.x, pinchCenter.y - pt.y) < 60) {
                hitLast = true;
                break;
              }
            }

            if (hitLast) {
              draggedStroke = lastStroke; 
            } else {
              for (let i = airStrokes.length - 2; i >= 0; i--) {
                const stroke = airStrokes[i];
                let hitMain = false;
                for (let pt of stroke) {
                  if (Math.hypot(pinchCenter.x - pt.x, pinchCenter.y - pt.y) < 50) {
                    hitMain = true;
                    break;
                  }
                }
                if (hitMain) {
                  draggedStroke = stroke; 
                  break; 
                }
              }
            }
          }
        }

        if (draggedStroke && lastPinchPos) {
          const dx = pinchCenter.x - lastPinchPos.x;
          const dy = pinchCenter.y - lastPinchPos.y;

          for (let pt of draggedStroke) {
            pt.x += dx;
            pt.y += dy;
          }
        }

        lastPinchPos = pinchCenter;

        ctx.fillStyle = draggedStroke ? '#ff1493' : '#888';
        ctx.beginPath();
        ctx.arc(pinchCenter.x, pinchCenter.y, 12, 0, Math.PI * 2);
        ctx.fill();

      } else if (isPointing) {
        lastPinchPos = null;
        draggedStroke = null;

        if (!currentAirStroke) {
          currentAirStroke = [];
          airStrokes.push(currentAirStroke);
        }

        if (currentAirStroke.length > 0) {
          const lastPt = currentAirStroke[currentAirStroke.length - 1];
          if (Math.hypot(mx - lastPt.x, my - lastPt.y) > 3) {
            currentAirStroke.push({ x: mx, y: my });
          }
        } else {
          currentAirStroke.push({ x: mx, y: my });
        }

        ctx.fillStyle = '#39ff14';
        ctx.beginPath();
        ctx.arc(mx, my, 8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        lastPinchPos = null;
        currentAirStroke = null;
        draggedStroke = null;
      }
    } else {
      lastPinchPos = null;
      currentAirStroke = null;
      draggedStroke = null;
    }

    drawAirStrokes();

  } else if (activeMode === MODES.MUSIC_GRID) {
    activeCell = null;

    if (latestResults && latestResults.multiHandLandmarks && latestResults.multiHandLandmarks.length > 0) {
      const landmarks = latestResults.multiHandLandmarks[0];
      const tip = landmarks[8]; 

      const mx = 1 - tip.x;
      const my = tip.y;

      const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(mx * GRID_COLS)));
      const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(my * GRID_ROWS)));

      const colorIndex = ((row * 2) + col) % palette.length;
      activeCell = { col, row, color: palette[colorIndex] };

      if (col !== lastCell.col || row !== lastCell.row) {
        lastCell.col = col;
        lastCell.row = row;
        playNote();
      }

      const dotX = mx * canvas.width;
      const dotY = my * canvas.height;
      ctx.fillStyle = '#ff90e8';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    drawGrid();
  }

  requestAnimationFrame(renderLoop);
}
renderLoop();

// mode switching
function setMode(mode) {
  if (activeMode === mode) {
    activeMode = null;
    console.log(`[Mode] Deactivated: ${mode}`);
  } else {
    activeMode = mode;
    console.log(`[Mode] Activated: ${mode}`);

    if (mode === MODES.MUSIC_GRID) {
      ensureToneStarted();
    }
  }

  if (activeMode !== MODES.MUSIC_GRID) {
    lastCell.col = -1;
    lastCell.row = -1;
    activeCell = null;
  }

  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === activeMode);
  });

  updateInstrumentMenu();
  logState();
}

buttons.forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

// instrument switching
function setInstrument(instrument) {
  selectedInstrument = instrument;
  console.log(`[Instrument] Selected: ${instrument}`);

  instrumentButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.instrument === instrument);
  });

  logState();
}

instrumentButtons.forEach(btn => {
  btn.addEventListener('click', () => setInstrument(btn.dataset.instrument));
});