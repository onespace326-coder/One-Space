/* ONESPACE V22 — Mailbox status, one-click Gmail connect, and a live mail health check.
 * - Replaces the static "No mailbox connected" text with the real state (signed out / checking / not connected / connected / error)
 * - Connect Gmail directly from Overview and Mail (errors are shown on the spot, not hidden inside a closed modal)
 * - "Mail check" runs a read-only diagnostic of the whole Gmail pipeline: session, Google link, scopes,
 *   deployed Edge Functions, synced messages and a live sync.
 */
(() => {
  'use strict';
  if (window.__onespaceV22Mail) return;
  window.__onespaceV22Mail = true;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = () => window.ONESPACE_INTEGRATION_CONFIG || {};
  const anon = () => window.ONESPACE_AUTH_CONFIG?.supabaseAnonKey || '';
  const snap = () => { try { return window.getOneSpaceSnapshot?.() || { accounts: [], emails: [] }; } catch (_) { return { accounts: [], emails: [] }; } };

  const state = { phase: 'checking', note: '', noteKind: '', busy: false, signedIn: null };

  async function session() {
    const c = window.onespaceAuthClient; if (!c) return null;
    try { const { data } = await c.auth.getSession(); return data?.session || null; } catch (_) { return null; }
  }
  const ago = (iso) => {
    const t = Date.parse(iso || ''); if (!isFinite(t)) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 15) return 'just now'; if (s < 90) return `${s}s ago`;
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
  };

  /* ------------------------------------------------------------------ status */
  function derive() {
    const { accounts = [] } = snap();
    const connected = accounts.filter((a) => /google/i.test(a.provider || '') && String(a.status||'').toLowerCase()==='connected');
    if (connected.length) return { phase: 'connected', accounts: connected };
    if (state.signedIn === false) return { phase: 'signed-out', accounts: [] };
    if (state.phase === 'error') return { phase: 'error', accounts: [] };
    return { phase: state.signedIn === null ? 'checking' : 'not-connected', accounts: [] };
  }

  function statusLabel(d) {
    if (d.phase === 'connected') {
      const n = d.accounts.length;
      const last = d.accounts.map((a) => Date.parse(a.lastSyncedAt || '')).filter(isFinite).sort((a, b) => b - a)[0];
      return `${n} mailbox${n === 1 ? '' : 'es'} connected${last ? ' · synced ' + ago(new Date(last).toISOString()) : ''}`;
    }
    return ({ 'signed-out': 'Sign in to connect a mailbox', checking: 'Checking mailbox…', 'not-connected': 'No mailbox connected', error: 'Mailbox connection problem' })[d.phase];
  }

  function renderFooter() {
    const box = document.querySelector('#overview .priority-email-footer'); if (!box) return;
    const d = derive();
    box.dataset.state = d.phase;
    let label = $('mailboxStatusText');
    if (!label) { label = box.querySelector('span') || document.createElement('span'); label.id = 'mailboxStatusText'; if (!label.parentNode) box.prepend(label); }
    label.innerHTML = `<i></i>${esc(statusLabel(d))}`;

    let actions = $('osMailboxActions');
    if (!actions) {
      box.querySelectorAll('button').forEach((b) => b.remove());
      actions = document.createElement('div'); actions.id = 'osMailboxActions'; actions.className = 'os-mailbox-actions';
      box.append(actions);
      const note = document.createElement('div'); note.id = 'osMailboxNote'; note.className = 'os-mailbox-note'; note.hidden = true; box.append(note);
    }
    const primary = d.phase === 'connected'
      ? '<button type="button" class="softbtn" data-os="sync">Sync now ↻</button>'
      : d.phase === 'signed-out'
        ? ''
        : `<button type="button" class="softbtn primary" data-os="connect" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Connecting…' : 'Connect Gmail ↗'}</button>`;
    actions.innerHTML = `${primary}<button type="button" class="os-link" data-os="check">Mail check</button>`;
    const note = $('osMailboxNote');
    if (note) { note.hidden = !state.note; note.textContent = state.note; note.dataset.kind = state.noteKind || ''; }

    const f = $('mailFooterConnectBtn');
    if (f) { f.textContent = d.phase === 'connected' ? 'Sync now' : 'Connect mailbox'; f.onclick = d.phase === 'connected' ? () => syncNow() : () => connectGmail(); }
  }

  function setNote(text, kind = '') { state.note = text; state.noteKind = kind; renderFooter(); }

  /* ------------------------------------------------------------------ connect */
  async function connectGmail() {
    // Use the single Workspace OAuth controller; the old mail-specific path
    // started a second independent redirect when users clicked twice.
    if (state.busy) return;
    if (typeof window.connectOneSpaceProvider !== 'function') {
      setNote('Google connection is not ready. Refresh OneSpace and try again.', 'error');
      return;
    }
    window.connectOneSpaceProvider('google');
  }

  async function syncNow() {
    if (state.busy) return; state.busy = true; setNote('Syncing Gmail…', '');
    try {
      const sync = window.onespaceCloud?.syncGoogle;
      if (typeof sync !== 'function') throw new Error('The OneSpace Google sync module is not loaded. Refresh the page and run Mail check.');
      const r = await sync();
      if (!r || r.ok === false || Number(r.accountsSynced) < 1) {
        throw new Error('Google sync did not confirm a successfully synced account. Check the Mail diagnostic for details.');
      }
      state.phase = 'connected';
      const e = r.errors?.length ? ` ${r.errors.length} account(s) had errors: ${r.errors[0].error}` : '';
      setNote(`Synced ${r.accountsSynced} account(s): ${r.counts?.emails ?? 0} changed emails.${e}`, r.errors?.length ? 'error' : 'ok');
      window.refreshMail?.(); window.refreshOverview?.();
    } catch (e) { state.phase = 'error'; setNote(e.message || 'Sync failed.', 'error'); }
    finally { state.busy = false; renderFooter(); }
  }

  /* ------------------------------------------------------------------ empty states */
  function cta(title, text, btn) { return `<div class="os-connect-cta"><strong>${esc(title)}</strong><p>${esc(text)}</p>${btn}</div>`; }
  window.onespaceMailboxEmptyHtml = () => {
    const d = derive();
    if (d.phase === 'connected') return cta('Nothing needs your attention', 'Your connected inbox has no unread important mail right now.', '<button type="button" class="softbtn" data-os="sync">Sync now ↻</button>');
    if (d.phase === 'signed-out') return cta('Sign in first', 'Sign in to OneSpace, then connect your Gmail.', '');
    return cta('Connect Gmail to get started', 'Important messages, replies and Aries task scanning appear here once a mailbox is connected.', '<button type="button" class="softbtn primary" data-os="connect">Connect Gmail ↗</button>');
  };
  window.onespaceMailListEmptyText = () => {
    const d = derive(); const folder = document.querySelector('#mailFolders button.active')?.dataset.folder || 'inbox';
    if (d.phase === 'connected') return folder === 'inbox' ? 'Your inbox is empty, or still syncing. <button type="button" class="os-link" data-os="sync">Sync now</button>' : 'Nothing in this folder.';
    return 'No mailbox connected yet. <button type="button" class="os-link" data-os="connect">Connect Gmail</button>';
  };

  /* ------------------------------------------------------------------ health check */
  const FUNCS = [
    ['google-sync', 'googleSyncUrl', 'Receiving mail (sync)'],
    ['google-send-OneSpace', 'googleSendUrl', 'Sending mail'],
    ['aries-approve-reply', 'ariesApproveReplyUrl', 'Send approval (required before every send)'],
    ['google-mail-action-OneSpace', 'googleMailActionUrl', 'Star / archive / delete / mark read'],
    ['google-mail-attachment', 'googleAttachmentUrl', 'Attachments']
  ];

  async function probe(url) {
    if (!url) return { s: 'fail', d: 'Not configured in integrations-config.js.' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const res = await fetch(url, { method: 'OPTIONS', signal: ctl.signal });
      if (res.status === 404) return { s: 'fail', d: 'Not deployed — Supabase returned 404.' };
      if (!res.ok) return { s: 'warn', d: `Endpoint responded, but its OPTIONS check returned HTTP ${res.status}.` };
      return { s: 'ok', d: 'Endpoint responded to the connectivity check. This does not prove its authenticated operation works.' };
    } catch (e) {
      return { s: 'warn', d: e.name === 'AbortError' ? 'Timed out after 9 s.' : 'Could not be reached from the browser (not deployed, blocked by CORS, or offline).' };
    } finally {
      clearTimeout(timer);
    }
  }

  const row = (s, title, detail) => ({ s, title, detail });

  async function runChecks(update) {
    const out = []; const push = (r) => { out.push(r); update(out); return r; };
    const run = (title) => { const r = row('run', title, 'Checking…'); out.push(r); update(out); return r; };
    const fin = (r, s, d) => { r.s = s; r.detail = d; update(out); };

    let r = run('Signed in to OneSpace');
    const s = await session();
    state.signedIn = !!s?.access_token;
    if (!s?.access_token) { fin(r, 'fail', 'No active session. Sign out and sign in with Google again.'); return out; }
    fin(r, 'ok', `Signed in as ${s.user?.email || 'your account'}.`);

    r = run('Google account linked');
    let statusConnected = null;
    try {
      if (!cfg().statusUrl) throw new Error('statusUrl is not configured.');
      const res = await fetch(cfg().statusUrl, { headers: { Authorization: `Bearer ${s.access_token}`, apikey: anon() } });
      if (res.status === 404) throw new Error('google-integration-status is not deployed.');
      if (!res.ok) throw new Error(`Status check failed (${res.status}).`);
      const j = await res.json(); statusConnected = !!j?.google?.connected;
    } catch (e) { statusConnected = null; fin(r, 'warn', `${e.message} Falling back to your saved accounts.`); }
    const { accounts = [], emails = [] } = snap();
    const g = accounts.filter((a) => /google/i.test(a.provider || 'google'));
    if (statusConnected === false && !g.length) fin(r, 'fail', 'No Google account is connected. Use “Connect Gmail”.');
    else if (g.length) fin(r, 'ok', `${g.length} Google account${g.length === 1 ? '' : 's'}: ${g.map((a) => a.email).join(', ')}.`);
    else if (statusConnected) fin(r, 'warn', 'Server says connected but no account was loaded yet. Press Sync now.');
    else if (r.s === 'run') fin(r, 'fail', 'No Google account is connected.');

    r = run('Gmail permissions');
    const scopeOf = (a) => Array.isArray(a.scopes) ? a.scopes.join(' ') : String(a.scopes || '');
    if (!g.length) fin(r, 'warn', 'Connect an account first.');
    else {
      const noModify = g.filter((a) => !/gmail\.modify|mail\.google\.com/i.test(scopeOf(a)));
      const noSend = g.filter((a) => !/gmail\.(?:send|compose|modify)|mail\.google\.com/i.test(scopeOf(a)));
      if (noModify.length) fin(r, 'fail', `${noModify.map((a) => a.email).join(', ')} lack “gmail.modify”, so star, archive, delete and mark-read cannot change Gmail. Disconnect and reconnect, accepting all Gmail permissions.`);
      else if (noSend.length) fin(r, 'fail', `${noSend.map((a) => a.email).join(', ')} lack a send permission. Reconnect and accept sending.`);
      else fin(r, 'ok', 'Read, send and modify (star / archive / trash) permissions are granted.');
    }

    for (const [name, key, label] of FUNCS) {
      r = run(`${label}`);
      const p = await probe(cfg()[key]);
      fin(r, p.s, p.s === 'ok' ? `Edge Function “${name}” is reachable.` : `Edge Function “${name}”: ${p.d}`);
    }

    r = run('Messages synced to OneSpace');
    const inbox = emails.filter((m) => !m.outbound && m.folder !== 'sent');
    const actionable = emails.filter((m) => m.providerMessageId).length;
    if (!emails.length) fin(r, g.length ? 'warn' : 'fail', g.length ? 'No messages loaded yet. Run a sync below.' : 'No messages because no mailbox is connected.');
    else fin(r, actionable === emails.length ? 'ok' : 'warn', `${emails.length} messages loaded (${inbox.length} received). ${actionable} can be changed in Gmail${actionable === emails.length ? '' : ' — the rest are local only'}.`);

    r = run('Live sync (read-only)');
    if (!g.length) fin(r, 'warn', 'Skipped: no connected account.');
    else {
      try { const res = await window.onespaceCloud.syncGoogle(); fin(r, res.errors?.length ? 'warn' : 'ok', `Synced ${res.accountsSynced}/${res.accountsAttempted} account(s). ${res.counts.emails} changed emails.${res.errors?.length ? ' Problem: ' + res.errors[0].error : ''}`); }
      catch (e) { fin(r, 'fail', e.message || 'Sync failed.'); }
    }
    return out;
  }

  function openCheck() {
    $('osMailCheck')?.remove();
    const o = document.createElement('div'); o.id = 'osMailCheck'; o.className = 'kpi-detail-overlay';
    o.innerHTML = `<section class="kpi-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="osCheckTitle">
      <div class="kpi-detail-head"><div><span class="eyebrow">DIAGNOSTIC</span><h3 id="osCheckTitle">Mail check</h3>
      <p>Tests the whole Gmail pipeline without sending, deleting or changing any mail.</p></div><button type="button" class="integration-close" data-x aria-label="Close">×</button></div>
      <div class="os-check-list" id="osCheckList"></div>
      <div class="os-check-actions" id="osCheckActions"></div></section>`;
    document.body.appendChild(o);
    o.addEventListener('click', (e) => { if (e.target === o || e.target.closest('[data-x]')) o.remove(); });
    const paint = (rows) => { $('osCheckList').innerHTML = rows.map((x) => `<div class="os-check-row" data-s="${x.s}"><span class="os-ic">${{ ok: '✓', fail: '✕', warn: '!', run: '…' }[x.s]}</span><div><strong>${esc(x.title)}</strong><small>${esc(x.detail)}</small></div></div>`).join(''); };
    runChecks(paint).then((rows) => {
      const bad = rows.filter((x) => x.s === 'fail').length, warn = rows.filter((x) => x.s === 'warn').length;
      $('osCheckActions').innerHTML = `<span style="flex:1 1 100%;font-size:12px;color:var(--muted)">${bad ? `${bad} problem${bad === 1 ? '' : 's'} found — fix the red items first.` : warn ? 'Working, with a few warnings.' : 'Everything responded correctly.'}</span>
        <button type="button" class="softbtn" data-a="again">Run again</button>
        <button type="button" class="softbtn" data-a="test">Write a test email to myself</button>
        ${snap().accounts.length ? '' : '<button type="button" class="softbtn primary" data-a="connect">Connect Gmail ↗</button>'}`;
      renderFooter();
    });
    $('osCheckActions').addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'again') return openCheck();
      if (a === 'connect') { o.remove(); return connectGmail(); }
      if (a === 'test') {
        const s = await session(); const email = s?.user?.email || snap().accounts[0]?.email || '';
        o.remove(); window.openCompose?.();
        setTimeout(() => { if ($('composeTo')) $('composeTo').value = email; if ($('composeSubject')) $('composeSubject').value = 'OneSpace mail test'; const ed = $('composeEditor'); if (ed) { ed.innerHTML = '<p>Testing send from OneSpace.</p>'; $('composeBody').value = 'Testing send from OneSpace.'; } }, 60);
      }
    });
  }
  window.onespaceMailCheck = openCheck;

  /* ------------------------------------------------------------------ wiring */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-os]'); if (!t) return;
    const a = t.dataset.os; e.preventDefault();
    if (a === 'connect') connectGmail(); else if (a === 'sync') syncNow(); else if (a === 'check') openCheck();
  });

  function addCheckButtonToAccounts() {
    const head = document.querySelector('#accounts .page-title'); if (!head || $('osAccountsCheckBtn')) return;
    const b = document.createElement('button'); b.id = 'osAccountsCheckBtn'; b.type = 'button'; b.className = 'softbtn'; b.textContent = 'Mail check'; b.dataset.os = 'check';
    const connectBtn = head.querySelector('button'); if (connectBtn) connectBtn.before(b); else head.append(b);
  }

  async function refresh() {
    const s = await session(); state.signedIn = s ? true : (window.onespaceAuthClient ? false : null);
    if (state.phase === 'checking' && state.signedIn !== null) state.phase = 'not-connected';
    renderFooter();
    // re-render cards that show the empty state
    const card = $('priorityEmailCard');
    if (card && /os-connect-cta|empty-note/.test(card.innerHTML) && !snap().emails.length) card.innerHTML = window.onespaceMailboxEmptyHtml();
    if (!snap().emails.length) { const list = $('allEmails'); if (list?.querySelector('.mail-empty-list')) window.renderMail?.(); }
    window.refreshOverview?.();
  }

  const boot = () => { addCheckButtonToAccounts(); renderFooter(); refresh(); };
  window.addEventListener('onespace:authenticated', () => { state.signedIn = true; boot(); });
  window.addEventListener('onespace:data-loaded', () => { state.signedIn = true; refresh(); });
  window.addEventListener('onespace:signed-out', () => { state.signedIn = false; state.phase = 'not-connected'; renderFooter(); });
  window.addEventListener('pageshow', () => { if (!document.hidden) refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
