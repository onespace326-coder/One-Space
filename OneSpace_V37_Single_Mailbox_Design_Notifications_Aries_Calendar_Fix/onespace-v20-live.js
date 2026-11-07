/* OneSpace V20 — Live layer
 * 1) Balanced Overview columns (no row gaps)
 * 2) Live-sync controls (rate + last-synced status)
 * 3) Aries spoken executive briefings, like a PA updating a CEO
 * Runs entirely in the browser. Speech uses the device's built-in voices.
 */
(() => {
  'use strict';
  if (window.__onespaceV20Live) return;
  window.__onespaceV20Live = true;
  const $ = (id) => document.getElementById(id);
  const KEY = 'onespaceLive';
  const read = () => { try { return { briefOn: true, briefEvery: 30, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (_) { return { briefOn: true, briefEvery: 30 }; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
  const cfg = read();
  const syncMs = () => { const v = Number(localStorage.getItem('onespaceSyncMs')); return Number.isFinite(v) && localStorage.getItem('onespaceSyncMs') !== null ? v : 30000; };
  const snap = () => { try { return window.getOneSpaceSnapshot?.() || { tasks: [], emails: [], events: [] }; } catch (_) { return { tasks: [], emails: [], events: [] }; } };

  /* ---------- 1. balanced columns ---------- */
  let balanceTries = 0;
  function balance() {
    const L = document.querySelector('#overview .leftcol'), R = document.querySelector('#overview .rightcol');
    if (!L || !R) return false;
    const mail = document.querySelector('#overview .overview-mail-intelligence');
    const attn = document.querySelector('#overview .priority-mail-panel');
    const next = document.querySelector('#overview .up-wrap');
    const notes = $('dailyNotesPanel');
    if (!(mail && attn && next && notes)) return false;
    // left: what needs action; right: time + reflection
    if (L.firstElementChild !== attn) L.prepend(attn);
    if (mail.parentElement !== L) L.append(mail);
    if (next.parentElement !== R) R.prepend(next);
    if (notes.parentElement !== R) R.append(notes);
    return true;
  }
  const balanceTimer = setInterval(() => { if (balance() || ++balanceTries > 40) clearInterval(balanceTimer); }, 500);

  /* ---------- 2. live bar ---------- */
  let lastSync = null;
  const fmtAgo = (d) => {
    if (!d) return 'Waiting for first sync';
    const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
    if (s < 10) return 'Synced just now';
    if (s < 60) return `Synced ${s}s ago`;
    const m = Math.round(s / 60);
    return m < 60 ? `Synced ${m} min ago` : `Synced ${Math.round(m / 60)} h ago`;
  };
  function buildBar() {
    const welcome = document.querySelector('#overview .welcome');
    if (!welcome || $('liveBar')) return;
    const bar = document.createElement('div');
    bar.id = 'liveBar'; bar.className = 'live-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Live sync and voice briefing controls');
    const rate = String(syncMs());
    bar.innerHTML = `
      <span class="live-dot" id="liveDot"></span><strong id="liveSyncText">${fmtAgo(lastSync)}</strong>
      <label>Sync every
        <select id="liveSyncRate" aria-label="Sync rate">
          <option value="15000">15 sec</option><option value="30000">30 sec</option><option value="60000">1 min</option><option value="300000">5 min</option><option value="0">Off</option>
        </select></label>
      <button type="button" id="liveSyncNow" class="live-btn">Sync now</button>
      <span class="live-sep" aria-hidden="true"></span>
      <label class="live-check"><input type="checkbox" id="liveBriefOn"> Aries voice updates</label>
      <label>every
        <select id="liveBriefEvery" aria-label="Voice update interval">
          <option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 hour</option>
        </select></label>
      <button type="button" id="liveBriefNow" class="live-btn">Brief me now</button>`;
    welcome.after(bar);
    $('liveSyncRate').value = ['15000', '30000', '60000', '300000', '0'].includes(rate) ? rate : '30000';
    $('liveBriefOn').checked = !!cfg.briefOn;
    $('liveBriefEvery').value = String(cfg.briefEvery);
    $('liveSyncRate').addEventListener('change', (e) => {
      localStorage.setItem('onespaceSyncMs', e.target.value);
      window.onespaceRestartAutoSync?.();
      note(e.target.value === '0' ? 'Automatic sync is off.' : 'Sync rate updated.');
    });
    $('liveSyncNow').addEventListener('click', syncNow);
    $('liveBriefOn').addEventListener('change', (e) => { cfg.briefOn = e.target.checked; save(cfg); note(cfg.briefOn ? 'Aries will update you by voice.' : 'Voice updates are off.'); });
    $('liveBriefEvery').addEventListener('change', (e) => { cfg.briefEvery = Number(e.target.value); save(cfg); });
    $('liveBriefNow').addEventListener('click', () => briefing({ force: true }));
  }
  const note = (m) => { try { (window.toast || window.notify)?.(m); } catch (_) {} };
  async function syncNow() {
    const btn = $('liveSyncNow'); if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
    try {
      const sync = document.querySelector('[data-ceo-action="sync"]');
      if (sync) sync.click(); else if (window.onespaceCloud?.syncGoogle) await window.onespaceCloud.syncGoogle({ mode: 'manual' });
      markSynced();
    } catch (e) { note('Sync failed: ' + (e.message || e)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Sync now'; } }
  }
  function markSynced() { lastSync = new Date(); paintSync(); }
  function paintSync() {
    const t = $('liveSyncText'); if (t) t.textContent = syncMs() === 0 && !lastSync ? 'Automatic sync is off' : fmtAgo(lastSync);
    $('liveDot')?.classList.toggle('stale', !!lastSync && Date.now() - lastSync.getTime() > Math.max(syncMs() * 3, 180000));
  }
  window.addEventListener('onespace:google-auto-synced', () => { markSynced(); onFreshData(); });
  window.addEventListener('onespace:data-loaded', () => { markSynced(); });
  setInterval(paintSync, 5000);

  /* ---------- 3. Aries executive briefings ---------- */
  const SEEN = 'onespaceBriefSeen';
  const seen = new Set((() => { try { return JSON.parse(sessionStorage.getItem(SEEN)) || []; } catch (_) { return []; } })());
  const remember = (ids) => { ids.forEach((i) => seen.add(i)); try { sessionStorage.setItem(SEEN, JSON.stringify([...seen].slice(-300))); } catch (_) {} };
  const mid = (m) => String(m.id || m.messageId || m.gmail_id || `${m.email || ''}|${m.subject || ''}`);
  const isImportant = (m) => m.important || m.is_important || /urgent|action required|payment|approval|deadline|invitation|meeting|invoice|asap|today/i.test(`${m.subject || ''} ${m.snippet || ''}`);
  const dueOf = (t) => { const raw = t?.dueAt || t?.due_at || (/^\d{4}-\d{2}-\d{2}$/.test(String(t?.due || '')) ? t.due + 'T23:59:00' : null); const d = raw ? new Date(raw) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
  const startOf = (e) => { const d = e.startsAtISO ? new Date(e.startsAtISO) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const clip = (s, n = 70) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  let lastBriefAt = 0, lastEventSpoken = 0, firstToday = null;

  function compose({ includeAllClear = false } = {}) {
    const d = snap(), now = new Date();
    const inbox = d.emails.filter((m) => (m.unread || m.is_read === false) && !m.outbound && (m.folder || 'inbox') === 'inbox');
    const fresh = inbox.filter((m) => !seen.has(mid(m)));
    const freshImportant = fresh.filter(isImportant);
    const open = d.tasks.filter((t) => !(t.done || t.status === 'completed'));
    const overdue = open.filter((t) => { const x = dueOf(t); return x && x < now; });
    const today = open.filter((t) => { const x = dueOf(t); return x && x >= now && x.toDateString() === now.toDateString(); });
    const nextMeet = d.events.map((e) => ({ e, s: startOf(e) })).filter((x) => x.s && x.s > now && x.s - now < 4 * 3600e3).sort((a, b) => a.s - b.s)[0];
    const parts = [], ids = fresh.map(mid);
    const hr = now.getHours();
    const opener = firstToday !== now.toDateString() ? (hr < 12 ? 'Good morning, Boss.' : hr < 17 ? 'Good afternoon, Boss.' : 'Good evening, Boss.') : 'Boss, quick update.';
    if (fresh.length) {
      let s = `You have ${plural(fresh.length, 'new email')}`;
      if (freshImportant.length) { const m = freshImportant[0]; s += (freshImportant.length === 1 ? ', and it looks important' : `, and ${freshImportant.length} look important`) + `. From ${clip(m.name || m.email, 40)}: ${clip(m.subject)}`; }
      parts.push(s + '.');
    }
    if (nextMeet) { const mins = Math.round((nextMeet.s - now) / 60000); parts.push(`Your next meeting, ${clip(nextMeet.e.title, 60)}, starts ${mins < 2 ? 'now' : mins < 90 ? `in ${mins} minutes` : `in about ${Math.round(mins / 60)} hours`}.`); }
    if (overdue.length) parts.push(`${plural(overdue.length, 'task')} ${overdue.length === 1 ? 'is' : 'are'} overdue, starting with ${clip(overdue[0].title || overdue[0].text, 60)}.`);
    if (today.length) parts.push(`${plural(today.length, 'task')} ${today.length === 1 ? 'is' : 'are'} due today.`);
    if (!parts.length) return includeAllClear ? { text: `${opener} Nothing new and nothing urgent. Your desk is clear.`, ids } : null;
    return { text: `${opener} ${parts.join(' ')}`, ids };
  }

  function speak(text) {
    try { if (typeof prefs !== 'undefined' && !prefs.voiceAssistantEnabled) return false; } catch (_) {}
    if (typeof window.speakText === 'function') { try { window.speakText(text, true); return true; } catch (_) {} }
    return false;
  }
  function briefing({ force = false } = {}) {
    const hr = new Date().getHours();
    if (!force && (hr >= 22 || hr < 7)) return;                    // quiet hours
    const r = compose({ includeAllClear: force });
    if (!r) return;
    lastBriefAt = Date.now(); firstToday = new Date().toDateString();
    remember(r.ids);
    try { window.appendChat?.(r.text, 'assistant'); } catch (_) {}
    if (!speak(r.text) && force) note('Turn on the voice assistant in Settings to hear updates.');
  }
  window.onespaceBriefRemember = remember;                         // lets the V21 wake system mark mail as already announced
  function onFreshData() {
    if (window.__ariesWakeActive) return;                          // V21 wake system now handles new-alert speech
    if (!cfg.briefOn || document.hidden) return;
    if (Date.now() - lastEventSpoken < 120000) return;           // never more than one push per 2 minutes
    const r = compose();
    if (r && r.ids.length) { lastEventSpoken = Date.now(); briefing(); }
  }
  setInterval(() => {
    if (!cfg.briefOn || document.hidden) return;
    if (Date.now() - lastBriefAt >= cfg.briefEvery * 60000) briefing();
  }, 30000);

  /* ---------- boot ---------- */
  const boot = () => { buildBar(); balance(); };
  window.addEventListener('onespace:authenticated', () => setTimeout(boot, 400));
  document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
  setTimeout(boot, 1200);
})();
