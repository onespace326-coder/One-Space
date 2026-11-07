/* Aries free assistant bridge and inbox intelligence.
 * free scan creates high-confidence owner tasks automatically; uncertain items remain for review.
 * Sending email is never automatic and still requires the separate approval flow.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORAGE_KEY = 'onespaceAriesMailTasksV2';
  const AUTO_AI_KEY = 'onespaceAriesAutoAiScanV2';
  const AUTO_SIGNATURE_KEY = AUTO_AI_KEY + ':signature';
  const AUTO_ATTEMPT_KEY = AUTO_AI_KEY + ':attempt';
  let storageKey = STORAGE_KEY + ':local';
  let suggestions = [];
  let scopeReady = false;
  let aiScanBusy = false;
  let activeScanPromise = null;
  let autoAiLastSignature = '';
  let autoAiLastAttempt = 0;
  let autoAiScanEnabled = true;
  const AUTO_TASK_CONFIDENCE = 0.82;

  function safeRead(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch (_) { return fallback; }
  }
  function loadSuggestions() {
    suggestions = safeRead(storageKey, []);
    if (!Array.isArray(suggestions)) suggestions = [];
  }
  function persistSuggestions() {
    try { localStorage.setItem(storageKey, JSON.stringify(suggestions.slice(0, 160))); } catch (_) {}
  }
  loadSuggestions();
  try {
    // One-time activation because the owner explicitly asked for automatic inbox scanning.
    const autoMigrationKey = 'onespaceAriesAutoScanEnableV1';
    if (localStorage.getItem(autoMigrationKey) !== '1') {
      localStorage.setItem(AUTO_AI_KEY, '1');
      localStorage.setItem(autoMigrationKey, '1');
    }
    const savedAuto = localStorage.getItem(AUTO_AI_KEY);
    autoAiScanEnabled = savedAuto === null ? true : savedAuto === '1';
    if (savedAuto === null) localStorage.setItem(AUTO_AI_KEY, '1');
    autoAiLastSignature = localStorage.getItem(AUTO_SIGNATURE_KEY) || '';
    autoAiLastAttempt = Number(localStorage.getItem(AUTO_ATTEMPT_KEY) || 0);
  } catch (_) {}

  function setScope(userId) {
    if (!userId) {
      // Never leave one user's pending email actions visible after sign-out.
      scopeReady = false; storageKey = STORAGE_KEY + ':signed-out';
      suggestions = []; scanned = {}; render(); return;
    }
    const next = STORAGE_KEY + ':' + userId;
    scopeReady = true;
    if (next !== storageKey || !scopeReady) { storageKey = next; loadSuggestions(); loadScanned(); render(); }
  }
  function pruneSuggestionsToConnectedMail() {
    const active = inboxRows();
    const valid = suggestions.filter(item => {
      const source = String(item.sourceId || '');
      if (!source) return false;
      return active.some(mail => {
        const sourceMatches = source === String(mail.id || '') || (!!item.accountId && source === String(mail.providerMessageId || ''));
        const accountMatches = !item.accountId || String(item.accountId) === String(mail.accountId || '');
        return sourceMatches && accountMatches;
      });
    });
    if (valid.length !== suggestions.length) { suggestions = valid; persistSuggestions(); render(); }
  }

  const ACTIONS = /\b(send|share|submit|prepare|review|complete|finish|call|contact|schedule|book|pay|upload|update|sign|confirm|reply|respond|deliver|check|approve|arrange|follow\s+up|provide|forward|return|file|renew|cancel|attach|circulate|analyse|analyze|attend|join|register|download)\b/i;
  const REQUEST = /\b(please|kindly|could you|would you|can you|need you to|you need to|action required|request(?:ed)? to|make sure to|don't forget to|reminder to|you are required to)\b/i;
  const DEADLINE = /\b(today|tomorrow|tonight|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|before\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|deadline|asap|urgent|eod|end of day|this week|next week)\b/i;
  const SKIP = /\b(unsubscribe|view in browser|privacy policy|terms of service|newsletter|promotional offer)\b/i;
  function plainHtml(html) {
    const box = document.createElement('div'); box.innerHTML = String(html || '');
    box.querySelectorAll('script,style,iframe').forEach(n => n.remove());
    return (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function dueDate(text) {
    const lower = String(text || '').toLowerCase(); const d = new Date();
    if (/\btoday\b|\beod\b|end of day/i.test(lower)) { d.setHours(18,0,0,0); return {label:'Today',at:d.toISOString()}; }
    if (/\btomorrow\b|\btonight\b/i.test(lower)) { d.setDate(d.getDate()+1); d.setHours(18,0,0,0); return {label:'Tomorrow',at:d.toISOString()}; }
    const m = lower.match(/\b(?:by|before)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (m) { const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; const add=(days.indexOf(m[1])-d.getDay()+7)%7||7; d.setDate(d.getDate()+add); d.setHours(18,0,0,0); return {label:m[1][0].toUpperCase()+m[1].slice(1),at:d.toISOString()}; }
    if (/\bthis week\b/i.test(lower)) { d.setDate(d.getDate()+7-d.getDay()); d.setHours(18,0,0,0); return {label:'This week',at:d.toISOString()}; }
    if (/\bnext week\b/i.test(lower)) { d.setDate(d.getDate()+7); d.setHours(18,0,0,0); return {label:'Next week',at:d.toISOString()}; }
    return {label:'No date detected',at:null};
  }
  function candidates(message) {
    // Smart engine (aries-v21-smart.js): real deadline parsing, sender-vs-you detection, noise filtering, scoring.
    try { return window.AriesSmart ? window.AriesSmart.extract(message) : []; }
    catch (error) { console.warn('Aries smart extract skipped:', error); return []; }
  }
  function render() {
    const panel=$('ariesTaskScanner'), host=$('ariesTaskSuggestions'); if(!panel||!host)return;
    const pending=suggestions.filter(x=>x.status==='pending'); panel.hidden=false;
    host.innerHTML=pending.length?pending.map(x=>`<article class="aries-task-suggestion"><div class="aries-task-suggestion-main"><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.sender)} · ${escapeHtml(x.subject)} · ${escapeHtml(x.due?.label||'No date detected')}</small><small>Evidence: “${escapeHtml(x.evidence||'')}”</small><span class="aries-task-source">${x.confidence?`ARIES CONFIDENCE ${Math.round(x.confidence*100)}% · `:''}NEEDS YOUR REVIEW${x.replyStatus==='prepared'?' · REPLY DRAFT READY — APPROVAL REQUIRED':''}</span></div><div class="aries-task-actions"><button class="softbtn primary" data-aries-accept="${escapeHtml(x.id)}">Add task</button><button class="softbtn" data-aries-reply="${escapeHtml(x.id)}">${x.replyStatus==='prepared'?'Review reply':'Prepare reply'}</button><button class="softbtn" data-aries-dismiss="${escapeHtml(x.id)}">Dismiss</button></div></article>`).join(''):'<div class="aries-task-empty">No pending email actions. Aries will show uncertain items here for your review.</div>';
  }
  function inboxRows() {
    const list = typeof emails !== 'undefined' && Array.isArray(emails) ? emails : [];
    return list.filter(m=>!m.outbound&&!['sent','trash','spam','drafts'].includes(String(m.folder||'').toLowerCase())&&!m.trashed); // Include archived mail: task requests can live outside Inbox.
  }
  function inboxSignature() {
    const ids=inboxRows().map(m=>`${m.id||m.providerMessageId||m.subject||''}:${m.receivedAt||m.date||''}`).sort().join('|');
    if (!ids) return '';
    let hash=2166136261; for(let i=0;i<ids.length;i++){hash^=ids.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return (hash>>>0).toString(16)+'-'+inboxRows().length;
  }
  // ---- V21 smart local scan: incremental (each message once), debounced, auto-adds clear tasks ----
  const AUTO_LOCAL_CONFIDENCE = 0.74;      // dated, clearly-for-you tasks
  const AUTO_LOCAL_UNDATED = 0.82;         // undated tasks need stronger evidence
  const SCANNED_PREFIX = 'onespaceAriesScannedV21:';
  let scanned = {}, scanBusy = false, scanTimer = null;
  const scopeId = () => storageKey.slice(STORAGE_KEY.length + 1) || 'local';
  const loadScanned = () => { scanned = safeRead(SCANNED_PREFIX + scopeId(), {}); if (!scanned || typeof scanned !== 'object') scanned = {}; };
  const persistScanned = () => { try { const keys = Object.keys(scanned); if (keys.length > 12000) keys.slice(0, keys.length - 10000).forEach(k => delete scanned[k]); localStorage.setItem(SCANNED_PREFIX + scopeId(), JSON.stringify(scanned)); } catch (_) {} };
  const mailKey = mail => String(mail.id || mail.providerMessageId || mail.messageId || (mail.email || '') + '|' + (mail.subject || ''));
  const fingerprint = mail => { const content=[mail.subject,mail.snippet,mail.body,mail.bodyHtml,mail.body_html,mail.name,mail.email,mail.receivedAt].map(v=>String(v||'')).join('\u241f'); let hash=2166136261; for(let i=0;i<content.length;i++){hash^=content.charCodeAt(i);hash=Math.imul(hash,16777619);} return (hash>>>0).toString(16)+'-'+content.length; };
  const openTaskList = () => (typeof tasks !== 'undefined' && Array.isArray(tasks)) ? tasks : [];
  const shouldAuto = s => autoAiScanEnabled && s.assignedToUser && (s.due?.at ? s.confidence >= AUTO_LOCAL_CONFIDENCE : s.confidence >= AUTO_LOCAL_UNDATED);

  function localQuickScan(silent=false, opts={}) {
    const S = window.AriesSmart;
    const pendingCount = () => suggestions.filter(x=>x.status==='pending').length;
    if(!scopeReady || !S) return {added:0,autoAdded:0,checked:0,pending:pendingCount(),done:Promise.resolve([])};
    if (scanBusy) return {added:0,autoAdded:0,checked:0,pending:pendingCount(),busy:true,done:Promise.resolve([])};
    scanBusy = true;
    let added = 0, checked = 0; const auto = [];
    try {
      const known = new Set(suggestions.map(x=>x.sourceKey));
      const existing = openTaskList();
      const rows = inboxRows(); // Scan every synchronized received message; no first-page or 160/400-message cap.
      for (const mail of rows) {
        const mk = mailKey(mail), fp = fingerprint(mail);
        if (!opts.force && scanned[mk] === fp) continue;
        scanned[mk] = fp; checked++;
        let items = []; try { items = S.extract(mail); } catch (error) { console.warn('Aries scan skipped a message:', error); }
        for (const found of items) {
          const sourceKey = mk + '|' + found.title.toLowerCase();
          if (known.has(sourceKey)) continue;
          known.add(sourceKey);
          if (S.isDuplicate(found, existing, suggestions, mk)) continue;
          const suggestion = {id:'aries-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)),sourceKey,title:found.title,due:found.due,priority:found.priority,evidence:found.evidence,sourceId:mail.id||mk,accountId:mail.accountId,sender:mail.name||mail.email||'Sender',senderEmail:mail.email||'',subject:mail.subject||'(no subject)',status:'pending',confidence:found.confidence,assignedToUser:found.assignedToUser,kind:found.kind,local:true,foundAt:new Date().toISOString()};
          suggestions.unshift(suggestion); added++;
          if (shouldAuto(suggestion)) auto.push(suggestion);
        }
      }
      persistScanned();
    } finally { scanBusy = false; }
    S.stats.scans++; S.stats.checked += checked; S.stats.lastScanAt = Date.now(); S.saveStats();
    persistSuggestions(); render();
    let done = Promise.resolve([]);
    if (auto.length) {
      done = autoAddBatch(auto, silent).finally(() => window.dispatchEvent(new CustomEvent('aries:scan-updated')));
    } else {
      window.dispatchEvent(new CustomEvent('aries:scan-updated'));
      if (added && !silent) window.toast?.(`Aries found ${added} possible task${added===1?'':'s'}. Review them below.`);
    }
    return {added, autoAdded:auto.length, checked, pending:pendingCount(), done};
  }
  async function autoAddBatch(list, silent) {
    const S = window.AriesSmart, done = [];
    for (const item of list) {
      if (item.status !== 'pending') continue;
      try {
        const result = await addSuggestionAsTask(item);
        item.status = 'added'; item.auto = true; item.taskId = result.task?.id; item.addedAt = new Date().toISOString();
        if (result.warning) item.cloudWarning = result.warning;
        done.push({ title: item.title, due: item.due, priority: item.priority, sender: item.sender, subject: item.subject, taskId: item.taskId });
      } catch (error) { item.taskCreateError = error?.message || 'Task creation failed'; }
    }
    if (done.length) {
      S.stats.added += done.length; S.stats.lastAddedAt = Date.now(); S.saveStats();
      persistSuggestions(); render();
      try { window.renderAriesTaskCalendar?.(); window.renderNotifications?.(); } catch (_) {}
      if (!silent) window.toast?.(`Aries added ${done.length} task${done.length===1?'':'s'} to Upcoming tasks & deadlines.`);
      window.dispatchEvent(new CustomEvent('aries:tasks-auto-added', { detail: { tasks: done } }));
    }
    return done;
  }
  function scheduleLocalScan(delay = 900, opts = {}) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { try { localQuickScan(true, opts); } catch (error) { console.warn('Aries scan:', error); } }, delay);
  }
  window.ariesLocalScan = (opts={}) => localQuickScan(!!opts.silent, opts);
  window.ariesRejectAutoTask = taskId => { const x=suggestions.find(v=>String(v.taskId)===String(taskId)); if(x){x.status='dismissed'; x.rejectedByUser=true; persistSuggestions(); render();} };
  loadScanned();
  async function saveTaskToCloud(task) {
    if (window.onespaceCloud?.saveTask) {
      const id=await window.onespaceCloud.saveTask(task); if(id)task.id=id; return {cloud:true};
    }
    return {cloud:false};
  }
  async function addSuggestionAsTask(item) {
    const makeTask=typeof window.createTask==='function'?window.createTask:(typeof createTask==='function'?createTask:null);
    const pr=String(item.priority||'normal').toLowerCase();
    const prLabel=pr==='urgent'?'Urgent':pr==='high'?'High':pr==='low'?'Low':'Normal';
    let dueLabel='No date detected';
    if(item.due?.at){ const d=new Date(item.due.at); if(!Number.isNaN(d.getTime())) dueLabel=window.AriesSmart?.keyOf?window.AriesSmart.keyOf(d):item.due.label; }
    const task=makeTask?.(item.title,prLabel,dueLabel);
    if(!task)throw new Error('OneSpace could not create this task.');
    if(item.due?.at)task.dueAt=item.due.at;
    task.description=`Created from email: ${item.sender||'Sender'} · ${item.subject||'(no subject)'}\nEvidence: ${item.evidence||'Email action detected by Aries.'}\nSource: ${item.sourceId||''}`;
    task.source='aries-mail'; task.ariesAdded=true; task.sourceMailId=item.sourceId; task.sourceMailAccountId=item.accountId||null; task.sourceSubject=item.subject; task.sourceSender=item.sender;
    try{ if(typeof saveLocalState==='function')saveLocalState(); }catch(_){}      // createTask saved before dueAt existed
    try { const result=await saveTaskToCloud(task); try{ if(typeof saveLocalState==='function')saveLocalState(); }catch(_){} try{window.renderTasks?.();window.renderAriesTaskCalendar?.();}catch(_){} return {...result,task}; }
    catch(error) { try{window.renderAriesTaskCalendar?.();}catch(_){} return {cloud:false,task,warning:error?.message||'Cloud save failed'}; }
  }
  async function accept(id) {
    const item=suggestions.find(x=>x.id===id); if(!item)return;
    const buttons=$('ariesTaskSuggestions')?.querySelectorAll(`[data-aries-accept="${CSS.escape(String(id))}"]`); buttons?.forEach(b=>{b.disabled=true;b.textContent='Adding…';});
    try {
      const result=await addSuggestionAsTask(item); item.status='added'; item.taskId=result.task?.id; item.addedAt=new Date().toISOString(); persistSuggestions(); render();
      window.toast?.(result.warning?'Task added on this device; cloud sync failed: '+result.warning:result.cloud?'Task saved to your OneSpace account.':'Task added on this device.');
    } catch(error) { window.toast?.(error.message||'Could not add task.'); render(); }
  }
  const localSummary=r=>`Aries checked ${r.checked||'all available'} email${r.checked===1?'':'s'} · ${r.autoAdded} task${r.autoAdded===1?'':'s'} added to Upcoming tasks & deadlines · ${Math.max(0,r.pending)} waiting for your review. Last scan ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}.`;
  async function performScanWithAI(options={}) {
    if(aiScanBusy)return null; aiScanBusy=true; let localRun=null;
    const button=$('ariesAiScanButton'), original=button?.textContent||'✦ Scan inbox with Aries';
    const state=$('ariesAiScanStatus');
    try {
      if(button&&!options.silent){button.disabled=true;button.textContent='Aries is reviewing…';}
      if(state)state.textContent='Aries is reviewing every synchronized received email, including archived messages…';
      // Local smart scan first: instant, private, works without any server function.
      localRun=localQuickScan(true,{force:true}); await localRun.done;
      const cfg=window.ONESPACE_INTEGRATION_CONFIG||{};
      if(!cfg.ariesEmailScanUrl){
        const msg=localSummary(localRun); if(state)state.textContent=msg; if(!options.silent)window.toast?.(msg);
        return {ok:true,local_only:true,scanned_count:localRun.checked,auto_created_count:localRun.autoAdded,pending_count:localRun.pending,summary:msg};
      }
      const client=window.onespaceAuthClient; if(!client)throw new Error('OneSpace authentication did not load. Refresh the page and sign in again.');
      const {data,error}=await client.auth.getSession(); if(error)throw error;
      const token=data?.session?.access_token; if(!token)throw new Error('Your OneSpace session has expired. Sign in again.');
      autoAiLastAttempt=Date.now();try{localStorage.setItem(AUTO_ATTEMPT_KEY,String(autoAiLastAttempt));}catch(_){}
      const publicKey=window.ONESPACE_AUTH_CONFIG?.supabaseAnonKey||'';
      if(!publicKey)throw new Error('Supabase publishable key is missing from auth-config.js.');
      let response;
      try{response=await fetch(cfg.ariesEmailScanUrl,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({})});}
      catch(fetchError){if(fetchError instanceof TypeError)throw new Error('Browser could not reach aries-email-scan. Check CORS APP_ORIGIN is https://onespace326-coder.github.io (without /One-Space) and deploy the Edge Function.');throw fetchError;}
      const result=await response.json().catch(()=>({}));
      if(!response.ok){
        const detail=result.error||`Free scan failed (${response.status}).`;
        if(response.status===404)throw new Error('Aries email scan function is not deployed. Deploy supabase/functions/aries-email-scan.');
        if(response.status===401||response.status===403)throw new Error('OneSpace session or function permission was rejected. Sign out and sign in again, then verify the function deployment.');
        if(response.status===429)throw new Error('Aries scan limit reached. Wait before trying again. Details: '+detail);
        if(response.status===503)throw new Error(detail);
        throw new Error(detail);
      }
      const known=new Set(suggestions.map(x=>x.sourceKey)); let addedSuggestions=0, autoCreated=0, autoLocalOnly=0;
      const resultItems=Array.isArray(result.items)?result.items:[];
      for(const item of resultItems){
        if(!item||!item.title||!item.source_message_id)continue;
        const normalizedTitle=String(item.title).trim().toLowerCase();
        const alreadySeen=known.has(`free:${item.source_message_id}|${normalizedTitle}`)||suggestions.some(existing=>String(existing.sourceId||'')===String(item.source_message_id)&&String(existing.title||'').trim().toLowerCase()===normalizedTitle&&existing.status!=='dismissed');
        if(alreadySeen)continue;
        if(window.AriesSmart?.isDuplicate({title:String(item.title)},openTaskList(),suggestions,item.source_message_id)){known.add(`free:${item.source_message_id}|${normalizedTitle}`);continue;}
        const sourceKey=`free:${item.source_message_id}|${normalizedTitle}`;
        const confidence=Math.max(0,Math.min(1,Number(item.confidence)||0));
        const dueAt=item.due_date&&/^\d{4}-\d{2}-\d{2}$/.test(item.due_date)?new Date(item.due_date+'T18:00:00').toISOString():null;
        const due=dueAt?{label:new Date(dueAt).toLocaleDateString([], {month:'short',day:'numeric'}),at:dueAt}:{label:'No date detected',at:null};
        const suggestion={id:'aries-ai-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)),sourceKey,title:String(item.title).slice(0,240),due,priority:String(item.priority||'normal').toLowerCase(),evidence:String(item.evidence||'').slice(0,500),sourceId:item.source_message_id,sender:item.sender_name||'Email sender',senderEmail:item.sender_email||'',subject:item.subject||'(no subject)',status:'pending',suggestedReply:item.suggested_reply||'',confidence,assignedToUser:item.assigned_to_user===true};
        known.add(sourceKey); addedSuggestions++;
        // Clear owner-assigned tasks are saved automatically. A failed individual write
        // must not abort the rest of the inbox scan. Replies are never auto-sent.
        if(suggestion.assignedToUser && confidence>=AUTO_TASK_CONFIDENCE && suggestion.evidence.length>=12){
          try {
            const created=await addSuggestionAsTask(suggestion);
            suggestion.status='added'; suggestion.taskId=created.task?.id; suggestion.addedAt=new Date().toISOString();
            if(created.cloud)autoCreated++;else autoLocalOnly++;
            if(created.warning)suggestion.cloudWarning=created.warning;
          } catch(taskError) {
            suggestion.taskCreateError=taskError?.message||'Task creation failed';
          }
        }
        suggestions.unshift(suggestion);
      }
      suggestions=suggestions.slice(0,160); persistSuggestions(); render();
      autoAiLastSignature=inboxSignature();
      try{localStorage.setItem(AUTO_SIGNATURE_KEY,autoAiLastSignature);}catch(_){}
      const remaining=suggestions.filter(x=>x.status==='pending').length;
      const summary=String(result.summary||'Review the suggested actions below.');
      const statusText=`Last Aries scan: ${new Date().toLocaleString()} · ${result.scanned_count||0} emails reviewed across ${result.account_count||1} connected account(s) · ${autoCreated} tasks saved to your account · ${autoLocalOnly} tasks saved on this device only · ${addedSuggestions-autoCreated-autoLocalOnly} items waiting for your review. ${summary}`;
      if(state)state.textContent=statusText;
      if(!options.silent)window.toast?.(`Aries reviewed ${result.scanned_count||0} emails, created ${autoCreated+autoLocalOnly} high-confidence tasks and found ${Math.max(0,addedSuggestions-autoCreated-autoLocalOnly)} items to review.`);
      return {...result,auto_created_count:autoCreated,auto_local_count:autoLocalOnly,suggestions_added_count:addedSuggestions,pending_count:remaining};
    } catch(error) {
      console.error('Aries free email scan:',error);
      const message=error?.message||'Aries could not scan your inbox.';
      const fallback=localRun||localQuickScan(true,{force:true});
      const base=localSummary(fallback);
      const diagnostic=`${base} (Extra cloud scan skipped: ${message})`;
      if(!options.silent)window.toast?.(base);
      if(state)state.textContent=diagnostic;
      return {ok:true,ai_scan_failed:true,error:message,scanned_count:fallback.checked,auto_created_count:fallback.autoAdded,auto_local_count:0,pending_count:fallback.pending,quick_scan_count:fallback.added,summary:diagnostic};
    } finally { aiScanBusy=false; if(button){button.disabled=false;button.textContent=original;} }
  }
  function scanWithAI(options={}) {
    if(activeScanPromise)return activeScanPromise;
    activeScanPromise=performScanWithAI(options).finally(()=>{activeScanPromise=null;});
    return activeScanPromise;
  }
  window.scanAriesInboxWithAI=scanWithAI;
  window.rescanAriesMail=()=>localQuickScan(false,{force:true});
  function reply(id) {
    const x=suggestions.find(v=>v.id===id); if(!x)return;
    window.showPage?.('mail'); window.openCompose?.();
    const to=$('composeTo'),sub=$('composeSubject'),body=$('composeBody'),ed=$('composeEditor');
    if(to)to.value=x.senderEmail; if(sub)sub.value=/^re:/i.test(x.subject)?x.subject:'Re: '+x.subject;
    const draft=x.suggestedReply||`Hi ${x.sender||'there'},\n\nThanks for sharing this. I’ve noted the request: ${x.title}. I’ll review it and get back to you.\n\nBest regards`;
    if(body)body.value=draft; if(ed)ed.innerHTML='<p>'+escapeHtml(draft).replace(/\n/g,'<br>')+'</p>';
    x.replyStatus='prepared'; persistSuggestions(); render();
    window.ariesApprovalPending={suggestionId:x.id,sourceId:x.sourceId,sourceSubject:x.subject,recipient:x.senderEmail};
    window.toast?.('Reply draft prepared. Review it, then approve it before sending.');
  }
  function dismiss(id){const x=suggestions.find(v=>v.id===id);if(x){x.status='dismissed';persistSuggestions();render();}}
  function maybeAutoAiScan() {
    if(!autoAiScanEnabled||aiScanBusy||!scopeReady)return;
    const signature=inboxSignature(); if(!signature||signature===autoAiLastSignature)return;
    if(Date.now()-autoAiLastAttempt<10*60*1000)return;
    window.setTimeout(()=>{if(autoAiScanEnabled&&!aiScanBusy&&scopeReady&&inboxSignature()!==autoAiLastSignature)scanWithAI({silent:true});},1400);
  }
  const autoToggle=$('ariesAutoScanInbox');
  if(autoToggle){autoToggle.checked=autoAiScanEnabled;autoToggle.addEventListener('change',()=>{autoAiScanEnabled=autoToggle.checked;try{localStorage.setItem(AUTO_AI_KEY,autoAiScanEnabled?'1':'0');}catch(_){}window.toast?.(autoAiScanEnabled?'Aries will scan every synchronized received email and new changes automatically.':'Automatic Aries email scanning is off.');if(autoAiScanEnabled){autoAiLastSignature='';maybeAutoAiScan();}});}
  window.addEventListener('onespace:data-loaded',event=>{setScope(event.detail?.userId);pruneSuggestionsToConnectedMail();scheduleLocalScan(300);maybeAutoAiScan();});
  window.addEventListener('onespace:signed-out',()=>setScope(null));
  window.addEventListener('onespace:data-cleared',()=>{suggestions=[];scopeReady=false;render();});
  window.addEventListener('onespace:google-auto-synced',()=>scheduleLocalScan(600));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleLocalScan(500);});
  setInterval(()=>{if(!document.hidden&&scopeReady)scheduleLocalScan(0);},90000);   // cheap: unchanged messages are skipped
  window.addEventListener('onespace:mail-updated',()=>{scheduleLocalScan(400);maybeAutoAiScan();});
  window.addEventListener('onespace:aries-reply-sent',event=>{const item=suggestions.find(x=>x.id===event.detail?.suggestionId);if(item){item.replyStatus='sent';item.replySentAt=new Date().toISOString();persistSuggestions();render();}});
  $('ariesTaskSuggestions')?.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.ariesAccept)accept(b.dataset.ariesAccept);if(b.dataset.ariesReply)reply(b.dataset.ariesReply);if(b.dataset.ariesDismiss)dismiss(b.dataset.ariesDismiss);});

  // Natural conversation bridge. Short spoken cues and supported workspace actions are handled directly;
  // supported Hindi/English requests go to the authenticated Aries free assistant Edge Function.
  const CHAT_KEY_PREFIX='onespaceAriesConversationV2:'; let userScope='local', history=[], busy=false;
  const clean=value=>String(value??'').slice(0,2000);
  const chatKey=()=>CHAT_KEY_PREFIX+userScope;
  function saveHistory(){try{localStorage.setItem(chatKey(),JSON.stringify(history.slice(-24)));}catch(_) {}}
  const isErrorNotice=t=>/^Aries hit a connection problem:/i.test(String(t||''));
  function loadHistory(){history=safeRead(chatKey(),[]);if(!Array.isArray(history))history=[];history=history.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string'&&!(x.role==='assistant'&&isErrorNotice(x.content))).slice(-24);}
  function restoreHistory(){const host=$('chatMessages');if(!host||!history.length||typeof window.appendChat!=='function')return;host.innerHTML='';history.forEach(x=>window.appendChat(x.content,x.role==='assistant'?'assistant':'user'));}
  function workspaceContext(){
    const personal=window.getAriesPersonalContext?.()||{profile:null,memories:[]};
    const saved=window.getAriesPersonalProfile?.()||{}; const include=saved.workspace_context_enabled!==false;
    const taskRows=(include&&typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks:[]).filter(t=>!t.done&&t.status!=='completed').slice(0,20).map(t=>({title:clean(t.title).slice(0,180),priority:clean(t.priority),due:clean(t.due||t.dueAt).slice(0,80)}));
    const eventRows=(include&&typeof events!=='undefined'&&Array.isArray(events)?events:[]).slice(0,20).map(e=>({title:clean(e.title).slice(0,180),date:clean(e.dateISO||e.date).slice(0,60),time:clean(e.time).slice(0,40),location:clean(e.location).slice(0,100)}));
    return {tasks:taskRows,events:eventRows,profile:personal.profile,memories:personal.memories};
  }
  function showBusy(on){busy=!!on;const host=$('chatMessages');if(host)host.setAttribute('aria-busy',String(busy));const send=document.querySelector('.assistant-composer .send-voice');if(send)send.disabled=busy;}
  function addConversation(role,text){window.appendChat?.(text,role);history.push({role,content:String(text)});history=history.slice(-24);saveHistory();if(role==='assistant'&&prefs?.voiceAssistantEnabled&&prefs?.autoSpeak)window.speakText?.(text);}
  async function askAI(message,options={}){
    const cfg=window.ONESPACE_INTEGRATION_CONFIG||{};if(!cfg.ariesChatUrl)throw new Error('Aries chat endpoint is missing. Deploy supabase/functions/aries-chat and publish integrations-config.js.');
    const client=window.onespaceAuthClient;if(!client)throw new Error('OneSpace authentication did not load. Refresh and sign in again.');
    const session=await client.auth.getSession();if(session.error)throw session.error;const token=session.data?.session?.access_token;if(!token)throw new Error('Your OneSpace session expired. Sign in again.');
    const publicKey=window.ONESPACE_AUTH_CONFIG?.supabaseAnonKey||'';
    if(!publicKey)throw new Error('Supabase publishable key is missing from auth-config.js.');
    let response;
    try {
      response=await fetch(cfg.ariesChatUrl,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({message,history:history.slice(-11,-1).filter(x=>!(x.role==='assistant'&&isErrorNotice(x.content))),context:workspaceContext(),includeImportantMail:!!options.includeImportantMail,liveSearch:!!options.liveSearch,preferredLanguage:({ 'hi-IN':'hi', 'en-IN':'en', 'en-US':'en', 'en-GB':'en' }[prefs?.voiceLanguage]||'auto')})});
    } catch(fetchError) {
      if(fetchError instanceof TypeError)throw new Error('Could not reach the Aries Edge Function. Check that aries-chat is deployed and Supabase APP_ORIGIN is exactly https://onespace326-coder.github.io (no /One-Space path). Then hard-refresh OneSpace.');
      throw fetchError;
    }
    const result=await response.json().catch(()=>({}));
    if(!response.ok){const detail=result.error||`Aries request failed (${response.status}).`;if(response.status===404)throw new Error('Aries chat function is not deployed. Deploy supabase/functions/aries-chat.');if(response.status===503)throw new Error(detail);if(response.status===401)throw new Error('Your OneSpace session expired. Sign in again.');throw new Error(detail);}
    if(!result.reply)throw new Error('Aries returned an empty response. Check the Edge Function logs.');
    const sourceLines=Array.isArray(result.sources)&&result.sources.length
      ? '\n\nSources:\n'+result.sources.slice(0,6).map((source,i)=>`${i+1}. ${String(source.title||'Source').slice(0,140)} — ${String(source.url||'').slice(0,500)}`).join('\n')
      : '';
    return String(result.reply)+sourceLines;
  }
  function isScanMailIntent(message){return /\b(scan|check|review|analyse|analyze)\b.{0,50}\b(email|emails|mail|inbox)\b|\b(email|emails|mail|inbox)\b.{0,50}\b(scan|check|review|analyse|analyze|dekho|dekhen|batao|karo|kar do)\b|\b(scan|check|review)\b.{0,35}\b(meri|mere|mera)\b|\b(meri|mere|mera)\b.{0,25}\b(email|emails|mail|inbox)\b.{0,25}\b(scan|check|review|batao|dekho|karo)\b/i.test(message)||/(मेल|ईमेल|इनबॉक्स).{0,35}(स्कैन|जांच|जाँच|देख|चेक|पढ़)|(?:स्कैन|जांच|जाँच|देख|चेक|पढ़).{0,35}(मेल|ईमेल|इनबॉक्स)/i.test(message);}
  function isReadImportantMailIntent(message){return /\b(read|summari[sz]e|show|check|what are)\b.{0,45}\b(important|priority|unread)\b.{0,25}\b(mail|email|emails|inbox)\b|\b(read|show|summari[sz]e)\b.{0,25}\b(mail|email|emails)\b.{0,20}\b(important|unread)\b|\b(important|priority|unread|zaroori|jaruri|urgent)\b.{0,25}\b(mail|email|emails|inbox)\b.{0,25}\b(batao|dikhao|read|show)\b/i.test(message)||/(महत्वपूर्ण|जरूरी|ज़रूरी|अहम).{0,25}(मेल|ईमेल)|(?:मेल|ईमेल).{0,25}(महत्वपूर्ण|जरूरी|ज़रूरी|अहम)/i.test(message);}
  function isListenCue(message){return /^(listen|suno|sun|i am listening|can you hear me|are you there|aries[, ]*listen|सुनो|सुन रहे हो|सुन रही हो)[.! ]*$/i.test(message.trim());}
  function isExplicitTaskCommand(message){
    const text=String(message||'').trim();
    if(/^(?:(?:please|can you|could you)\s+)?(?:add|create|make)\s+(?:a\s+)?(?:task|reminder)\b|^(?:remind me(?:\s+to)?|don't let me forget to|remember to|yaad dilana ki|mujhe yaad dilana ki)\b/i.test(text))return true;
    // A direct action with a clear deadline is also an instruction to capture a task.
    const directAction=/^(?:send|submit|prepare|review|complete|finish|call|contact|schedule|book|pay|upload|update|sign|confirm|reply|respond|deliver|check|approve|arrange|follow\s+up|provide|forward|return|file|renew|cancel|attach|attend|join|register|download|study|learn|write|read|apply|buy|research|meet|print|share|organise|organize|analyse|analyze)\b/i;
    const deadlineCue=/\b(today|tomorrow|kal|aaj|eod|end of day|by\s+(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|20\d{2}-\d{2}-\d{2})\b/i;
    if(directAction.test(text)&&deadlineCue.test(text))return true;
    // Auto-capture clear first-person commitments, not vague statements or questions.
    const prefix=/^(?:i need to|i have to|i must|i should|i want to|i've got to|i gotta)\s+/i;
    if(!prefix.test(text))return false;
    const action=/\b(send|submit|prepare|review|complete|finish|call|contact|schedule|book|pay|upload|update|sign|confirm|reply|respond|deliver|check|approve|arrange|follow\s+up|provide|forward|return|file|renew|cancel|attach|attend|join|register|download|study|learn|write|read|apply|buy|research|meet|print|share|organise|organize|analyse|analyze)\b/i;
    const content=text.replace(prefix,'');
    return action.test(content)&&!/^to\s+(?:know|understand|think|decide|remember)\b/i.test(content);
  }
  function isScheduledReminderCommand(message){return /^remind me to .+ (?:on )?(?:today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}) at \d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i.test(String(message||'').trim()) || /^remind me (?:today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}) at \d{1,2}(?::\d{2})?\s*(?:am|pm)? to .+$/i.test(String(message||'').trim());}
  function taskDeadlineFromText(message){
    const text=String(message||'').toLowerCase();
    const iso=text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);if(iso)return iso[1];
    if(/\b(today|aaj|eod|end of day)\b/.test(text))return 'Today';
    if(/\b(tomorrow|kal)\b/.test(text)){const d=new Date();d.setDate(d.getDate()+1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
    const day=text.match(/\b(?:by|before|on|for)\s+(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if(day){const names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];const d=new Date();let delta=(names.indexOf(day[2])-d.getDay()+7)%7;if(delta===0||day[1])delta+=7;d.setDate(d.getDate()+delta);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
    return 'No date detected';
  }
  function runExplicitTask(message){
    const original=String(message||'').trim();
    let title=original
      .replace(/^(?:(?:please|can you|could you)\s+)?(?:add|create|make)\s+(?:a\s+)?(?:task|reminder)(?:\s+to)?\s*/i,'')
      .replace(/^(?:remind me to|don't let me forget to|remember to|yaad dilana ki|mujhe yaad dilana ki)\s*/i,'')
      .replace(/^(?:i need to|i have to|i must|i should|i want to|i've got to|i gotta)\s+/i,'');
    const deadline=taskDeadlineFromText(original);
    title=title
      .replace(/\b(?:by|before|on|for)\s+(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/ig,'')
      .replace(/\b20\d{2}-\d{2}-\d{2}\b/g,'')
      .replace(/\b(today|tomorrow|kal|aaj|eod|end of day)\b/ig,'')
      .replace(/\b(urgent|asap|immediately|critical|high priority|important|low priority)\b/ig,'')
      .replace(/\b(?:by|before|on|for)\s*$/i,'')
      .replace(/[.!?,;:]+$/,'').replace(/^\s*(?:to|that)\s+/i,'').replace(/\s+/g,' ').trim();
    if(!title)return null;
    const priority=/\b(urgent|asap|immediately|critical)\b/i.test(original)?'Urgent':/\b(high priority|important)\b/i.test(original)?'High':/\blow priority\b/i.test(original)?'Low':'Normal';
    return (typeof window.createTask==='function'?window.createTask(title,priority,deadline):(typeof createTask==='function'?createTask(title,priority,deadline):null))||null;
  }
  function needsLiveSearch(message){
    const q=String(message||'');
    // Explicit request to search always wins.
    if(/\b(search the web|search online|google it|look it up|internet par|web par search)\b/i.test(q))return true;
    // Questions about the owner's own workspace must be answered from workspace context, not the web.
    if(/\b(task|tasks|calendar|reminder|reminders|inbox|journal|meeting|meetings|appointment|due)\b/i.test(q)||/(टास्क|कैलेंडर|रिमाइंडर|इनबॉक्स|जर्नल|मीटिंग)/.test(q))return false;
    return /\b(real[\s-]?time|latest|breaking|weather|forecast|news|headlines?|stocks?|share price|stock market|nifty|sensex|gold rate|silver rate|petrol price|diesel price|exchange rate|usd|inr|cricket score|match score|live score|traffic|election results?|latest version|release date|open now)\b/i.test(q)
      || /(ताज़ा|ताजा|लेटेस्ट|मौसम|पूर्वानुमान|खबर|समाचार|शेयर भाव|शेयर मूल्य|शेयर बाजार|शेयर बाज़ार|निफ्टी|सेंसेक्स|सोने का भाव|चांदी का भाव|पेट्रोल का भाव|डॉलर का रेट|एक्सचेंज रेट|स्कोर|मैच का परिणाम)/i.test(q);
  }

  async function testAriesConnection(){
    const cfg=window.ONESPACE_INTEGRATION_CONFIG||{};
    const state=$('ariesAiScanStatus');
    const button=$('ariesHealthButton');
    const original=button?.textContent||'Test Aries connection';
    try{
      if(!cfg.ariesHealthUrl)throw new Error('Aries health endpoint is not configured. Publish integrations-config.js.');
      const client=window.onespaceAuthClient;if(!client)throw new Error('Supabase authentication is not initialized.');
      const {data,error}=await client.auth.getSession();if(error)throw error;
      const token=data?.session?.access_token;if(!token)throw new Error('Sign in to OneSpace again.');
      const publicKey=window.ONESPACE_AUTH_CONFIG?.supabaseAnonKey||'';if(!publicKey)throw new Error('Supabase publishable key is missing.');
      if(button){button.disabled=true;button.textContent='Checking…';}
      if(state)state.textContent='Checking browser → Supabase → Aries learning engine…';
      let response;
      try{response=await fetch(cfg.ariesHealthUrl,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({})});}
      catch(e){throw new Error('Browser could not reach Supabase. Most likely CORS APP_ORIGIN mismatch or aries-health is not deployed. Set APP_ORIGIN to https://onespace326-coder.github.io (without /One-Space).');}
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||`Health check failed (${response.status}).`);
      const c=result.checks||{};
      const lines=[`Aries connection check: ${result.ok?'PASSED':'NEEDS ATTENTION'}.`,
        `Supabase session: ${c.authenticated?'OK':'FAILED'}.`,
        `Tasks database: ${c.task_database==='ok'?'OK':c.task_database||'UNKNOWN'} (${c.task_count??0} open).`,
        `Calendar database: ${c.calendar_database==='ok'?'OK':c.calendar_database||'UNKNOWN'} (${c.calendar_count??0} rows).`,
        `Email database: ${c.email_database==='ok'?'OK':c.email_database||'UNKNOWN'} (${c.email_count??0} rows).`,
        `Private memory store: ${c.personal_memory_store==='ok'?'OK':c.personal_memory_store||'UNKNOWN'}.`,
        `Personal memory: ${c.memory_enabled?'ENABLED':'OFF'}.`,
        `Aries engine: ${c.assistant_engine||'Supabase-native learning engine'}.`];
      if(result.errors?.length)lines.push('Details: '+result.errors.join(' | '));
      if(state)state.textContent=lines.join(' ');
      window.toast?.(result.ok?'Aries connection is healthy.':'Aries connection needs attention. Read the diagnostic below.');
      return result;
    }catch(e){const msg=e?.message||'Aries connection check failed.';if(state)state.textContent=msg;window.toast?.(msg);return{ok:false,error:msg};}
    finally{if(button){button.disabled=false;button.textContent=original;}}
  }
  window.testAriesConnection=testAriesConnection;

  function findWorkspaceTask(title){
    const needle=String(title||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
    const taskRows=(typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks:[]);const open=taskRows.filter(t=>!t.done&&t.status!=='completed'&&t.status!=='cancelled');
    const hits=open.filter(t=>{const task=String(t.title||'').toLowerCase();return task===needle||task.includes(needle)||needle.includes(task);});
    return {hits,open};
  }
  function parseAgentDate(value){
    const raw=String(value||'').trim().toLowerCase();const d=new Date();
    if(raw==='today'){return d.toLocaleDateString('en-CA');}
    if(raw==='tomorrow'){d.setDate(d.getDate()+1);return d.toLocaleDateString('en-CA');}
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const match=raw.match(/^(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    if(match){const delta=(weekdays.indexOf(match[1])-d.getDay()+7)%7||7;d.setDate(d.getDate()+delta);return d.toLocaleDateString('en-CA');}
    return null;
  }
  function agentRows(name){
    if(name==='tasks')return typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks:[];
    if(name==='events')return typeof events!=='undefined'&&Array.isArray(events)?events:[];
    if(name==='emails')return typeof emails!=='undefined'&&Array.isArray(emails)?emails:[];
    if(name==='files')return typeof files!=='undefined'&&Array.isArray(files)?files:[];
    return [];
  }
  function parseAgentTime(value){
    const raw=String(value||'').trim().toLowerCase();let h,m,ampm;
    let match=raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if(!match){match=raw.match(/^(\d{2}):(\d{2})$/);if(!match)return null;h=Number(match[1]);m=Number(match[2]);}
    else{h=Number(match[1]);m=Number(match[2]||0);ampm=(match[3]||'').toLowerCase();if(ampm){h=h%12+(ampm==='pm'?12:0);}}
    if(h<0||h>23||m<0||m>59)return null;return{hour:h,minute:m};
  }
  function makeAgentDateTime(dateValue,timeValue){
    const day=parseAgentDate(dateValue),clock=parseAgentTime(timeValue);if(!day||!clock)return null;
    const date=new Date(`${day}T00:00:00`);date.setHours(clock.hour,clock.minute,0,0);return Number.isNaN(date.getTime())?null:date;
  }
  // Conversational reminder state is stored per signed-in user, so a short follow-up
  // such as "9 AM" is attached only to that user's pending reminder draft.
  const REMINDER_DRAFT_PREFIX='onespaceAriesPendingReminderV1:';
  const reminderDraftKey=()=>REMINDER_DRAFT_PREFIX+userScope;
  function readPendingReminder(){
    try{
      const draft=JSON.parse(localStorage.getItem(reminderDraftKey())||'null');
      if(!draft||typeof draft!=='object')return null;
      if(!draft.createdAt||Date.now()-Number(draft.createdAt)>2*60*60*1000){localStorage.removeItem(reminderDraftKey());return null;}
      return draft;
    }catch(_){return null;}
  }
  function writePendingReminder(draft){
    try{localStorage.setItem(reminderDraftKey(),JSON.stringify({...draft,createdAt:draft.createdAt||Date.now()}));}catch(_){}
  }
  function clearPendingReminder(){try{localStorage.removeItem(reminderDraftKey());}catch(_){}}
  function localDateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function isReminderIntent(message){
    return /^(?:aries[,: ]+)?(?:(?:please|can you|could you)\s+)?(?:remind me\b|set\s+(?:a\s+)?reminder\b|create\s+(?:a\s+)?reminder\b|add\s+(?:a\s+)?reminder\b|don't\s+let\s+me\s+forget\b|remember\s+to\b|yaad\s+dilana\s+ki\b|mujhe\s+yaad\s+dilana\s+ki\b)/i.test(String(message||'').trim());
  }
  function extractReminderDate(text){
    const match=String(text||'').match(/\b(today|tonight|tomorrow|aaj|kal|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|20\d{2}-\d{2}-\d{2})\b/i);
    if(!match)return null;
    const token=match[1].toLowerCase();
    if(/^20\d{2}-\d{2}-\d{2}$/.test(token))return {token,date:token};
    if(['today','tonight','aaj'].includes(token))return {token,date:localDateKey(new Date())};
    if(['tomorrow','kal'].includes(token)){const d=new Date();d.setDate(d.getDate()+1);return {token,date:localDateKey(d)};}
    return {token,date:parseAgentDate(token)};
  }
  function extractReminderTime(text){
    const source=String(text||'');
    let match=source.match(/\b(?:at\s*)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i);
    if(match)return {raw:match[0],value:`${match[1]}${match[2]?':'+match[2]:''} ${match[3].toUpperCase()}`};
    match=source.match(/\bat\s+(\d{1,2})(?::([0-5]\d))?\b/i);
    if(match)return {raw:match[0],value:`${match[1]}${match[2]?':'+match[2]:''}`};
    match=source.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
    if(match)return {raw:match[0],value:`${match[1]}:${match[2]}`};
    return null;
  }
  function extractReminderTitle(text,dateInfo,timeInfo){
    let title=String(text||'');
    if(dateInfo)title=title.replace(dateInfo.token,' ');
    if(timeInfo)title=title.replace(timeInfo.raw,' ');
    title=title
      .replace(/^\s*(?:to|about|that)\s+/i,'')
      .replace(/^\s*(?:on|for|at)\s+/i,'')
      .replace(/\s+(?:on|for|by|at|to)\s*$/i,'')
      .replace(/[.!?,;:]+$/,'')
      .replace(/\s+/g,' ')
      .trim();
    return title;
  }
  function isReminderDateTimeFollowUp(message){
    const text=String(message||'').trim();
    if(!text)return false;
    const stripped=text.replace(/^(?:on|for|at)\s+/i,'');
    const dateInfo=extractReminderDate(stripped),timeInfo=extractReminderTime(stripped);
    return !!(dateInfo||timeInfo) && stripped.length<80;
  }
  function isReminderTitleFollowUp(message,pending){
    const text=String(message||'').trim();
    if(!pending||pending.title||!text||text.length>140)return false;
    return !extractReminderDate(text)&&!extractReminderTime(text)&&!/[?？]$/.test(text)&&! /^(?:what|why|how|where|who|when|is|are|am|do|does|did|can i|should i|thanks|thank you|okay|ok|no|cancel|never mind|nevermind)\b/i.test(text);
  }
  function nextOccurrenceForTime(timeValue){
    const clock=parseAgentTime(timeValue);if(!clock)return null;
    const now=new Date(),candidate=new Date(now);
    candidate.setHours(clock.hour,clock.minute,0,0);
    if(candidate<=now)candidate.setDate(candidate.getDate()+1);
    return localDateKey(candidate);
  }
  async function saveConversationalReminder(draft){
    const when=makeAgentDateTime(draft.date,draft.time);
    if(!when)throw new Error('I could not read that date and time. Please give me a time such as 9 AM.');
    if(when<=new Date())throw new Error('That time has already passed. Please choose a future time.');
    const c=window.onespaceAuthClient;
    if(!c)throw new Error('Supabase is not connected.');
    const {data:userData,error:userError}=await c.auth.getUser();
    if(userError||!userData?.user)throw new Error('Please sign in again.');
    const title=String(draft.title||'').trim();
    if(!title)throw new Error('Please tell me what you want to be reminded about.');
    const runAt=when.toISOString();
    const {data,error}=await c.rpc('create_my_scheduled_task',{
      p_title:title,
      p_instructions:`Reminder: ${title}`,
      p_run_at:runAt,
      p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata',
      p_recurrence_day:when.getDate(),
      p_recurrence:'once',
      p_action_type:'reminder',
      p_action_payload:{instructions:`This is your OneSpace reminder: ${title}`}
    });
    if(error)throw error;
    if(!data)throw new Error('Supabase did not return a saved task ID.');
    await agentLog({action_type:'reminder_scheduled',action_label:'Scheduled reminder: '+title,target_type:'scheduled_task',target_id:String(data),status:'succeeded',details:{run_at:runAt}});
    window.dispatchEvent?.(new CustomEvent('onespace:scheduled-tasks-changed'));
    clearPendingReminder();
    const day=when.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
    const time=when.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    return `All set, Boss. I saved “${title}” in OneSpace for ${day} at ${time}. The scheduled-task worker must be active for it to run.`;
  }
  async function handleConversationalReminder(message){
    const text=String(message||'').trim();
    const pending=readPendingReminder();
    if(pending&&/^(?:cancel(?:\s+(?:it|that(?:\s+reminder)?|the reminder))?|never mind|nevermind|forget this reminder)[.! ]*$/i.test(text)){
      clearPendingReminder();
      return {handled:true,reply:'No problem, Boss. I cancelled that unfinished reminder. Nothing was saved.'};
    }
    const intent=isReminderIntent(text);
    const followUp=!!pending&&(isReminderDateTimeFollowUp(text)||isReminderTitleFollowUp(text,pending));
    if(!intent&&!followUp)return null;

    let draft=intent?{title:'',date:null,time:null,createdAt:Date.now()}:{...(pending||{})};
    let body=text
      .replace(/^(?:aries[,: ]+)?(?:(?:please|can you|could you)\s+)?(?:set\s+(?:a\s+)?reminder(?:\s+to)?|create\s+(?:a\s+)?reminder(?:\s+to)?|add\s+(?:a\s+)?reminder(?:\s+to)?|remind\s+me|don't\s+let\s+me\s+forget(?:\s+to)?|remember\s+to|yaad\s+dilana\s+ki|mujhe\s+yaad\s+dilana\s+ki)\s*/i,'')
      .trim();
    const dateInfo=extractReminderDate(body);
    const timeInfo=extractReminderTime(body);
    if(dateInfo?.date)draft.date=dateInfo.date;
    if(timeInfo?.value)draft.time=timeInfo.value;
    const title=extractReminderTitle(body,dateInfo,timeInfo);
    if(title&&!/^(?:at\s*)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|today|tonight|tomorrow|kal|aaj)$/i.test(title)){
      // A date/time-only follow-up must not overwrite a title already captured.
      if(intent||!dateInfo&&!timeInfo)draft.title=title.replace(/^to\s+/i,'').trim();
    }

    // If the user gives a time but no date, choose the next occurrence in their local
    // timezone (today when still ahead, otherwise tomorrow) and say so in the confirmation.
    if(draft.time&&!draft.date)draft.date=nextOccurrenceForTime(draft.time);
    draft.createdAt=draft.createdAt||Date.now();

    if(!draft.title){writePendingReminder(draft);return {handled:true,reply:'Of course, Boss. What should I remind you about?'};}
    if(!draft.date){writePendingReminder(draft);return {handled:true,reply:'Got it, Boss. When should I remind you? You can say “tomorrow at 9 AM”.'};}
    if(!draft.time){writePendingReminder(draft);return {handled:true,reply:'Of course, Boss. What time should I set it for?'};}

    try{return {handled:true,reply:await saveConversationalReminder(draft)};}
    catch(error){writePendingReminder(draft);return {handled:true,reply:`I have the reminder details, Boss, but could not save it: ${error.message||'Supabase rejected the task.'} Please try again.`};}
  }
  async function agentLog(action){
    try{await window.onespaceCloud?.logAriesAction?.(action);}catch(error){console.warn('Aries action log unavailable:',error);}
  }
  async function runTaskAgentTool(message){
    const text=String(message||'').trim();let match,taskName,dateValue,priority;

    // Create a scheduled reminder from plain language. Delivery is handled by the existing
    // Supabase scheduled-task worker (which must be enabled/configured separately).
    let reminder=text.match(/^remind me to (.+?) (?:on )?(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}) at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i);
    if(!reminder){const alternate=text.match(/^remind me (today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}) at (\d{1,2}(?::\d{2})?\s*(?:am|pm)?) to (.+)$/i);if(alternate)reminder=[alternate[0],alternate[3],alternate[1],alternate[2]];}
    if(reminder){
      const title=reminder[1].trim().replace(/[.!?]+$/,'');const when=makeAgentDateTime(reminder[2],reminder[3]);
      if(!title||!when)return{handled:true,reply:'I could not understand that reminder. Try: “Remind me to submit the report tomorrow at 9am.”'};
      if(when<=new Date())return{handled:true,reply:'That reminder time has already passed. Please choose a future date and time.'};
      try{const c=window.onespaceAuthClient;if(!c)throw new Error('Supabase is not connected.');const {data:userData,error:userError}=await c.auth.getUser();if(userError||!userData?.user)throw new Error('Please sign in again.');
        const runAt=when.toISOString();
        const {data,error}=await c.rpc('create_my_scheduled_task',{
          p_title:title,
          p_instructions:`Reminder: ${title}`,
          p_run_at:runAt,
          p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Kolkata',
          p_recurrence_day:when.getDate(),
          p_recurrence:'once',
          p_action_type:'reminder',
          p_action_payload:{instructions:`This is your OneSpace reminder: ${title}`}
        });if(error)throw error;
        await agentLog({action_type:'reminder_scheduled',action_label:'Scheduled reminder: '+title,target_type:'scheduled_task',target_id:String(data),status:'succeeded',details:{run_at:runAt}});
        return{handled:true,reply:`Saved your reminder: “${title}” for ${when.toLocaleString()}. Delivery depends on the OneSpace scheduled-task worker being enabled, with a connected Google account that permits Gmail sending. I have not sent any email now.`};
      }catch(error){return{handled:true,reply:`I could not save that reminder: ${error.message||'Supabase schedule save failed'}.`};}
    }

    // Search only the signed-in workspace data already loaded by OneSpace.
    match=text.match(/^(?:search|find|show)\s+(?:my\s+)?(?:emails?|mail)\s+(?:for|about|containing)\s+(.+)$/i);
    if(match){const query=match[1].trim().toLowerCase();const hits=agentRows('emails').filter(row=>[row.name,row.email,row.subject,row.snippet,row.body].some(v=>String(v||'').toLowerCase().includes(query))).slice(0,5);return{handled:true,reply:hits.length?`I found ${hits.length} matching email${hits.length===1?'':'s'} in your connected Gmail data:\n`+hits.map((m,i)=>`${i+1}. ${m.subject||'(no subject)'} — ${m.name||m.email||'Unknown sender'}${m.time?' · '+m.time:''}`).join('\n'):'I could not find a matching email in the messages currently synced to OneSpace.'};}
    match=text.match(/^(?:search|find|show)\s+(?:my\s+)?(?:files?|documents?)\s+(?:for|about|named|containing)\s+(.+)$/i);
    if(match){const query=match[1].trim().toLowerCase();const hits=agentRows('files').filter(row=>[row.name,row.type,row.source].some(v=>String(v||'').toLowerCase().includes(query))).slice(0,5);return{handled:true,reply:hits.length?`I found ${hits.length} matching file${hits.length===1?'':'s'} in your OneSpace storage:\n`+hits.map((f,i)=>`${i+1}. ${f.name} — ${f.source||'OneSpace Storage'}`).join('\n'):'I could not find a matching file in your currently synced OneSpace storage.'};}

    // Prepare a local draft only. The user still reviews and sends it from Compose.
    match=text.match(/^draft\s+(?:an?\s+)?email\s+to\s+([^,]+?)\s+(?:about|with\s+subject|subject[: ]+)\s+(.+)$/i);
    if(match){const recipient=match[1].trim(),topic=match[2].trim();window.openCompose?.();const to=$('composeTo'),subject=$('composeSubject'),body=$('composeBody'),editor=$('composeEditor');if(to)to.value=recipient;if(subject)subject.value=/^(re|fwd):/i.test(topic)?topic:`Regarding: ${topic}`;const draftBody=`Hi,\n\nI am writing regarding ${topic}.\n\nPlease let me know your thoughts.\n\nBest regards`;if(body)body.value=draftBody;if(editor)editor.innerHTML='<p>Hi,</p><p>I am writing regarding '+escapeHtml(topic)+'.</p><p>Please let me know your thoughts.</p><p>Best regards</p>';window.saveMailDraft?.(true);await agentLog({action_type:'email_draft_created',action_label:'Prepared email draft to '+recipient+' · '+topic,target_type:'email_draft',status:'succeeded'});return{handled:true,reply:`I prepared an email draft to ${recipient} about “${topic}” and opened it in Compose. Please review the recipient and wording before sending. I have not sent it.`};}

    // Create a OneSpace calendar event from an explicit date/time request.
    match=text.match(/^(?:schedule|create|add)\s+(?:a\s+)?(?:calendar\s+)?(?:event|meeting)\s+(.+?)\s+(?:on|for)\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{2}:\d{2})$/i);
    if(match){const title=match[1].trim(),start=makeAgentDateTime(match[2],match[3]);if(!start)return{handled:true,reply:'I could not read that date or time. Try: “Schedule meeting with team tomorrow at 3pm”.'};const end=new Date(start.getTime()+60*60000);try{const id=await window.onespaceCloud?.saveEvent?.({title,starts_at:start.toISOString(),ends_at:end.toISOString()});if(!id)throw new Error('Supabase calendar save is unavailable.');const fmt=d=>d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});const event={id,title,date:start.toLocaleDateString([],{month:'short',day:'numeric'}),dateISO:start.toLocaleDateString('en-CA'),startsAtISO:start.toISOString(),endsAtISO:end.toISOString(),time:fmt(start),end:fmt(end),provider:'OneSpace',color:'#8172df',durationMin:60,location:'',agenda:''};agentRows('events').unshift(event);window.renderEvents?.();window.renderMonth?.();window.refreshOverview?.();await agentLog({action_type:'calendar_event_created',action_label:'Created calendar event: '+title,target_type:'calendar_event',target_id:String(id),status:'succeeded',details:{starts_at:start.toISOString(),ends_at:end.toISOString()}});return{handled:true,reply:`Scheduled “${title}” in your OneSpace calendar for ${start.toLocaleString()}. It is saved to Supabase.`};}catch(error){return{handled:true,reply:`I could not save that calendar event: ${error.message||'cloud save failed'}.`};}}

    // Reschedule only events created in OneSpace. Synced Google events are left untouched in this free phase.
    match=text.match(/^(?:move|reschedule)\s+(?:my\s+)?(?:event|meeting)\s+(.+?)\s+to\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{2}:\d{2})$/i);
    if(match){const needle=match[1].trim().toLowerCase(),matches=agentRows('events').filter(e=>String(e.title||'').toLowerCase().includes(needle));if(matches.length!==1)return{handled:true,reply:matches.length?`I found multiple matching events. Please give me the exact event title.`:`I could not find an event matching “${match[1]}”.`};const event=matches[0];if(event.provider!=='OneSpace'||!/^[0-9a-f-]{36}$/i.test(String(event.id||'')))return{handled:true,reply:'I found that event, but it belongs to a synced provider. This deployment only reschedules events created directly in OneSpace; I have not changed your Google Calendar event.'};const start=makeAgentDateTime(match[2],match[3]);if(!start)return{handled:true,reply:'I could not read that date or time.'};const oldStart=new Date(event.startsAtISO||event.starts_at||start),oldEnd=new Date(event.endsAtISO||event.ends_at||oldStart.getTime()+3600000),duration=Math.max(15,oldEnd-oldStart);const end=new Date(start.getTime()+duration);try{await window.onespaceCloud?.updateEvent?.(event.id,{starts_at:start.toISOString(),ends_at:end.toISOString()});event.startsAtISO=start.toISOString();event.endsAtISO=end.toISOString();event.dateISO=start.toLocaleDateString('en-CA');event.date=start.toLocaleDateString([],{month:'short',day:'numeric'});event.time=start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});event.end=end.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});window.renderEvents?.();window.renderMonth?.();window.refreshOverview?.();await agentLog({action_type:'calendar_event_rescheduled',action_label:'Rescheduled: '+event.title,target_type:'calendar_event',target_id:String(event.id),status:'succeeded',details:{starts_at:start.toISOString()}});return{handled:true,reply:`Moved “${event.title}” to ${start.toLocaleString()} in OneSpace.`};}catch(error){return{handled:true,reply:`I could not save the event change: ${error.message||'cloud update failed'}.`};}}

    // Destructive operations require a confirmation prompt before OneSpace changes data.
    match=text.match(/^(?:delete|remove)\s+(?:the\s+)?task\s+(.+)$/i);
    if(match){const result=findWorkspaceTask(match[1].trim());if(result.hits.length!==1)return{handled:true,reply:result.hits.length?'I found multiple tasks with that name. Please give me the exact task title.':'I could not find that open task.'};const task=result.hits[0];if(!window.confirm?.(`Delete the task “${task.title}”? This cannot be undone.`))return{handled:true,reply:`I left “${task.title}” unchanged.`};try{if(!window.onespaceCloud?.removeTask)throw new Error('Supabase task deletion is unavailable.');await window.onespaceCloud.removeTask(task.id);const list=agentRows('tasks'),index=list.findIndex(t=>String(t.id)===String(task.id));if(index>=0)list.splice(index,1);window.saveLocalState?.();window.renderTasks?.();window.renderAriesTaskHeatmap?.();await agentLog({action_type:'task_deleted',action_label:'Deleted task after confirmation: '+task.title,target_type:'task',target_id:String(task.id),status:'succeeded'});return{handled:true,reply:`Deleted “${task.title}” after your confirmation and saved the change.`};}catch(error){return{handled:true,reply:`I could not delete “${task.title}” because Supabase did not confirm the change: ${error.message||'cloud delete failed'}.`};}}
    if((match=text.match(/^(?:complete|finish|close)\s+(?:the\s+)?(?:task\s+)?(.+)$/i)) || (match=text.match(/^(?:mark)\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed)$/i))){taskName=match[1].replace(/[.!?]+$/,'').trim();const result=findWorkspaceTask(taskName);if(result.hits.length!==1)return {handled:true,reply:result.hits.length?`I found more than one matching task: ${result.hits.slice(0,4).map(t=>'“'+t.title+'”').join(', ')}. Tell me the exact title.`:`I could not find an open task matching “${taskName}”.`};const task=result.hits[0];const previous={done:task.done,status:task.status,completedAt:task.completedAt};task.done=true;task.status='completed';task.completedAt=new Date().toISOString();try{if(!window.onespaceCloud?.saveTask)throw new Error('Supabase task saving is unavailable.');const id=await window.onespaceCloud.saveTask(task);if(!id)throw new Error('Supabase did not return a saved task ID.');task.id=id;window.saveLocalState?.();window.renderTasks?.();window.renderAriesTaskHeatmap?.();await agentLog({action_type:'task_completed',action_label:'Completed: '+task.title,target_type:'task',target_id:String(task.id),status:'succeeded'});return {handled:true,reply:`Done. I marked “${task.title}” complete and confirmed it was saved to your OneSpace workspace.`};}catch(error){task.done=previous.done;task.status=previous.status||'open';task.completedAt=previous.completedAt;window.saveLocalState?.();window.renderTasks?.();return {handled:true,reply:`I could not confirm the change in Supabase, so I restored “${task.title}” to its previous status: ${error.message||'cloud save failed'}.`};}}
    match=text.match(/^(?:move|reschedule|change\s+the\s+deadline\s+for)\s+(.+?)\s+(?:to|for)\s+(today|tomorrow|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})$/i);
    if(match){taskName=match[1].replace(/^(?:task\s+)/i,'').trim();dateValue=parseAgentDate(match[2]);const result=findWorkspaceTask(taskName);if(result.hits.length!==1)return {handled:true,reply:result.hits.length?`I found multiple tasks matching “${taskName}”. Please give me the exact task title.`:`I could not find an open task matching “${taskName}”.`};if(!dateValue)return {handled:true,reply:'I can move a task to today, tomorrow, a weekday or a YYYY-MM-DD date.'};const task=result.hits[0];const ok=await window.changeTaskDeadline?.(task.id,dateValue);return {handled:true,reply:ok?`Done. I moved “${task.title}” to ${dateValue} and saved the new deadline.`:`I could not confirm that the new deadline was saved. Please try again from the task date control.`};}
    match=text.match(/^(?:set|change)\s+(?:the\s+)?priority(?:\s+of)?\s+(.+?)\s+to\s+(low|normal|medium|high|urgent)$/i) || text.match(/^make\s+(.+?)\s+(low|normal|medium|high|urgent)\s+priority$/i);
    if(match){taskName=match[1].trim();priority=match[2].toLowerCase()==='medium'?'normal':match[2].toLowerCase();const result=findWorkspaceTask(taskName);if(result.hits.length!==1)return {handled:true,reply:result.hits.length?`I found several matching tasks. Please provide the exact title for the priority change.`:`I could not find an open task matching “${taskName}”.`};const task=result.hits[0];const ok=await window.changeTaskPriority?.(task.id,priority);return {handled:true,reply:ok?`Done. “${task.title}” is now ${priority} priority.`:`I could not confirm the priority update. Please try again from the task list.`};}
    return {handled:false,reply:''};
  }
  window.sendAssistantMessage=async function(raw){
    const message=String(raw||'').trim();if(!message||busy)return;
    const enabled=typeof prefs!=='undefined'&&!!prefs.ariesAiEnabled;
    const pendingReminder=readPendingReminder();
    const taskIntent=isExplicitTaskCommand(message)||isReminderIntent(message)|| (!!pendingReminder&&(isReminderDateTimeFollowUp(message)||isReminderTitleFollowUp(message,pendingReminder)));
    if(!enabled&&!taskIntent){const response=typeof window.assistantReply==='function'?window.assistantReply(message):'Turn on Aries conversations in Settings to use the assistant.';window.appendChat?.(message,'user');window.appendChat?.(response,'assistant');if(prefs?.autoSpeak)window.speakText?.(response);const input=$('assistantInput');if(input)input.value='';return;}
    if(typeof window.appendChat!=='function'){window.toast?.('Aries chat interface is unavailable.');return;}
    window.appendChat(message,'user');history.push({role:'user',content:message});history=history.slice(-24);saveHistory();const input=$('assistantInput');if(input)input.value='';showBusy(true);const voice=$('voiceState');if(voice)voice.textContent='Aries is thinking…';
    try{
      let reply='';
      const reminderResult=await handleConversationalReminder(message);
      if(reminderResult) reply=reminderResult.reply;
      else if(isListenCue(message)) reply=(prefs?.voiceLanguage==='hi-IN'?'Haan, main sun raha hoon. Aap aaraam se Hindi ya Hinglish mein bataiye—आज क्या हुआ, किस चीज़ में मदद चाहिए, या क्या याद रखना है?':'I’m here and listening. Tell me what happened, what you need, or what you want me to remember. Speak naturally; you do not need to use special commands.');
      else if(isScanMailIntent(message)){
        const result=await window.scanAriesInboxWithAI?.({silent:true,manual:true});
        if(!result)throw new Error($('ariesAiScanStatus')?.textContent||'The email scan did not complete. Check the scan status in Tasks.');
        if(result.ai_scan_failed) { reply=`The free email scanner could not complete: ${result.error}. ${result.quick_scan_count?`My local rule-based check found ${result.quick_scan_count} possible action(s), which are waiting in Tasks for review.`:'I did not create any tasks because the free scan did not complete.'} Please open Tasks → Aries Inbox Intelligence to see the diagnostic.`; }
        else { const created=(result.auto_created_count||0)+(result.auto_local_count||0), pending=result.pending_count||0;
          reply=`I reviewed ${result.scanned_count||0} recent inbox emails across ${result.account_count||1} connected account(s). I created ${created} high-confidence task${created===1?'':'s'} automatically${result.auto_local_count?' ('+result.auto_local_count+' saved on this device only)':''}. ${pending} lower-confidence item${pending===1?' remains':'s remain'} in the review list. I have not sent any replies. Open Tasks → Aries Inbox Intelligence to review the evidence.`; }

      }
      else if(isExplicitTaskCommand(message)){ 
        const task=runExplicitTask(message);if(!task)throw new Error('Tell me the task after “Add a task to…”');
        try{const saved=await saveTaskToCloud(task);reply=saved.cloud?`Done. I added “${task.title}” to your OneSpace tasks${task.due&&task.due!=='No date detected'?' for '+task.due.toLowerCase():''}.`:`I added “${task.title}” on this device. Cloud sync is not available right now.`;await window.onespaceCloud?.logAriesAction?.({action_type:'task_created',action_label:'Created: '+task.title,target_type:'task',target_id:String(task.id),status:saved.cloud?'succeeded':'failed'}).catch(()=>null);}catch(error){reply=`I added “${task.title}” on this device, but cloud sync failed: ${error.message}`;}
      }
      else {const toolResult=await runTaskAgentTool(message);if(toolResult.handled)reply=toolResult.reply;else reply=await askAI(message,{includeImportantMail:isReadImportantMailIntent(message),liveSearch:needsLiveSearch(message)});}
      addConversation('assistant',reply);if(voice)voice.textContent='Aries is ready. Talk naturally or type a message.';
    }catch(error){
      const notice=`Aries hit a connection problem: ${error?.message||'Please try again.'}`;window.appendChat?.(notice,'assistant');if(voice)voice.textContent='Aries needs attention. Read the message above.';window.toast?.(error?.message||'Aries could not respond.');
    }finally{showBusy(false);}
  };
  window.sendFromInput=()=>window.sendAssistantMessage?.($('assistantInput')?.value||'');
  window.addEventListener('onespace:data-loaded',event=>{const next=event.detail?.userId||'local';if(next!==userScope){userScope=next;loadHistory();restoreHistory();}});
  window.addEventListener('onespace:signed-out',()=>{userScope='signed-out';history=[];busy=false;const host=$('chatMessages');if(host)host.innerHTML='';showBusy(false);});
  loadHistory();if(history.length)restoreHistory();
  // Recover the signed-in scope even if the auth/data-loaded event fired before this script loaded.
  window.setTimeout(async()=>{try{const client=window.onespaceAuthClient;if(client){const session=await client.auth.getSession();const userId=session?.data?.session?.user?.id;if(userId){setScope(userId);if(String(userId)!==String(userScope)){userScope=String(userId);loadHistory();restoreHistory();}}}}catch(error){console.warn('Aries could not resolve the signed-in scope yet.',error);}localQuickScan(true);maybeAutoAiScan();},1200);
})();
