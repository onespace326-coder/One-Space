/* OneSpace V31 — single Chrome-resilient Aries speech controller.
   Waits for asynchronous voice discovery, retries once with the system voice,
   reports browser errors, and keeps a user-gesture replay path. */
(() => {
  'use strict';

  const synth = window.speechSynthesis || null;
  const $ = id => document.getElementById(id);
  let active = null;
  let activeQueue = [];
  let queueIndex = 0;
  let pendingText = '';
  let lastError = '';
  let startTimer = 0;
  let requestToken = 0;
  let gestureSeen = !!navigator.userActivation?.hasBeenActive;
  let replayButton = null;

  const feminine = /(samantha|ava|karen|victoria|allison|zira|jenny|aria|susan|sara|moira|tessa|veena|serena|natasha|hazel|sonia|libby|joanna|kendra|kimberly|salli|ivy|olivia|emma|amy)/i;
  const errors = {
    'not-allowed': 'Chrome blocked automatic speech. Tap “Hear Aries” to play this reply, then check this site’s Sound permission if needed.',
    'audio-busy': 'The audio output is busy. Close other apps using the speaker and retry.',
    'audio-hardware': 'Chrome cannot access your speaker. Check the selected output device and system volume.',
    'network': 'The selected voice needs a network connection. Choose an installed voice or Auto.',
    'language-unavailable': 'No installed voice supports that language. Set Voice language to Auto or English (India).',
    'voice-unavailable': 'The selected voice is unavailable. Choose Auto in Voice settings.',
    'synthesis-failed': 'The system speech service failed. Try the voice sample again.'
  };

  const pref = (key, fallback) => {
    try {
      return typeof prefs !== 'undefined' && prefs[key] != null ? prefs[key] : fallback;
    } catch (_) {
      return fallback;
    }
  };

  function voices() {
    try { return synth?.getVoices?.() || []; } catch (_) { return []; }
  }

  function waitForVoices(timeoutMs = 1600) {
    const current = voices();
    if (current.length || !synth) return Promise.resolve(current);
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { synth.removeEventListener?.('voiceschanged', finish); } catch (_) {}
        resolve(voices());
      };
      const timer = setTimeout(finish, timeoutMs);
      try {
        synth.addEventListener?.('voiceschanged', finish, { once: true });
        // Some Chrome builds populate the list only after getVoices is called.
        synth.getVoices?.();
      } catch (_) {
        finish();
      }
    });
  }

  function chooseVoice(list = voices()) {
    if (!list.length) return null;
    const selectedUri = pref('voiceURI', 'auto');
    if (selectedUri && selectedUri !== 'auto') {
      const selected = list.find(voice => voice.voiceURI === selectedUri);
      if (selected) return selected;
    }
    const language = String(pref('voiceLanguage', 'hi-IN')).toLowerCase().replace('_', '-');
    const base = language.split('-')[0];
    const exact = list.filter(voice => String(voice.lang || '').toLowerCase().replace('_', '-') === language);
    const same = list.filter(voice => String(voice.lang || '').toLowerCase().startsWith(base));
    const english = list.filter(voice => /^en([_-]|$)/i.test(voice.lang || ''));
    return exact.find(voice => feminine.test(voice.name)) ||
      exact.find(voice => voice.default) || exact[0] ||
      same.find(voice => feminine.test(voice.name)) ||
      same.find(voice => voice.default) || same[0] ||
      english.find(voice => feminine.test(voice.name)) ||
      english.find(voice => voice.default) || english[0] ||
      list.find(voice => voice.default) || list[0];
  }

  function fallbackLanguage(configured) {
    // If Hindi is selected but this device has no Hindi voice, prefer a
    // supported English-India voice rather than forcing an unavailable locale.
    return /^hi([_-]|$)/i.test(configured) ? 'en-IN' : (configured || 'en-US');
  }

  function setStatus(message) {
    const state = $('voiceState');
    const diagnostic = $('voiceDiagnosticStatus');
    if (state) state.textContent = message;
    if (diagnostic) diagnostic.textContent = message;
  }

  function dispatch(name, detail = {}) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function splitText(value) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    const sentences = normalized.match(/[^.!?]+[.!?]*/g) || [normalized];
    const chunks = [];
    let part = '';
    for (const sentence of sentences) {
      const next = `${part} ${sentence}`.trim();
      if (next.length <= 185) {
        part = next;
        continue;
      }
      if (part) chunks.push(part);
      part = '';
      const words = sentence.trim().split(' ');
      for (const word of words) {
        const candidate = `${part} ${word}`.trim();
        if (candidate.length > 185 && part) {
          chunks.push(part);
          part = word;
        } else {
          part = candidate;
        }
      }
    }
    if (part) chunks.push(part);
    return chunks;
  }

  function clearStartTimer() {
    if (startTimer) clearTimeout(startTimer);
    startTimer = 0;
  }

  function ensureReplayButton() {
    if (replayButton?.isConnected) return replayButton;
    replayButton = $('ariesTapToHearButton') || document.createElement('button');
    replayButton.id = 'ariesTapToHearButton';
    replayButton.type = 'button';
    replayButton.textContent = '▶  Hear Aries';
    replayButton.setAttribute('aria-label', 'Play the last Aries reply');
    replayButton.style.cssText = 'display:none;position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483000;padding:12px 16px;border:1px solid var(--accent,#6371d9);border-radius:999px;background:var(--accent-strong,var(--accent,#6371d9));color:#fff;box-shadow:0 8px 26px #0004;font:700 13px inherit;cursor:pointer';
    if (!replayButton.isConnected) document.body.appendChild(replayButton);
    replayButton.onclick = () => {
      const text = pendingText;
      if (!text) return;
      noteGesture();
      replayButton.style.display = 'none';
      speakNow(text, { force: true, source: 'manual-replay' });
    };
    return replayButton;
  }

  function replay(text, code, message) {
    const raw = String(text || '').trim();
    clearStartTimer();
    active = null;
    activeQueue = [];
    queueIndex = 0;
    pendingText = raw;
    lastError = code || 'speech-failed';
    if (raw) ensureReplayButton().style.display = 'inline-flex';
    setStatus(message || 'Aries audio did not start. Tap Hear Aries to retry.');
    dispatch('onespace:aries-speech-error', {
      error: lastError,
      message: message || errors[lastError] || 'Speech playback failed.',
      replayAvailable: !!raw
    });
  }

  function stop() {
    requestToken += 1;
    clearStartTimer();
    active = null;
    activeQueue = [];
    queueIndex = 0;
    pendingText = '';
    try { synth?.cancel?.(); } catch (_) {}
    if (replayButton) replayButton.style.display = 'none';
    $('voiceOrb')?.classList.remove('speaking');
    setStatus('Aries voice stopped');
    dispatch('onespace:aries-speech-stop');
  }

  async function speakNow(text, { force = false, source = 'assistant' } = {}) {
    const raw = String(text || '').trim();
    if (!raw) return false;
    if (!force && (!pref('voiceAssistantEnabled', true) || !pref('autoSpeak', true))) return false;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      replay(raw, 'synthesis-unavailable', 'Speech output is not available in this browser or device.');
      return false;
    }

    const token = ++requestToken;
    clearStartTimer();
    if (active || synth.speaking || synth.pending) {
      try { synth.cancel(); } catch (_) {}
    }
    try { synth.resume?.(); } catch (_) {}

    setStatus('Preparing Aries voice…');
    const available = await waitForVoices(1600);
    if (token !== requestToken) return false;

    const voice = chooseVoice(available);
    const configuredLanguage = String(pref('voiceLanguage', 'hi-IN') || 'hi-IN');
    const language = voice?.lang || fallbackLanguage(configuredLanguage);
    activeQueue = splitText(raw);
    queueIndex = 0;
    pendingText = raw;
    lastError = '';
    if (replayButton) replayButton.style.display = 'none';

    function finish() {
      clearStartTimer();
      active = null;
      activeQueue = [];
      queueIndex = 0;
      pendingText = '';
      $('voiceOrb')?.classList.remove('speaking');
      setStatus('Tap the microphone to speak');
      dispatch('onespace:aries-speech-end', { source });
    }

    function nextChunk() {
      if (token !== requestToken) return;
      if (queueIndex >= activeQueue.length) {
        finish();
        return;
      }
      const chunk = activeQueue[queueIndex];
      let fallbackAttempted = false;

      function attempt(useSystemVoice = false) {
        if (token !== requestToken) return;
        clearStartTimer();
        const utterance = new window.SpeechSynthesisUtterance(chunk);
        utterance.lang = useSystemVoice ? fallbackLanguage('en-US') : language;
        utterance.rate = Math.max(.75, Math.min(1.3, Number(pref('voiceRate', .94)) || .94));
        utterance.pitch = Math.max(.7, Math.min(1.4, Number(pref('voicePitch', 1.08)) || 1.08));
        utterance.volume = 1;
        if (!useSystemVoice && voice) utterance.voice = voice;
        active = utterance;
        let started = false;

        startTimer = setTimeout(() => {
          if (active !== utterance || started) return;
          active = null;
          try { synth.cancel(); } catch (_) {}
          if (!fallbackAttempted) {
            fallbackAttempted = true;
            attempt(true);
          } else {
            replay(raw, 'start-timeout', 'Chrome did not start the voice service. Check site Sound permission and tap Hear Aries to retry.');
          }
        }, 8500);

        utterance.onstart = () => {
          if (active !== utterance) return;
          started = true;
          clearStartTimer();
          $('voiceOrb')?.classList.add('speaking');
          const voiceLabel = useSystemVoice ? 'device default voice' : (voice?.name || 'device default voice');
          setStatus(`Aries is speaking · ${voiceLabel}`);
          dispatch('onespace:aries-speech-start', { source, voice: voiceLabel, language: utterance.lang });
        };

        utterance.onend = () => {
          if (active !== utterance) return;
          clearStartTimer();
          active = null;
          queueIndex += 1;
          nextChunk();
        };

        utterance.onerror = event => {
          if (active !== utterance) return;
          clearStartTimer();
          active = null;
          const code = String(event?.error || 'synthesis-failed');
          if (code === 'canceled' || code === 'interrupted') return;
          if (!fallbackAttempted && code !== 'not-allowed' && code !== 'audio-busy' && code !== 'audio-hardware') {
            fallbackAttempted = true;
            attempt(true);
            return;
          }
          $('voiceOrb')?.classList.remove('speaking');
          replay(raw, code, errors[code] || `Chrome speech error: ${code}. Tap Hear Aries to retry.`);
        };

        try {
          synth.speak(utterance);
          if (synth.paused) synth.resume();
        } catch (error) {
          if (!fallbackAttempted) {
            fallbackAttempted = true;
            attempt(true);
          } else {
            replay(raw, 'synthesis-failed', `Aries audio could not start: ${error?.message || 'speech service error'}`);
          }
        }
      }

      attempt(false);
    }

    nextChunk();
    return true;
  }

  function noteGesture() {
    gestureSeen = true;
    try { if (synth?.paused) synth.resume(); } catch (_) {}
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach(type => {
    window.addEventListener(type, noteGesture, { capture: true, passive: true });
  });

  synth?.addEventListener?.('voiceschanged', () => {
    try { window.loadVoices?.(); } catch (_) {}
    const count = voices().length;
    const element = $('diagVoiceCount');
    if (element) element.textContent = count ? `${count} installed` : 'Default system voice';
  });

  document.addEventListener?.('visibilitychange', () => {
    if (!document.hidden && active && synth?.paused) {
      try { synth.resume(); } catch (_) {}
    }
  });
  window.addEventListener('pageshow', () => {
    if (active && synth?.paused) {
      try { synth.resume(); } catch (_) {}
    }
  });

  window.speakText = (value, force = false) =>
    speakNow(value, { force: !!force, source: 'assistant-reply' });
  window.speakQueued = value =>
    speakNow(value, { force: true, source: 'queued-alert' });
  window.playAriesVoicePreview = () =>
    speakNow('Hello. I am Aries, your personal assistant. This is a test of your browser voice output.', {
      force: true,
      source: 'voice-preview'
    });
  window.testAssistantVoice = () => window.playAriesVoicePreview();
  window.stopAriesSpeech = stop;
  window.ariesAudioDiagnostics = {
    supported: !!(synth && window.SpeechSynthesisUtterance),
    browser: /Chrome|Chromium/i.test(navigator.userAgent) ? 'Chromium-based' : navigator.userAgent,
    voices: voices().length,
    voiceNames: () => voices().map(voice => ({ name: voice.name, language: voice.lang, default: !!voice.default })),
    hasUserGesture: () => gestureSeen,
    lastError: () => lastError,
    replayAvailable: () => !!pendingText,
    replay: () => pendingText ? speakNow(pendingText, { force: true, source: 'diagnostic-replay' }) : false,
    speak: value => speakNow(value, { force: true, source: 'diagnostic-test' }),
    stop
  };
})();
