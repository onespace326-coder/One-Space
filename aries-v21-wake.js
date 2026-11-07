/* Aries V21 wake system
 * When something new arrives (mail, a meeting about to start, a task falling due, tasks Aries found in your inbox)
 * Aries wakes up: a glass card appears, the microphone button animates, and Aries speaks a short, merged update.
 * Runs in the browser. Uses the device's built-in voices and the voice chosen in Settings.
 * Browsers only allow sound after the page has had one tap/keypress; until then Aries shows the card and
 * speaks the moment you touch the page.
 */
(() => {
  'use strict';
  if (window.__ariesWakeActive) return;
  window.__ariesWakeActive = true;

  const $ = id => document.getElementById(id);
  const CFG_KEY = 'onespaceAriesWake', SEEN_KEY = 'onespaceAriesWakeSeenV21';
  const readJSON = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch (_) { return f; } };
  const cfg = { on: true, quiet: true, chime: true, mutedUntil: 0, ...readJSON(CFG_KEY, {}) };
  const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (_) {} };

  const synth = window.speechSynthesis || null;
  const userActive = () => !!(navigator.userActivation?.hasBeenActive) || interacted;
  let interacted = false, speaking = false, keepAlive = null, hideTimer = null, titleTimer = null, lastDelivered = 0;
  let pendingSpeech = null, delayedSpeakTimer = null, batch = [], batchTimer = null, baselineDone = false, scope = 'local';
  let seen = new Set(), hadStored = false;

  /* ---------- helpers ---------- */
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const speechSafe = (s, n = 80) => String(s || '').replace(/https?:\/\/\S+/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\d{6,}/g, '').replace(/[\[\]<>{}|_*#~^]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const firstName = s => speechSafe(String(s || '').split(/[<@]/)[0].replace(/["']/g, ''), 40).split(' ').slice(0, 2).join(' ') || 'someone';
  const mid = m => String(m.id || m.providerMessageId || m.messageId || `${m.email || ''}|${m.subject || ''}`);
  const SENSITIVE = /\b(otp|one[- ]time|verification code|security code|password|passcode|2fa|login code)\b/i;
  const IMPORTANT = /\b(urgent|action required|approval|approve|deadline|invoice|payment|asap|today|overdue|meeting|invitation|final notice|response needed)\b/i;
  const isImportant = m => !!(m.important || m.is_important) || IMPORTANT.test(`${m.subject || ''} ${m.snippet || ''}`);
  const callName = () => { try { const p = window.getAriesPersonalProfile?.() || window.getAriesPersonalContext?.()?.profile; return speechSafe(p?.preferred_name || p?.display_name || '', 24) || 'Boss'; } catch (_) { return 'Boss'; } };
  const hourNow = () => new Date().getHours();
  const inQuietHours = () => cfg.quiet && (hourNow() >= 22 || hourNow() < 7);
  const isMuted = () => cfg.mutedUntil && Date.now() < cfg.mutedUntil;
  const voiceEnabled = () => { try { return typeof prefs === 'undefined' || prefs.voiceAssistantEnabled !== false; } catch (_) { return true; } };
  const dayWord = d => { const t = new Date(); t.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0); const diff = Math.round((x - t) / 86400000); return diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff < 7 && diff > 0 ? x.toLocaleDateString('en-US', { weekday: 'long' }) : x.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }); };

  /* ---------- seen-set (what Aries already told you) ---------- */
  const seenKey = () => SEEN_KEY + ':' + scope;
  function loadSeen() { const raw = localStorage.getItem(seenKey()); hadStored = raw !== null; try { seen = new Set(JSON.parse(raw || '[]')); } catch (_) { seen = new Set(); } }
  function saveSeen() { try { localStorage.setItem(seenKey(), JSON.stringify([...seen].slice(-600))); } catch (_) {} }

  /* ---------- signals ---------- */
  const mailList = () => (typeof emails !== 'undefined' && Array.isArray(emails)) ? emails : [];
  const taskList = () => (typeof tasks !== 'undefined' && Array.isArray(tasks)) ? tasks : [];
  const eventList = () => (typeof events !== 'undefined' && Array.isArray(events)) ? events : [];
  const eventStart = e => { const d = e.startsAtISO ? new Date(e.startsAtISO) : null; return d && !Number.isNaN(d.getTime()) && !e.allDay ? d : null; };

  function collect() {
    const out = [], now = Date.now();
    for (const m of mailList()) {
      if (!(m.unread || m.is_read === false) || m.outbound || m.trashed || m.archived) continue;
      if (['sent', 'trash', 'spam', 'drafts', 'draft'].includes(String(m.folder || 'inbox').toLowerCase())) continue;
      out.push({ key: 'mail:' + mid(m), kind: 'mail', m });
    }
    for (const e of eventList()) {
      const s = eventStart(e); if (!s) continue;
      const mins = Math.round((s - now) / 60000);
      if (mins >= 0 && mins <= 15) out.push({ key: `evt:${e.id || e.title}:${s.getTime()}:${mins <= 5 ? 5 : 15}`, kind: 'event', e, mins });
    }
    for (const t of taskList()) {
      if (t.done || t.status === 'completed' || !t.dueAt) continue;
      const due = new Date(t.dueAt); if (Number.isNaN(due.getTime())) continue;
      const mins = Math.round((due - now) / 60000);
      if (mins >= 0 && mins <= 60) out.push({ key: `task:${t.id}:soon:${due.getTime()}`, kind: 'task-soon', t, mins });
      else if (mins < 0 && mins > -30) out.push({ key: `task:${t.id}:over:${due.getTime()}`, kind: 'task-over', t });
    }
    return out;
  }

  function check(reason) {
    if (!cfg.on) return;
    const signals = collect();
    if (!baselineDone) {
      baselineDone = true;
      if (!hadStored) { signals.forEach(s => seen.add(s.key)); saveSeen(); return; }     // first ever run: don't read the whole inbox aloud
    }
    const fresh = signals.filter(s => !seen.has(s.key));
    if (!fresh.length) return;
    fresh.forEach(s => seen.add(s.key)); saveSeen();
    try { window.onespaceBriefRemember?.(fresh.filter(s => s.kind === 'mail').map(s => mid(s.m))); } catch (_) {}
    enqueue(fresh);
  }

  /* ---------- batching + message ---------- */
  function enqueue(items) {
    batch.push(...items);
    clearTimeout(batchTimer);
    const wait = Math.max(3200, 15000 - (Date.now() - lastDelivered));      // merge bursts; never machine-gun
    batchTimer = setTimeout(flush, Math.min(wait, 15000));
  }
  function flush() {
    const items = batch.splice(0); if (!items.length) return;
    const msg = compose(items); if (!msg) return;
    deliver(msg);
  }
  function compose(items) {
    const mail = items.filter(i => i.kind === 'mail').map(i => i.m);
    const evts = items.filter(i => i.kind === 'event').sort((a, b) => a.mins - b.mins);
    const soon = items.filter(i => i.kind === 'task-soon').sort((a, b) => a.mins - b.mins);
    const over = items.filter(i => i.kind === 'task-over');
    const added = items.filter(i => i.kind === 'aries-task');
    const parts = []; let open = { screen: 'overview', label: 'Open' };
    const urgentFirst = [...evts.map(e => ({ w: 3, e })), ...soon.map(e => ({ w: 2, e }))];

    for (const { e } of urgentFirst.sort((a, b) => b.w - a.w)) {
      if (e.kind === 'event') { parts.push(`${speechSafe(e.e.title, 60)} starts ${e.mins <= 1 ? 'now' : `in ${e.mins} minutes`}.`); open = { screen: 'calendar', label: 'Open calendar' }; }
      else { parts.push(`${speechSafe(e.t.title, 60)} is due ${e.mins <= 1 ? 'now' : `in ${e.mins} minutes`}.`); open = { screen: 'tasks', label: 'Open tasks' }; }
      if (parts.length >= 2) break;
    }
    if (over.length) parts.push(`${plural(over.length, 'task')} just became overdue, starting with ${speechSafe(over[0].t.title, 60)}.`);

    const visibleMail = mail.filter(m => !SENSITIVE.test(`${m.subject || ''}`));
    if (visibleMail.length) {
      const imp = visibleMail.filter(isImportant), lead = (imp[0] || visibleMail[0]);
      if (visibleMail.length === 1) parts.push(`New email from ${firstName(lead.name || lead.email)}: ${speechSafe(lead.subject, 70)}${isImportant(lead) ? ', and it looks important' : ''}.`);
      else parts.push(`${plural(visibleMail.length, 'new email')}${imp.length ? `, ${imp.length === 1 ? 'one looks' : `${imp.length} look`} important` : ''}. ${imp.length ? 'Most urgent' : 'Latest'} is from ${firstName(lead.name || lead.email)}: ${speechSafe(lead.subject, 60)}.`);
      if (!parts.some(p => /starts|due/.test(p)) ) open = { screen: 'mail', label: 'Open inbox' };
    }
    if (mail.length > visibleMail.length) parts.push('A verification message also arrived; I haven’t read it out.');

    if (added.length) {
      const list = added.flatMap(a => a.tasks);
      const named = list.slice(0, 2).map(t => `${speechSafe(t.title, 50)}${t.due?.at ? `, due ${dayWord(t.due.at)}` : ''}`);
      parts.push(`I found ${plural(list.length, 'task')} in your mail and added ${list.length === 1 ? 'it' : 'them'} to your deadlines: ${named.join('; ')}${list.length > 2 ? `; and ${list.length - 2} more` : ''}.`);
      if (!mail.length && !evts.length && !soon.length) open = { screen: 'overview', label: 'See deadlines' };
    }
    if (!parts.length) return null;
    const hr = hourNow(), greet = Date.now() - lastDelivered > 3 * 3600e3 ? (hr < 12 ? `Good morning, ${callName()}.` : hr < 17 ? `Good afternoon, ${callName()}.` : `Good evening, ${callName()}.`) : `${callName()}, update.`;
    const urgent = evts.length > 0 || soon.length > 0 || over.length > 0 || mail.some(isImportant);
    return { text: `${greet} ${parts.join(' ')}`.replace(/\s+/g, ' ').trim(), open, urgent };
  }

  /* ---------- card ---------- */
  function ensureCard() {
    let c = $('ariesWakeCard'); if (c) return c;
    c = document.createElement('aside'); c.id = 'ariesWakeCard'; c.className = 'aries-wake-card'; c.setAttribute('role', 'status'); c.setAttribute('aria-live', 'polite'); c.hidden = true;
    c.innerHTML = `<div class="aries-wake-top"><span class="aries-wake-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><strong>Aries</strong><span class="aries-wake-state" id="ariesWakeState">Awake</span><button type="button" class="aries-wake-x" data-wake="close" aria-label="Dismiss update">×</button></div><p class="aries-wake-text" id="ariesWakeText"></p><div class="aries-wake-actions"><button type="button" class="softbtn primary" data-wake="open" id="ariesWakeOpen">Open</button><button type="button" class="softbtn" data-wake="replay">Replay</button><button type="button" class="softbtn" data-wake="mute" title="Mute Aries updates for an hour">Mute 1 h</button><button type="button" class="softbtn" data-wake="notify" id="ariesWakeNotify" hidden>Allow alerts</button></div>`;
    document.body.appendChild(c);
    c.addEventListener('click', e => {
      const b = e.target.closest('[data-wake]'); if (!b) return;
      const act = b.dataset.wake;
      if (act === 'close') { stopSpeech(); hideCard(); }
      if (act === 'open') { const o = c._open; if (o?.screen) window.showPage?.(o.screen); hideCard(); }
      if (act === 'replay' && c._text) { stopSpeech(); speak(c._text); }
      if (act === 'mute') { cfg.mutedUntil = Date.now() + 3600e3; saveCfg(); stopSpeech(); hideCard(); window.toast?.('Aries updates are muted for an hour.'); }
      if (act === 'notify') { Notification.requestPermission().then(p => { if (p === 'granted') { try { prefs.desktopNotifications = true; persistPrefs?.(); } catch (_) {} window.toast?.('Desktop alerts allowed.'); } b.hidden = true; }); }
    });
    c.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    c.addEventListener('mouseleave', () => { if (!speaking) scheduleHide(7000); });
    return c;
  }
  function showCard(msg) {
    const c = ensureCard();
    c._text = msg.text; c._open = msg.open;
    $('ariesWakeText').textContent = msg.text;
    const o = $('ariesWakeOpen'); if (o) o.textContent = msg.open?.label || 'Open';
    const n = $('ariesWakeNotify'); if (n) n.hidden = !('Notification' in window) || Notification.permission !== 'default';
    c.hidden = false; requestAnimationFrame(() => c.classList.add('is-open'));
    document.body.classList.add('aries-awake'); setTimeout(() => document.body.classList.remove('aries-awake'), 7000);
    clearTimeout(hideTimer);
  }
  function hideCard() { const c = $('ariesWakeCard'); if (!c) return; c.classList.remove('is-open'); setTimeout(() => { if (!c.classList.contains('is-open')) c.hidden = true; }, 320); }
  function scheduleHide(ms) { clearTimeout(hideTimer); hideTimer = setTimeout(hideCard, ms); }
  function setState(label, cls) { const s = $('ariesWakeState'), c = $('ariesWakeCard'); if (s) s.textContent = label; if (c) { c.classList.toggle('is-speaking', cls === 'speaking'); c.classList.toggle('is-waiting', cls === 'waiting'); } }

  /* ---------- sound ---------- */
  function chime() {
    if (!cfg.chime || !userActive()) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      const ctx = window.__ariesAudio || (window.__ariesAudio = new Ctx()); if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      [[660, 0], [880, 0.12]].forEach(([f, d]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.06, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35); o.connect(g).connect(ctx.destination); o.start(t0 + d); o.stop(t0 + d + 0.4); });
    } catch (_) {}
  }
  function stopSpeech() { pendingSpeech = null; clearTimeout(delayedSpeakTimer); try { window.ariesAudioDiagnostics?.stop?.(); } catch (_) {} try { synth?.cancel(); } catch (_) {} endSpeaking(); }
  function endSpeaking() { speaking = false; clearInterval(keepAlive); $('voiceOrb')?.classList.remove('speaking'); }
  function micBusy() { try { return !!(typeof isListening !== 'undefined' && isListening); } catch (_) { return false; } }

  function speak(text) {
    const message = String(text || '').trim();
    if (!message) return false;
    if (!voiceEnabled()) { setState('Voice off', ''); return false; }
    if (!synth || !window.SpeechSynthesisUtterance) { setState('Audio unavailable', ''); return false; }
    if (!userActive()) { pendingSpeech = message; setState('Tap to hear', 'waiting'); return false; }
    if (micBusy() || synth.speaking) {
      clearTimeout(delayedSpeakTimer);
      delayedSpeakTimer = setTimeout(() => speak(message), 1800);
      setState('Waiting', 'waiting');
      return true;
    }
    // Use the same speech engine as chat and the voice-preview control. This is
    // important because this alert engine previously bypassed Chrome diagnostics.
    const play = window.speakQueued || window.speakText;
    if (typeof play !== 'function') {
      pendingSpeech = message;
      setState('Tap to hear', 'waiting');
      return false;
    }
    const accepted = play(message, true);
    if (accepted === false) {
      pendingSpeech = message;
      setState('Tap to hear', 'waiting');
      return false;
    }
    pendingSpeech = null;
    return true;
  }

  window.addEventListener('onespace:aries-speech-start', () => {
    speaking = true;
    $('voiceOrb')?.classList.add('speaking');
    setState('Speaking', 'speaking');
    clearTimeout(hideTimer);
  });
  window.addEventListener('onespace:aries-speech-end', () => {
    endSpeaking();
    setState('Done', '');
    scheduleHide(9000);
  });
  window.addEventListener('onespace:aries-speech-error', (event) => {
    endSpeaking();
    setState(event.detail?.error === 'not-allowed' ? 'Tap to hear' : 'Audio issue', 'waiting');
    scheduleHide(15000);
  });
  window.addEventListener('onespace:aries-speech-stop', () => endSpeaking());

  /* ---------- delivery ---------- */
  function deliver(msg) {
    if (!cfg.on) return;
    lastDelivered = Date.now();
    try { window.renderNotifications?.(); } catch (_) {}
    try { window.appendChat?.(msg.text, 'assistant'); } catch (_) {}
    const silent = isMuted() || (inQuietHours() && !msg.urgent) || !voiceEnabled();
    showCard(msg);
    if (document.hidden) { notifyDesktop(msg.text); flashTitle(); }
    if (silent) { setState(isMuted() ? 'Muted' : !voiceEnabled() ? 'Voice off' : 'Quiet hours', ''); scheduleHide(12000); return; }
    chime();
    // Do not add an arbitrary delay after a gesture: it can lose transient activation.
    // Automatic attempts are still safe because the shared engine offers a replay button.
    speak(msg.text);
  }
  function notifyDesktop(body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const opts = { body, tag: 'aries-wake', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png' };
      if (navigator.serviceWorker?.ready) navigator.serviceWorker.ready.then(r => r.showNotification('Aries', opts)).catch(() => new Notification('Aries', opts));
      else new Notification('Aries', opts);
    } catch (_) {}
  }
  function flashTitle() {
    clearInterval(titleTimer); const base = document.title.replace(/^● /, ''); let on = false;
    titleTimer = setInterval(() => { document.title = (on = !on) ? '● Aries has an update' : base; if (!document.hidden) { clearInterval(titleTimer); document.title = base; } }, 1200);
  }

  /* ---------- unlock sound on first touch ---------- */
  const unlock = (event) => {
    if (!interacted) interacted = true;
    try { synth?.getVoices?.(); } catch (_) {}
    // These replay buttons start speech in their own click handlers; don't start twice.
    if (event?.target?.closest?.('#ariesTapToHearButton, [data-wake="replay"]')) return;
    if (pendingSpeech) {
      const t = pendingSpeech;
      pendingSpeech = null;
      // Call the shared engine inside this pointer/key gesture, without a timeout.
      const play = window.speakQueued || window.speakText;
      if (typeof play !== 'function' || play(t, true) === false) { pendingSpeech = t; setState('Tap to hear', 'waiting'); }
    }
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearInterval(titleTimer); document.title = document.title.replace(/^● Aries has an update$/, 'OneSpace'); check('visible'); } });

  /* ---------- wiring ---------- */
  let debounce = null;
  const soon = (reason, ms = 1200) => { clearTimeout(debounce); debounce = setTimeout(() => check(reason), ms); };
  window.addEventListener('onespace:data-loaded', e => { const next = e.detail?.userId || 'local'; if (next !== scope || !baselineDone) { scope = next; baselineDone = false; loadSeen(); } soon('data', 1500); });
  window.addEventListener('onespace:mail-updated', () => soon('mail'));
  window.addEventListener('onespace:google-auto-synced', () => soon('sync', 1800));
  window.addEventListener('aries:tasks-auto-added', e => { const tasks = e.detail?.tasks || []; if (tasks.length && cfg.on) enqueue([{ key: 'aries-task:' + tasks.map(t => t.taskId).join(','), kind: 'aries-task', tasks }]); });
  window.addEventListener('onespace:authenticated', () => { loadSeen(); setTimeout(() => check('auth'), 4000); });
  setInterval(() => { if (!document.hidden) check('tick'); else check('tick-hidden'); }, 20000);   // time-based alerts (meetings, due tasks)
  const origRender = window.renderNotifications;
  if (typeof origRender === 'function' && !origRender.__ariesWake) {
    const wrapped = function () { const r = origRender.apply(this, arguments); soon('render', 600); return r; }; wrapped.__ariesWake = true; window.renderNotifications = wrapped;
  }

  /* ---------- controls (live bar) ---------- */
  function mountControls() {
    const bar = $('liveBar'); if (!bar || $('liveWakeOn')) return;
    const wrap = document.createElement('span'); wrap.className = 'live-wake';
    wrap.innerHTML = `<span class="live-sep" aria-hidden="true"></span><label class="live-check"><input type="checkbox" id="liveWakeOn"> Wake Aries on new alerts</label><button type="button" class="live-btn" id="liveWakeTest">Test wake</button>`;
    bar.append(wrap);
    const cb = $('liveWakeOn'); cb.checked = !!cfg.on;
    cb.addEventListener('change', () => { cfg.on = cb.checked; if (cfg.on) cfg.mutedUntil = 0; saveCfg(); window.toast?.(cfg.on ? 'Aries will wake up and speak when something new arrives.' : 'Aries will no longer wake on new alerts.');
      if (cfg.on && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); });
    $('liveWakeTest').addEventListener('click', () => { interacted = true; deliver({ text: `${callName()}, I’m awake. This is how I’ll update you when new mail, meetings or deadlines come in.`, open: { screen: 'assistant', label: 'Open Aries' }, urgent: true }); });
  }
  const mountTimer = setInterval(() => { mountControls(); if ($('liveWakeOn')) clearInterval(mountTimer); }, 800);
  setTimeout(() => clearInterval(mountTimer), 60000);

  window.ariesWake = { deliver, check, compose, config: cfg, consumePendingSpeech: () => { pendingSpeech = null; clearTimeout(delayedSpeakTimer); }, test: () => $('liveWakeTest')?.click() };
  loadSeen();
})();
