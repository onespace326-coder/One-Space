(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => window.onespaceAuthClient || null;
  let schedules = [], runHistory = [], editingId = null, savingSchedule = false;

  async function populateComposeAccounts() {
    const select = $('composeAccount');
    if (!select) return;
    const c = client();
    let note = $('onespaceComposeConnectionNote');
    if (!note) {
      note = document.createElement('small');
      note.id = 'onespaceComposeConnectionNote';
      note.style.cssText = 'display:block;margin:4px 0 8px 52px;color:var(--muted)';
      select.parentElement?.insertAdjacentElement('afterend', note);
    }
    if (!c) {
      select.innerHTML = '<option value="">Sign in to OneSpace first</option>';
      select.disabled = true; note.textContent = 'Sign in before connecting Gmail.'; return;
    }
    const preferredAccountId = select.value;
    try {
      const { data: userData, error: userError } = await c.auth.getUser();
      if (userError) throw userError;
      if (!userData?.user?.id) throw new Error('Sign in to OneSpace first.');
      const { data, error } = await c.from('connected_accounts')
        .select('id,email,provider,connection_status,scopes')
        .eq('user_id', userData.user.id)
        .eq('provider', 'google').eq('connection_status', 'connected');
      if (error) throw error;
      const rows = data || [];
      // Google may return either the narrow Gmail scopes or the broad mail.google.com
      // scope. Accept the same send-capable permissions checked by the Mail diagnostic.
      const scopesOf = account => Array.isArray(account.scopes)
        ? account.scopes.map(String)
        : (typeof account.scopes === 'string' ? account.scopes.split(/[ ,]+/) : []);
      const canSend = account => scopesOf(account).some(scope =>
        /gmail\.(?:send|compose|modify)\b|mail\.google\.com/i.test(scope));
      const ready = rows.filter(canSend);
      if (ready.length) {
        select.innerHTML = ready.map(a => `<option value="${esc(a.id)}">${esc(a.email || 'Google account')} (Gmail)</option>`).join('');
        select.disabled = false;
        if (ready.some(a => a.id === preferredAccountId)) select.value = preferredAccountId;
        note.textContent = 'Sending through the selected connected Gmail account.';
        const legacyNote = document.querySelector('.compose-connection-note');
        if (legacyNote) legacyNote.textContent = `Ready to send securely from ${rows.find(a => a.id === select.value)?.email || 'your connected Gmail account'}.`;
      } else {
        select.innerHTML = '<option value="">Connect or reconnect Gmail to send</option>';
        select.disabled = true;
        note.innerHTML = `${rows.length ? 'Gmail sending permission is missing. Reconnect Google and approve the send permission.' : 'No Google account is connected yet.'} <button type="button" class="textbtn" onclick="connectOneSpaceProvider('google')">Connect / reconnect Google</button>`;
        const legacyNote = document.querySelector('.compose-connection-note');
        if (legacyNote) legacyNote.textContent = 'Connect Google and approve Gmail sending permission before sending.';
      }
    } catch (e) {
      console.warn('Could not load Gmail send accounts:', e);
      select.innerHTML = '<option value="">Could not load connected accounts</option>';
      select.disabled = true;
      note.textContent = 'Could not check Gmail connection. Refresh the page and try again.';
      const legacyNote = document.querySelector('.compose-connection-note');
      if (legacyNote) legacyNote.textContent = 'OneSpace could not check the connected Gmail account. Refresh and try again.';
    }
  }

  const originalOpenCompose = window.openCompose;
  if (typeof originalOpenCompose === 'function') {
    window.openCompose = function () {
      const result = originalOpenCompose.apply(this, arguments);
      populateComposeAccounts();
      return result;
    };
  }
  window.addEventListener('onespace:authenticated', populateComposeAccounts);
  window.addEventListener('onespace:data-loaded', populateComposeAccounts);

  // Task creation is persisted exactly once by the form/Aries/email action that owns it.
  // Do not wrap createTask here: the old wrapper plus explicit saveTask() caused duplicates.
  // Keep cloud sync for completion and deletion.
  const originalToggleTask = window.toggleTask;
  if (typeof originalToggleTask === 'function') {
    window.toggleTask = function (id) {
      const task = (typeof tasks !== 'undefined' ? tasks : []).find(t => String(t.id) === String(id));
      const result = originalToggleTask.call(this, id);
      if (task && window.onespaceCloud?.saveTask) {
        Promise.resolve(window.onespaceCloud.saveTask(task))
          .catch(err => window.toast?.(`Task update did not sync: ${err.message}`));
      }
      return result;
    };
  }
  const originalDeleteTask = window.deleteTask;
  if (typeof originalDeleteTask === 'function') {
    window.deleteTask = function (id) {
      const task = (typeof tasks !== 'undefined' ? tasks : []).find(t => String(t.id) === String(id));
      const result = originalDeleteTask.call(this, id);
      const cloudId = task?.id ?? id;
      if (typeof cloudId === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(cloudId)) {
        Promise.resolve(window.onespaceCloud?.removeTask?.(cloudId))
          .catch(err => window.toast?.(`Task delete did not sync: ${err.message}`));
      }
      return result;
    };
  }

  function mountScheduleUI() {
    const page = $('tasks');
    if (!page || $('scheduledTasksPanel')) return;
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'scheduledTasksPanel';
    panel.style.cssText = 'margin-top:18px;padding:20px';
    panel.innerHTML = `
      <div class="panel-head"><div><h3>Scheduled tasks</h3><small>Set a reminder or an approved action to run at a future time.</small></div><span class="integration-state">Automation</span></div>
      <form id="scheduledTaskForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0">
        <label class="setting-field"><span>Task name</span><input id="stTitle" required maxlength="120" placeholder="e.g. Send weekly report"/></label>
        <label class="setting-field"><span>Run at (your local time)</span><input id="stRunAt" type="datetime-local" required/></label>
        <label class="setting-field"><span>Repeat</span><select id="stRepeat"><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label class="setting-field"><span>Action</span><select id="stAction"><option value="reminder">Email me a reminder</option><option value="send_email">Send an email</option><option value="create_calendar_event">Create a Google Calendar event</option></select></label>
        <label class="setting-field" id="stInstructionWrap" style="grid-column:1/-1"><span>Reminder instructions / details</span><textarea id="stInstruction" rows="3" placeholder="What should the reminder say?"></textarea></label>
        <label class="setting-field" id="stToWrap"><span>Recipient email</span><input id="stTo" type="email" placeholder="name@example.com"/></label>
        <label class="setting-field" id="stSubjectWrap"><span>Email subject</span><input id="stSubject" placeholder="Subject"/></label>
        <label class="setting-field" id="stBodyWrap" style="grid-column:1/-1"><span>Email message</span><textarea id="stBody" rows="3" placeholder="Message to send when this task runs"></textarea></label>
        <label class="setting-field" id="stEventWrap" style="grid-column:1/-1;display:none"><span>Calendar event title</span><input id="stEventTitle" placeholder="Event title"/></label>
        <div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="softbtn primary" id="stSaveBtn" type="submit">Schedule task</button>
          <button class="softbtn" id="stCancelEdit" type="button" hidden>Cancel edit</button>
          <small id="stHint">Tasks run when Supabase Cron is configured. Scheduled actions may be up to one minute after the chosen time.</small>
        </div>
      </form>
      <div class="panel-head" style="margin-top:14px"><div><h3>Upcoming schedules</h3><small>Pause, edit or remove an automation.</small></div></div>
      <div id="scheduledTaskRows"><div class="empty-note">Sign in to view scheduled tasks.</div></div>
      <div class="panel-head" style="margin-top:18px"><div><h3>Execution history</h3><small>Recent scheduled runs and errors.</small></div></div>
      <div id="scheduledTaskHistory"><div class="empty-note">No runs recorded yet.</div></div>`;
    page.appendChild(panel);
    $('stAction').addEventListener('change', renderActionFields);
    $('scheduledTaskForm').addEventListener('submit', saveSchedule);
    $('stCancelEdit').addEventListener('click', clearScheduleForm);
    renderActionFields();
    loadSchedules().catch(e => console.warn('Scheduled task load:', e));
  }

  function renderActionFields() {
    const action = $('stAction')?.value || 'reminder';
    const reminder = action === 'reminder';
    const email = action === 'send_email';
    const event = action === 'create_calendar_event';
    $('stInstructionWrap').style.display = reminder ? '' : 'none';
    $('stToWrap').style.display = email ? '' : 'none';
    $('stSubjectWrap').style.display = email ? '' : 'none';
    $('stBodyWrap').style.display = email ? '' : 'none';
    $('stEventWrap').style.display = event ? '' : 'none';
  }

  async function loadSchedules() {
    const c = client(); if (!c) return;
    const { data: userData, error: userError } = await c.auth.getUser();
    if (userError || !userData?.user?.id) { schedules=[];runHistory=[];renderSchedules();renderHistory();return; }
    const { data, error } = await c.from('scheduled_tasks')
      .select('id,user_id,title,instructions,run_at,timezone,recurrence_day,recurrence,action_type,action_payload,status,last_error,created_at,updated_at')
      .eq('user_id', userData.user.id).order('run_at', { ascending: true });
    if (error) {
      if ($('scheduledTaskRows')) $('scheduledTaskRows').innerHTML = `<div class="empty-note">Scheduled-task tables are not installed. Run the two scheduled-task SQL migrations in Supabase.</div>`;
      console.error('Scheduled task query:', error);
      return;
    }
    schedules = data || [];
    const taskIds=schedules.map(row=>row.id).filter(Boolean);
    if(taskIds.length){
      const history=await c.from('scheduled_task_runs').select('id,task_id,started_at,finished_at,status,result').in('task_id',taskIds).order('started_at',{ascending:false}).limit(20);
      if(history.error){console.warn('Scheduled task history query:',history.error);runHistory=[];}else runHistory=history.data||[];
    }else runHistory=[];
    renderSchedules();
    renderHistory();
  }

  function renderSchedules() {
    const host = $('scheduledTaskRows'); if (!host) return;
    host.innerHTML = schedules.length ? schedules.map(t => `
      <div class="task-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="min-width:180px"><strong>${esc(t.title)}</strong><small style="display:block">${esc(String(t.action_type||'reminder').replaceAll('_',' '))} · ${esc(t.recurrence)} · ${esc(new Date(t.run_at).toLocaleString())} · ${esc(t.status)}</small>${t.last_error?`<small style="display:block;color:#bd4952">${esc(t.last_error)}</small>`:''}</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="softbtn" type="button" data-schedule-edit="${esc(t.id)}" ${t.status === 'running' ? 'disabled' : ''}>Edit</button>
          <button class="softbtn" type="button" data-schedule-toggle="${esc(t.id)}" ${['active','paused','failed'].includes(t.status) ? '' : 'disabled'}>${t.status === 'active' ? 'Pause' : (t.status === 'paused' || t.status === 'failed' ? 'Resume' : 'View')}</button>
          <button class="softbtn" type="button" data-schedule-delete="${esc(t.id)}" ${t.status === 'running' ? 'disabled' : ''}>Delete</button>
        </div>
      </div>`).join('') : '<div class="empty-note">No scheduled tasks yet.</div>';
    host.querySelectorAll('[data-schedule-edit]').forEach(b => b.addEventListener('click', () => editSchedule(b.dataset.scheduleEdit)));
    host.querySelectorAll('[data-schedule-toggle]').forEach(b => b.addEventListener('click', () => toggleSchedule(b.dataset.scheduleToggle)));
    host.querySelectorAll('[data-schedule-delete]').forEach(b => b.addEventListener('click', () => deleteSchedule(b.dataset.scheduleDelete)));
  }

  function renderHistory() {
    const host = $('scheduledTaskHistory'); if (!host) return;
    host.innerHTML = runHistory.length ? runHistory.map(r => {
      const task = schedules.find(t => t.id === r.task_id);
      const label = task?.title || 'Scheduled task';
      const detail = r.result?.error || r.result?.message || (r.result?.messageId ? 'Email sent' : r.result?.eventId ? 'Calendar event created' : '');
      return `<div class="task-row" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong>${esc(label)}</strong><small style="display:block">${esc(new Date(r.started_at).toLocaleString())} · ${esc(r.status)}</small>${detail?`<small style="display:block">${esc(detail)}</small>`:''}</div><span class="priority ${r.status==='succeeded'?'normal':'high'}">${esc(r.status)}</span></div>`;
    }).join('') : '<div class="empty-note">No scheduled runs recorded yet.</div>';
  }

  function clearScheduleForm() {
    editingId = null;
    $('scheduledTaskForm')?.reset();
    $('stAction')?.dispatchEvent(new Event('change'));
    $('stSaveBtn').textContent = 'Schedule task';
    $('stCancelEdit').hidden = true;
  }

  function editSchedule(id) {
    const t = schedules.find(x => x.id === id); if (!t) return;
    editingId = id;
    $('stTitle').value = t.title || '';
    const local = new Date(t.run_at);
    const localValue = new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    $('stRunAt').value = localValue;
    $('stRepeat').value = t.recurrence || 'once';
    $('stAction').value = t.action_type || 'reminder';
    const p = t.action_payload || {};
    $('stInstruction').value = p.instructions || '';
    $('stTo').value = p.to || '';
    $('stSubject').value = p.subject || '';
    $('stBody').value = p.body || '';
    $('stEventTitle').value = p.title || '';
    renderActionFields();
    $('stSaveBtn').textContent = 'Update schedule';
    $('stCancelEdit').hidden = false;
    $('scheduledTaskForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function saveSchedule(ev) {
    ev.preventDefault();
    if (savingSchedule) return;
    const c = client(); if (!c) return window.toast?.('Sign in to OneSpace first.');
    const title = $('stTitle').value.trim(), runAt = new Date($('stRunAt').value);
    if (!title || !Number.isFinite(runAt.getTime())) return window.toast?.('Enter a valid task name and date/time.');
    if (runAt <= new Date()) return window.toast?.('Choose a future date and time.');
    const action = $('stAction').value;
    const payload = action === 'reminder'
      ? { instructions: $('stInstruction').value.trim() }
      : action === 'send_email'
        ? { to: $('stTo').value.trim(), subject: $('stSubject').value.trim(), body: $('stBody').value }
        : { title: $('stEventTitle').value.trim() || title };
    if (action === 'send_email' && (!payload.to || !payload.subject || !payload.body.trim())) return window.toast?.('Complete recipient, subject and message.');

    const isEditing = Boolean(editingId);
    const saveButton = $('stSaveBtn');
    savingSchedule = true;
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
    try {
      const { data: userData, error: userError } = await c.auth.getUser();
      if (userError || !userData?.user) throw new Error('Please sign in again.');
      const row = {
        user_id: userData.user.id, title, instructions: action === 'reminder' ? payload.instructions : null,
        run_at: runAt.toISOString(), recurrence_day: runAt.getDate(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        recurrence: $('stRepeat').value, action_type: action, action_payload: payload, status: 'active', last_error: null
      };
      // The client does not write worker-controlled columns directly. The RPCs bind
      // user_id from auth.uid() and own status/lock/run metadata on the database side.
      const rpcArgs = {
        p_title: row.title,
        p_instructions: row.instructions,
        p_run_at: row.run_at,
        p_timezone: row.timezone,
        p_recurrence_day: row.recurrence_day,
        p_recurrence: row.recurrence,
        p_action_type: row.action_type,
        p_action_payload: row.action_payload
      };
      const result = isEditing
        ? await c.rpc('update_my_scheduled_task', { p_task_id: editingId, ...rpcArgs })
        : await c.rpc('create_my_scheduled_task', rpcArgs);
      if (result?.error) throw result.error;
      if (!isEditing && !result?.data) throw new Error('Supabase did not confirm the new schedule ID. Please check the schedule list before retrying.');
      clearScheduleForm();
      window.toast?.('Scheduled task saved.');
      await loadSchedules();
    } catch (error) {
      window.toast?.(`Could not save schedule: ${error?.message || 'Unknown error'}`);
    } finally {
      savingSchedule = false;
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = editingId ? 'Update schedule' : 'Schedule task';
      }
    }
  }

  async function toggleSchedule(id) {
    const t = schedules.find(x => x.id === id);
    if (!t || !['active','paused','failed'].includes(t.status)) return;
    const next = t.status === 'active' ? 'paused' : 'active';
    if (next === 'active' && new Date(t.run_at).getTime() <= Date.now()) {
      return window.toast?.('This scheduled time has already passed. Edit the task and choose a future time before resuming, to avoid an accidental immediate or duplicate action.');
    }
    const { error } = await client().rpc('set_my_scheduled_task_status', {
      p_task_id: id,
      p_status: next
    });
    if (error) return window.toast?.(error.message);
    await loadSchedules();
  }

  async function deleteSchedule(id) {
    const c=client();if(!c)return;
    const {data:userData,error:userError}=await c.auth.getUser();
    if(userError||!userData?.user?.id)return window.toast?.('Sign in again before deleting this scheduled task.');
    const { error } = await c.from('scheduled_tasks').delete().eq('id', id).eq('user_id',userData.user.id);
    if (error) return window.toast?.(error.message);
    if (editingId === id) clearScheduleForm();
    await loadSchedules();
  }

  // Shared refresh hook for other OneSpace modules that create schedules via RPC.
  window.refreshScheduledTasks = () => loadSchedules();
  window.addEventListener('onespace:scheduled-tasks-changed', () => {
    loadSchedules().catch(error => console.warn('Scheduled task refresh:', error));
  });

  window.addEventListener('onespace:signed-out',()=>{schedules=[];runHistory=[];renderSchedules();renderHistory();const select=$('composeAccount');if(select){select.innerHTML='<option value="">Sign in to OneSpace first</option>';select.disabled=true;}});
  window.addEventListener('onespace:authenticated', () => {
    populateComposeAccounts();
    loadSchedules().catch(console.warn);
  });
  window.addEventListener('onespace:data-loaded', () => {
    populateComposeAccounts();
    loadSchedules().catch(console.warn);
    // Rebuild Next Event and overview KPIs after cloud calendar records replace local state.
    window.renderEvents?.();
    window.refreshOverview?.();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountScheduleUI);
  else mountScheduleUI();


  // Live Gmail mailbox actions: keep the local UI and Gmail labels in sync.
  function findMail(id) {
    return (typeof emails !== 'undefined' ? emails : []).find(m => String(m.id) === String(id));
  }
  async function callGmailAction(message, action) {
    if (!message) throw new Error('Email not found.');
    if (message.provider !== 'Gmail' || !message.providerMessageId) {
      throw new Error('Live mailbox actions are currently available for synced Gmail messages only.');
    }
    const cfg = window.ONESPACE_INTEGRATION_CONFIG || {};
    if (!cfg.googleMailActionUrl) throw new Error('Gmail actions endpoint is not configured. Deploy google-mail-action.');
    const c = client(); if (!c) throw new Error('Sign in to OneSpace first.');
    const { data, error } = await c.auth.getSession(); if (error) throw error;
    const accessToken = data?.session?.access_token;
    if (!accessToken) throw new Error('Your OneSpace session expired. Sign in again.');
    const response = await fetch(cfg.googleMailActionUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, apikey: (window.ONESPACE_AUTH_CONFIG?.supabaseAnonKey || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: message.accountId, messageId: message.providerMessageId, action })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Gmail action failed (${response.status}).`);
    return result;
  }
  function flashMailActionError(error) {
    console.error('OneSpace Gmail action:', error);
    window.toast?.(error?.message || 'Gmail action failed.');
  }

  const originalSelectMail = window.selectMail;
  if (typeof originalSelectMail === 'function') {
    window.selectMail = function(id) {
      const message = findMail(id);
      const wasUnread = !!message?.unread;
      const result = originalSelectMail.apply(this, arguments);
      if (wasUnread && message?.provider === 'Gmail') {
        callGmailAction(message, 'mark_read').catch(error => {
          message.unread = true;
          window.renderMail?.();
          flashMailActionError(error);
        });
      }
      return result;
    };
  }

  // ---- Optimistic Gmail actions -------------------------------------------------
  // The UI updates instantly; Gmail is updated in the background and the change is rolled back
  // (with a clear message) if Gmail rejects it.
  const MAIL_FIELDS = ['unread', 'starred', 'archived', 'trashed', 'folder'];
  const snapshotOf = m => Object.fromEntries(MAIL_FIELDS.map(k => [k, m[k]]));
  function repaint() {
    window.persistMail?.(); window.renderMail?.(); window.updateMailCounters?.(); window.refreshOverview?.();
  }
  function ensureGmailMessage(message) {
    if (!message) throw new Error('Email not found.');
    if (message.provider !== 'Gmail' || !message.providerMessageId) {
      throw new Error('This message is not synced from Gmail yet, so Gmail cannot be updated. Sync and try again.');
    }
  }
  function optimistic(name, pickAction) {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = async function (id) {
      const message = findMail(id); if (!message) return;
      const action = pickAction(message);
      const snap = snapshotOf(message);
      // Local/imported messages can still be organised inside OneSpace. Only synced Gmail
      // messages with a providerMessageId require the Gmail Edge Function.
      if (!message.providerMessageId) {
        original.apply(this, arguments);
        window.toast?.('Updated in OneSpace. Connect/sync Gmail to apply this change at the provider.');
        return;
      }
      try { ensureGmailMessage(message); } catch (error) { flashMailActionError(error); return; }
      original.apply(this, arguments);
      try { await callGmailAction(message, action); }
      catch (error) { Object.assign(message, snap); repaint(); flashMailActionError(error); }
    };
  }
  optimistic('toggleMailStar', m => (m.starred ? 'unstar' : 'star'));
  optimistic('archiveMail', () => 'archive');
  optimistic('trashMail', () => 'trash');
  optimistic('restoreMail', () => 'restore');
  optimistic('markMailUnread', () => 'mark_unread');

  const originalBulkMailAction = window.bulkMailAction;
  if (typeof originalBulkMailAction === 'function') {
    window.bulkMailAction = async function (action) {
      const bulk = window.__mailBulk;
      const selected = bulk ? [...bulk] : [];
      const gmailAction = { archive: 'archive', trash: 'trash', read: 'mark_read' }[action];
      if (!gmailAction || !selected.length) return originalBulkMailAction.apply(this, arguments);
      const apply = (message) => {
        if (action === 'archive') { message.archived = true; message.trashed = false; message.folder = 'archive'; }
        else if (action === 'trash') { message.trashed = true; message.archived = false; message.folder = 'trash'; }
        else if (action === 'read') message.unread = false;
      };
      const jobs = selected.map(id => ({ id, message: findMail(id) })).filter(j => j.message);
      jobs.forEach(j => { j.snap = snapshotOf(j.message); apply(j.message); });
      bulk.clear(); document.getElementById('mailBulkActions')?.classList.remove('show');
      window.__mailBulkReset?.(); repaint();
      let failed = 0, localOnly = 0, sample = '';
      for (let i = 0; i < jobs.length; i += 5) {
        const chunk = jobs.slice(i, i + 5);
        const results = await Promise.allSettled(chunk.map(j => { if (!j.message.providerMessageId) return Promise.resolve({ localOnly: true }); ensureGmailMessage(j.message); return callGmailAction(j.message, gmailAction); }));
        results.forEach((r, k) => {
          if (r.status === 'rejected') { failed++; sample = sample || (r.reason?.message || 'Gmail action failed.'); Object.assign(chunk[k].message, chunk[k].snap); }
          else if (r.value?.localOnly) localOnly++;
        });
      }
      repaint();
      const gmailUpdated = jobs.length - failed - localOnly;
      if (failed) window.toast?.(`${gmailUpdated} updated in Gmail, ${localOnly} updated only in OneSpace, ${failed} could not be changed and were restored. ${sample}`);
      else if (localOnly && gmailUpdated) window.toast?.(`${gmailUpdated} updated in Gmail and ${localOnly} updated only in OneSpace.`);
      else if (localOnly) window.toast?.(`${localOnly} message${localOnly === 1 ? '' : 's'} updated in OneSpace. Sync Gmail to apply provider-side changes.`);
      else window.toast?.(`${gmailUpdated} message${gmailUpdated === 1 ? '' : 's'} updated in Gmail.`);
    };
  }

  const originalMarkEmailHandled = window.markEmailHandled;
  if (typeof originalMarkEmailHandled === 'function') {
    window.markEmailHandled = async function (id) {
      const message = findMail(id);
      if (!message || !message.unread) return originalMarkEmailHandled.apply(this, arguments);
      const snap = snapshotOf(message);
      originalMarkEmailHandled.apply(this, arguments);
      try { ensureGmailMessage(message); await callGmailAction(message, 'mark_read'); }
      catch (error) { Object.assign(message, snap); repaint(); flashMailActionError(error); }
    };
  }

})();
