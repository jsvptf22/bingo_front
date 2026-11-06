(() => {
  'use strict';

  /* =============================================================
     Constantes
     ============================================================= */

  const STORAGE_KEY = 'bingoqr.juego.v1';
  const LEGACY_KEY = 'bingoqr.state.v1';
  const MAX_NUMBER = 500;
  const COLORS = ['#D8FF3E', '#FF6B4A', '#7DD6FF', '#FFC857', '#9BE58B', '#FF9FBE', '#C7B9FF', '#FFB27D'];

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  function uid() {
    return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  /* =============================================================
     Estado
     ============================================================= */

  function defaultState() {
    return {
      activeGame: null,
      draft: null,
      history: [],
      sound: true,
    };
  }

  function normalizeNumber(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > MAX_NUMBER) return null;
    return number;
  }

  function uniqueNumbers(list) {
    const seen = new Set();
    const result = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
      const number = normalizeNumber(item);
      if (number === null || seen.has(number)) return;
      seen.add(number);
      result.push(number);
    });
    return result;
  }

  function normalizeState(data) {
    if (!data || typeof data !== 'object') return null;

    const activeNumbers = data.activeGame ? uniqueNumbers(data.activeGame.numbers) : [];
    const draftNumbers = data.draft ? uniqueNumbers(data.draft.numbers) : [];

    const activeGame =
      data.activeGame && activeNumbers.length
        ? {
            id: typeof data.activeGame.id === 'string' && data.activeGame.id ? data.activeGame.id : uid(),
            numbers: activeNumbers,
            startedAt: Number(data.activeGame.startedAt) || Date.now(),
          }
        : null;

    const draft = draftNumbers.length
      ? {
          numbers: draftNumbers,
          updatedAt: Number(data.draft.updatedAt) || Date.now(),
        }
      : null;

    const history = Array.isArray(data.history)
      ? data.history
          .filter((game) => game && Array.isArray(game.numbers))
          .slice(0, 20)
          .map((game) => ({
            id: typeof game.id === 'string' && game.id ? game.id : uid(),
            numbers: uniqueNumbers(game.numbers),
            startedAt: Number(game.startedAt) || Date.now(),
            endedAt: Number(game.endedAt) || Date.now(),
          }))
          .filter((game) => game.numbers.length)
      : [];

    return {
      activeGame,
      draft,
      history,
      sound: data.sound !== false,
    };
  }

  function migrateLegacy(data) {
    if (!data || typeof data !== 'object') return null;

    const players = Array.isArray(data.players) ? data.players : [];
    const codeToNumber = new Map();
    players.forEach((player) => {
      if (!player || typeof player.code !== 'string') return;
      const number = normalizeNumber(String(player.code).replace(/^#/, '').trim());
      if (number !== null) codeToNumber.set(player.id, number);
    });

    const idsToNumbers = (ids) =>
      (Array.isArray(ids) ? ids : []).map((id) => codeToNumber.get(id)).filter((value) => value !== undefined);

    const activeNumbers = data.activeGame ? uniqueNumbers(idsToNumbers(data.activeGame.playerIds)) : [];
    const draftNumbers = data.draft
      ? uniqueNumbers(
          (Array.isArray(data.draft.scans) ? data.draft.scans : [])
            .map((scan) => {
              if (!scan) return null;
              if (codeToNumber.has(scan.playerId)) return codeToNumber.get(scan.playerId);
              return normalizeNumber(String(scan.code || '').replace(/^#/, '').trim());
            })
            .filter((value) => value !== null)
        )
      : [];

    const legacy = normalizeState({
      activeGame: data.activeGame
        ? { id: data.activeGame.id, numbers: activeNumbers, startedAt: data.activeGame.startedAt }
        : null,
      draft: draftNumbers.length ? { numbers: draftNumbers, updatedAt: data.draft && data.draft.updatedAt } : null,
      history: Array.isArray(data.history)
        ? data.history.map((game) => ({
            id: game && game.id,
            numbers: game ? idsToNumbers(game.playerIds) : [],
            startedAt: game && game.startedAt,
            endedAt: game && game.endedAt,
          }))
        : [],
      sound: data.sound,
    });

    return legacy;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = normalizeState(JSON.parse(raw));
        if (parsed) return parsed;
      }

      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const migrated = migrateLegacy(JSON.parse(legacyRaw));
        if (migrated) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
      }
    } catch (error) {
      /* estado corrupto: se empieza de cero */
    }
    return defaultState();
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('No se pudo guardar el estado:', error);
    }
  }

  function draftNumbers() {
    return state.draft ? state.draft.numbers : [];
  }

  function ensureDraft() {
    if (!state.draft) state.draft = { numbers: [], updatedAt: Date.now() };
    return state.draft;
  }

  /* =============================================================
     Sonido
     ============================================================= */

  let audioCtx = null;

  function audio() {
    if (!state.sound) return null;
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (error) {
      return null;
    }
  }

  function tone(frequency, duration = 0.08, delay = 0, type = 'sine', volume = 0.05) {
    const ctx = audio();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function playScan() {
    tone(920, 0.06, 0, 'sine', 0.05);
    tone(1380, 0.09, 0.055, 'sine', 0.04);
  }

  function playError() {
    tone(185, 0.11, 0, 'square', 0.03);
  }

  function playFanfare() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      tone(frequency, 0.16, index * 0.085, 'triangle', 0.05);
    });
  }

  /* =============================================================
     Toasts y confeti
     ============================================================= */

  const toastStack = $('#toasts');
  const confettiLayer = $('#confetti-layer');

  function toast(message, options = {}) {
    const { tone: toneName = 'success', duration } = options;
    const element = document.createElement('div');
    element.className = 'toast';
    if (toneName === 'warn' || toneName === 'error') {
      element.classList.add(`toast--${toneName}`);
    }
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    element.appendChild(paragraph);

    while (toastStack.children.length >= 3) {
      toastStack.firstElementChild.remove();
    }

    toastStack.appendChild(element);
    window.setTimeout(() => {
      if (!element.isConnected) return;
      element.classList.add('is-out');
      window.setTimeout(() => element.remove(), 220);
    }, duration || 3200);
  }

  function launchConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confettiLayer.innerHTML = '';
    const count = 84;

    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = COLORS[i % COLORS.length];
      piece.style.width = `${5 + Math.random() * 5}px`;
      piece.style.height = `${8 + Math.random() * 9}px`;
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.setProperty('--x', `${(Math.random() - 0.5) * 160}px`);
      piece.style.setProperty('--r', `${(Math.random() * 2 - 1) * 760}deg`);
      piece.style.setProperty('--dur', `${1.7 + Math.random() * 1.5}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.3}s`);
      confettiLayer.appendChild(piece);
    }

    window.setTimeout(() => {
      confettiLayer.innerHTML = '';
    }, 3600);
  }

  /* =============================================================
     Pantallas: inicio y juego
     ============================================================= */

  const startPanel = $('#start-panel');
  const gamePanel = $('#game-panel');
  const activeCount = $('#active-count');
  const activePlayers = $('#active-players');
  const elapsedTimer = $('#elapsed-timer');
  const scanDialog = $('#scan-dialog');
  const scanListEl = $('#scan-list');
  const scanCountEl = $('#scan-count');
  const scanFooter = $('#scan-footer');
  const scanRequiredEl = $('#scan-required');
  const startGameBtn = $('#btn-start-game');
  const scanFeedbackEl = $('#scan-feedback');
  const manualInput = $('#manual-code');
  const manualForm = $('#manual-form');

  let timerId = 0;

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  function tickTimer() {
    if (!state.activeGame) return;
    elapsedTimer.textContent = formatDuration(Date.now() - state.activeGame.startedAt);
  }

  function startTimer() {
    window.clearInterval(timerId);
    tickTimer();
    timerId = window.setInterval(tickTimer, 500);
  }

  function stopTimer() {
    window.clearInterval(timerId);
    timerId = 0;
  }

  function renderHome() {
    startPanel.classList.remove('hidden');
    gamePanel.classList.add('hidden');
    stopTimer();
  }

  function renderGame() {
    const game = state.activeGame;
    if (!game) {
      renderHome();
      return;
    }

    startPanel.classList.add('hidden');
    gamePanel.classList.remove('hidden');
    activeCount.textContent = String(game.numbers.length);

    activePlayers.innerHTML = game.numbers
      .map(
        (number, index) => `
        <li class="player-row" style="--i:${index}">
          <span class="player-row-index" aria-hidden="true">${pad2(index + 1)}</span>
          <span class="player-row-num">#${number}</span>
          <span class="player-row-label">Jugador</span>
        </li>`
      )
      .join('');

    startTimer();
  }

  function renderAll() {
    // Si hay un juego activo, mostrar el juego
    if (state.activeGame) {
      startPanel.classList.add('hidden');
      gamePanel.classList.remove('hidden');
      if (scanDialog.open) scanDialog.close();
      renderGame();
      return;
    }
    
    // Si hay un borrador (escaneo en proceso), abrir el escáner
    if (state.draft && state.draft.numbers.length > 0) {
      startPanel.classList.add('hidden');
      gamePanel.classList.add('hidden');
      renderScanList();
      setScanFeedback('');
      manualInput.value = '';
      if (!scanDialog.open) {
        scanDialog.showModal();
        window.requestAnimationFrame(() => startCamera());
      }
      return;
    }
    
    // Si no hay nada, mostrar pantalla de inicio
    startPanel.classList.remove('hidden');
    gamePanel.classList.add('hidden');
    if (scanDialog.open) scanDialog.close();
    stopTimer();
  }

  /* =============================================================
     Escáner: apertura y cierre
     ============================================================= */

  let feedbackTimer = 0;

  function setScanFeedback(message, toneName = 'ok') {
    window.clearTimeout(feedbackTimer);
    if (!message) {
      scanFeedbackEl.textContent = '';
      scanFeedbackEl.classList.add('hidden');
      return;
    }
    scanFeedbackEl.textContent = message;
    scanFeedbackEl.classList.remove('hidden');
    scanFeedbackEl.classList.toggle('is-warn', toneName === 'warn');
  }

  function renderScanList(scrollToEnd = false) {
    const numbers = draftNumbers();

    scanListEl.innerHTML = numbers
      .map(
        (number) => `
        <li class="scan-player">
          <span class="scan-player-num">#${number}</span>
          <span class="scan-player-label">Jugador</span>
          <button class="scan-player-remove" type="button" data-remove-number="${number}" aria-label="Quitar al jugador ${number} de la lista" title="Quitar">×</button>
        </li>`
      )
      .join('');

    scanCountEl.textContent = String(numbers.length);

    const ready = numbers.length >= 1;
    scanFooter.classList.toggle('hidden', !ready);
    startGameBtn.disabled = !ready;
    startGameBtn.classList.toggle('is-ready', ready);
    scanRequiredEl.classList.toggle('hidden', ready);

    if (scrollToEnd) scanListEl.scrollTop = scanListEl.scrollHeight;
  }

  function openScanner() {
    setScanFeedback('');
    renderScanList();
    manualInput.value = '';

    if (!scanDialog.open) scanDialog.showModal();
    window.requestAnimationFrame(() => startCamera());
  }

  function closeScanner() {
    stopCamera();
    if (scanDialog.open) scanDialog.close();
    if (state.draft && state.draft.numbers.length === 0) state.draft = null;
    save();
    renderAll();
  }

  $('#btn-new-game').addEventListener('click', () => {
    state.draft = { numbers: [], updatedAt: Date.now() };
    save();
    openScanner();
  });

  $('#scan-close').addEventListener('click', closeScanner);

  scanDialog.addEventListener('close', () => {
    stopCamera();
    if (state.draft && state.draft.numbers.length === 0) state.draft = null;
    save();
    renderAll();
  });

  scanDialog.addEventListener('cancel', () => {
    stopCamera();
  });

  /* =============================================================
     Escáner: cámara
     ============================================================= */

  const cameraEl = $('#camera');
  const video = $('#video');
  const canvas = $('#qr-canvas');
  const cameraPill = $('#camera-pill');
  const cameraPillText = $('#camera-pill-text');
  const cameraMessage = $('#camera-message');
  const cameraHint = $('#camera-hint');
  const cameraPlaceholder = $('#camera-placeholder');

  const camera = {
    stream: null,
    raf: 0,
    running: false,
    starting: false,
    lastCode: '',
    lastFrame: 0,
  };

  function setCameraState(kind) {
    const states = {
      requesting: {
        pill: 'Iniciando cámara',
        message: 'Solicitando permiso para usar la cámara…',
        hint: 'Permite el acceso cuando el navegador lo pregunte.',
        error: false,
        live: false,
        tone: 'waiting',
      },
      scanning: {
        pill: 'Cámara activa',
        message: '',
        hint: 'Apunta la cámara al código QR del jugador.',
        error: false,
        live: true,
        tone: 'live',
      },
      paused: {
        pill: 'Escaneo en pausa',
        message: 'Jugador agregado. Pulsa «Agregar jugador» para escanear otro.',
        hint: 'También puedes escribir el número abajo.',
        error: false,
        live: false,
        tone: 'waiting',
      },
      denied: {
        pill: 'Cámara bloqueada',
        message: 'No tenemos acceso a la cámara. Escribe el número del jugador abajo.',
        hint: 'Revisa los permisos del navegador o usa la entrada manual.',
        error: true,
        live: false,
        tone: 'error',
      },
      unsupported: {
        pill: 'Sin cámara',
        message: 'Este navegador no puede escanear con cámara. Escribe el número abajo.',
        hint: 'La entrada manual funciona igual que un escaneo.',
        error: true,
        live: false,
        tone: 'error',
      },
      insecure: {
        pill: 'Cámara no disponible',
        message: 'En el móvil la cámara necesita HTTPS. Abre la app con una dirección segura o escribe el número abajo.',
        hint: 'La entrada manual funciona igual que un escaneo.',
        error: true,
        live: false,
        tone: 'error',
      },
      error: {
        pill: 'Error de cámara',
        message: 'No se pudo iniciar la cámara. Escribe el número del jugador abajo.',
        hint: 'La entrada manual funciona igual que un escaneo.',
        error: true,
        live: false,
        tone: 'error',
      },
    };

    const config = states[kind] || states.paused;

    cameraEl.classList.toggle('is-live', config.live);
    cameraPlaceholder.classList.toggle('is-error', config.error);
    cameraPill.className = 'camera-pill';
    if (config.tone === 'live') cameraPill.classList.add('is-live');
    if (config.tone === 'error') cameraPill.classList.add('is-error');
    cameraPillText.textContent = config.pill;
    cameraMessage.textContent = config.message;
    cameraHint.textContent = config.hint;
  }

  function stopCamera() {
    camera.running = false;
    camera.starting = false;
    if (camera.raf) {
      cancelAnimationFrame(camera.raf);
      camera.raf = 0;
    }
    if (camera.stream) {
      camera.stream.getTracks().forEach((track) => track.stop());
      camera.stream = null;
    }
    video.srcObject = null;
    camera.lastCode = '';
    camera.lastFrame = 0;
  }

  function cameraIsAvailable() {
    return Boolean(
      navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function' &&
        typeof window.jsQR === 'function'
    );
  }

  function focusManualInput() {
    manualInput.focus({ preventScroll: true });
    manualInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function startCamera() {
    if (!scanDialog.open) return;
    if (camera.running || camera.starting) return;

    if (window.isSecureContext === false) {
      setCameraState('insecure');
      focusManualInput();
      return;
    }

    if (!cameraIsAvailable()) {
      setCameraState('unsupported');
      focusManualInput();
      return;
    }

    camera.starting = true;
    setCameraState('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      if (!scanDialog.open) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      camera.stream = stream;
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => {});
      camera.running = true;
      camera.lastCode = '';
      camera.lastFrame = 0;
      setCameraState('scanning');
      camera.raf = requestAnimationFrame(cameraLoop);
    } catch (error) {
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        setCameraState('denied');
      } else {
        setCameraState('error');
      }
      focusManualInput();
    } finally {
      camera.starting = false;
    }
  }

  function cameraLoop(timestamp) {
    if (!camera.running) return;

    camera.raf = requestAnimationFrame(cameraLoop);
    if (timestamp - camera.lastFrame < 100) return;
    camera.lastFrame = timestamp;

    if (!video.videoWidth || !video.videoHeight) return;

    const scale = Math.min(1, 640 / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const result = window.jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });

    if (!result || !result.data) return;

    const value = String(result.data);
    if (value === camera.lastCode) return;
    camera.lastCode = value;
    handleScannedCode(value, 'camera');
  }

  /* =============================================================
     Escáner: agregar jugadores
     ============================================================= */

  function extractCode(raw) {
    let value = String(raw == null ? '' : raw).trim();
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        const query = url.searchParams.get('code') || url.searchParams.get('player');
        const pathCode = url.pathname.split('/').filter(Boolean).pop();
        value = decodeURIComponent(query || pathCode || value);
      } catch (error) {
        /* se usa el valor original */
      }
    }

    return value.replace(/\s+/g, '').replace(/^#/, '');
  }

  function readNumber(raw) {
    const code = extractCode(raw);
    if (!/^\d{1,6}$/.test(code)) return null;
    return normalizeNumber(Number(code));
  }

  function handleScannedCode(raw, source = 'camera') {
    if (!scanDialog.open) return;

    const number = readNumber(raw);
    if (number === null) {
      setScanFeedback(`Código no válido. Usa un número del 1 al ${MAX_NUMBER}.`, 'warn');
      playError();
      return;
    }

    const draft = ensureDraft();
    if (draft.numbers.includes(number)) {
      setScanFeedback(`El jugador #${number} ya está en la lista.`, 'warn');
      playError();
      return;
    }

    draft.numbers.push(number);
    draft.updatedAt = Date.now();
    save();

    renderScanList(true);
    setScanFeedback(`Jugador #${number} agregado a la lista.`);
    playScan();
    if (navigator.vibrate) navigator.vibrate(35);

    if (source === 'manual') {
      manualInput.value = '';
      manualInput.blur();
    }

    stopCamera();
    setCameraState('paused');
  }

  manualForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = manualInput.value.trim();
    if (!value) {
      manualInput.focus();
      return;
    }
    handleScannedCode(value, 'manual');
  });

  $('#btn-add-player').addEventListener('click', () => {
    setScanFeedback('');
    if (window.isSecureContext === false || !cameraIsAvailable()) {
      startCamera();
      focusManualInput();
      return;
    }
    startCamera();
  });

  scanListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-number]');
    if (!button) return;
    if (!state.draft) return;

    const number = Number(button.dataset.removeNumber);
    state.draft.numbers = state.draft.numbers.filter((item) => item !== number);
    state.draft.updatedAt = Date.now();
    if (state.draft.numbers.length === 0) {
      save();
      setScanFeedback('Lista vacía. Escanea un código para agregar jugadores.', 'warn');
      renderScanList();
      startCamera();
      return;
    }

    save();
    renderScanList();
    setScanFeedback(`Jugador #${number} quitado de la lista.`, 'warn');
  });

  /* =============================================================
     Iniciar y terminar juego
     ============================================================= */

  function archiveGame(game) {
    if (!game) return;
    state.history.unshift({
      id: game.id,
      numbers: [...game.numbers],
      startedAt: game.startedAt,
      endedAt: Date.now(),
    });
    state.history = state.history.slice(0, 20);
  }

  function startGame() {
    const numbers = draftNumbers();
    if (!numbers.length) {
      setScanFeedback('Escanea al menos 1 jugador para iniciar.', 'warn');
      playError();
      return;
    }

    stopCamera();

    if (state.activeGame) archiveGame(state.activeGame);

    state.activeGame = {
      id: uid(),
      numbers: [...numbers],
      startedAt: Date.now(),
    };
    state.draft = null;
    save();

    if (scanDialog.open) scanDialog.close();
    renderAll();

    toast(`Juego iniciado con ${numbers.length} ${numbers.length === 1 ? 'jugador' : 'jugadores'}`);
    playFanfare();
    launchConfetti();
  }

  startGameBtn.addEventListener('click', startGame);

  const confirmDialog = $('#confirm-dialog');
  const confirmTitle = $('#confirm-title');
  const confirmMessage = $('#confirm-message');
  const confirmOk = $('#confirm-ok');
  let confirmCallback = null;

  function openConfirm({ title, message, confirmLabel = 'Confirmar', onConfirm }) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOk.textContent = confirmLabel;
    confirmCallback = typeof onConfirm === 'function' ? onConfirm : null;
    confirmDialog.showModal();
  }

  $('#confirm-cancel').addEventListener('click', () => confirmDialog.close());

  confirmDialog.addEventListener('close', () => {
    confirmCallback = null;
  });

  confirmOk.addEventListener('click', () => {
    const callback = confirmCallback;
    confirmCallback = null;
    confirmDialog.close();
    if (callback) callback();
  });

  $('#btn-end-game').addEventListener('click', () => {
    if (!state.activeGame) return;
    const count = state.activeGame.numbers.length;
    openConfirm({
      title: '¿Terminar el juego?',
      message: `Se cerrará la partida con ${count} ${count === 1 ? 'jugador' : 'jugadores'} y volverás a la pantalla inicial.`,
      confirmLabel: 'Terminar juego',
      onConfirm: () => {
        archiveGame(state.activeGame);
        state.activeGame = null;
        state.draft = null;
        save();
        stopTimer();
        renderAll();
        toast('Juego terminado');
      },
    });
  });

  /* =============================================================
     Inicio
     ============================================================= */

  renderAll();
})();
