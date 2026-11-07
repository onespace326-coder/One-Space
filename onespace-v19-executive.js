/* OneSpace V19 Executive Layer
 * Premium CEO overview, multi-Google-account controls, Boss addressing,
 * inbox wake notifications and theme picker.
 * Browser notifications run while the OneSpace page/browser is alive.
 */
(() => {
  'use strict';
  if (window.__onespaceV19Loaded) return;
  window.__onespaceV19Loaded = true;
  const $ = (id) => document.getElementById(id);
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const snapshot = () => {
    try { return window.getOneSpaceSnapshot?.() || {tasks:[],emails:[],events:[],accounts:[]}; }
    catch (_) { return {tasks:[],emails:[],events:[],accounts:[]}; }
  };
  const dateOf = (t) => {
    const raw = t?.dueAt || t?.due_at || ( /^\d{4}-\d{2}-\d{2}$/.test(String(t?.due||'')) ? t.due+'T23:59:00' : null );
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const isDone = (t) => !!(t?.done || t?.status === 'completed');
  const weight = (t) => ({urgent:4,high:3,normal:2,low:1}[String(t?.priority||'normal').toLowerCase()] || 2);
  const ensureBoss = (value) => {
    let text = String(value ?? '').trim();
    if (!text) return 'Boss, I’m ready.';
    if (/^(boss\b|boss[,!:—-])/i.test(text)) return text;
    text = text.replace(/^(hello|hi|hey)\s+(there|again)\b[,!.\s]*/i, '$1 Boss, ');
    return `Boss, ${text}`;
  };

  // Aries must address the account owner as Boss in visible and spoken assistant replies.
  if (typeof window.appendChat === 'function' && !window.appendChat.__v19Boss) {
    const original = window.appendChat;
    const wrapped = function(message, kind='assistant') {
      return original.call(this, kind === 'user' ? message : ensureBoss(message), kind);
    };
    wrapped.__v19Boss = true;
    window.appendChat = wrapped;
  }
  if (typeof window.speakText === 'function' && !window.speakText.__v19Boss) {
    const original = window.speakText;
    const wrapped = function(message, ...args) { return original.call(this, ensureBoss(message), ...args); };
    wrapped.__v19Boss = true;
    window.speakText = wrapped;
  }
  if (typeof window.raiseAlert === 'function' && !window.raiseAlert.__v19Boss) {
    const original = window.raiseAlert;
    const wrapped = function(title, spoken, options) { return original.call(this, title, ensureBoss(spoken), options); };
    wrapped.__v19Boss = true;
    window.raiseAlert = wrapped;
  }

  // Premium Executive Command Deck.
  function insertExecutiveDeck() {
    const welcome = document.querySelector('#overview > .welcome');
    if (!welcome || $('ceoCommandDeck')) return;
    const deck = document.createElement('section');
    deck.id = 'ceoCommandDeck';
    deck.className = 'ceo-command-deck';
    deck.setAttribute('aria-label', 'Executive command center');
    deck.innerHTML = `
      <div class="ceo-deck-main">
        <div class="ceo-deck-topline"><span class="ceo-live-dot"></span><span>EXECUTIVE COMMAND CENTER</span><span class="ceo-deck-date" id="ceoDeckDate">TODAY</span></div>
        <div class="ceo-deck-title-row"><div><p class="ceo-deck-overline">YOUR PERSONAL OFFICE</p><h2 id="ceoBossGreeting">Good day, Boss.</h2><p id="ceoExecutiveSummary">Your priorities, schedule and important conversations in one place.</p></div></div>
        <div class="ceo-deck-actions">
          <button type="button" data-ceo-action="brief"><span>✦</span><b>Executive brief</b></button>
          <button type="button" data-ceo-action="task"><span>＋</span><b>Capture task</b></button>
          <button type="button" data-ceo-action="compose"><span>↗</span><b>Compose mail</b></button>
          <button type="button" data-ceo-action="sync"><span>⟳</span><b>Sync accounts</b></button>
        </div>
      </div>
      <div class="ceo-deck-side">
        <div class="ceo-side-head"><span>ATTENTION RADAR</span><span id="ceoRadarCount">0 ITEMS</span></div>
        <div class="ceo-radar-list" id="ceoRadarList"><div class="ceo-radar-empty">Your priority radar is loading…</div></div>
        <div class="ceo-deck-foot"><span><i></i> PRIVATE WORKSPACE</span><span id="ceoLastRefresh">LIVE DATA</span></div>
      </div>
      <div class="ceo-metric-strip">
        <div><small>OPEN TASKS</small><strong id="ceoOpenTasks">—</strong><span id="ceoTaskSub">Your active workload</span></div>
        <div><small>UNREAD MAIL</small><strong id="ceoUnreadMail">—</strong><span id="ceoMailSub">Across connected inboxes</span></div>
        <div><small>TODAY’S MEETINGS</small><strong id="ceoTodayEvents">—</strong><span id="ceoEventSub">Calendar commitments</span></div>
        <div><small>GOOGLE ACCOUNTS</small><strong id="ceoGoogleAccounts">—</strong><span>Up to four accounts unified</span></div>
      </div>`;
    welcome.insertAdjacentElement('afterend', deck);
    deck.querySelectorAll('[data-ceo-action]').forEach(button => button.addEventListener('click', () => runDeckAction(button.dataset.ceoAction)));
    renderExecutiveDeck();
  }
  function runDeckAction(action) {
    if (action === 'brief') {
      window.showPage?.('assistant');
      const input = $('assistantInput');
      if (input) { input.value = 'Give me my executive briefing: top priorities, overdue tasks, important unread mail and today’s schedule.'; input.focus(); }
      return;
    }
    if (action === 'task') {
      window.showPage?.('tasks');
      setTimeout(() => $('newTaskInput')?.focus(), 80);
      return;
    }
    if (action === 'compose') { window.openCompose?.(); return; }
    if (action === 'sync') {
      const button = document.querySelector('[data-ceo-action="sync"]');
      if (button) button.disabled = true;
      window.onespaceCloud?.syncGoogle?.({mode:'full'}).then(result => {
        window.toast?.(`Boss, synced ${result?.accountsSynced||0} Google accounts.`);
      }).catch(error => window.toast?.(`Boss, sync failed: ${error.message}`)).finally(() => { if (button) button.disabled = false; });
    }
  }
  function renderExecutiveDeck() {
    const deck = $('ceoCommandDeck');
    if (!deck) return;
    const data = snapshot(), now = new Date(), today = dayKey(now);
    const open = data.tasks.filter(t => !isDone(t));
    const unread = data.emails.filter(m => (m.unread || m.is_read === false) && !m.outbound && (m.folder||'inbox') === 'inbox');
    const todayEvents = data.events.filter(e => {
      const d = e.startsAtISO ? new Date(e.startsAtISO) : e.dateISO ? new Date(e.dateISO+'T00:00:00') : null;
      return d && !Number.isNaN(d.getTime()) && dayKey(d) === today;
    });
    const urgentTasks = open.filter(t => weight(t) >= 3);
    const importantMail = unread.filter(m => m.important || m.is_important || /urgent|action required|payment|approval|deadline|invitation|meeting|invoice/i.test(`${m.subject||''} ${m.snippet||''}`));
    const radar = [];
    urgentTasks.sort((a,b)=>weight(b)-weight(a)||(dateOf(a)?.getTime()||Infinity)-(dateOf(b)?.getTime()||Infinity)).slice(0,3).forEach(t => {
      const due=dateOf(t), late=due && due.getTime()<now.getTime() && !isDone(t);
      radar.push({type:'task',id:t.id,sourceMailId:t.sourceMailId||'',sourceMailAccountId:t.sourceMailAccountId||'',label:t.title||'Untitled task',meta:late?'OVERDUE':`${String(t.priority||'High').toUpperCase()} PRIORITY`,tone:late?'danger':'warm'});
    });
    importantMail.slice(0,2).forEach(m => radar.push({type:'mail',id:m.id,label:m.subject||'Important email',meta:`FROM ${m.name||m.email||'SENDER'}`,tone:'cool'}));
    const g=$('ceoBossGreeting');
    if(g)g.textContent=`Good ${now.getHours()<12?'morning':now.getHours()<17?'afternoon':'evening'}, Boss.`;
    const date=$('ceoDeckDate');
    if(date)date.textContent=now.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'}).toUpperCase();
    const summary=$('ceoExecutiveSummary');
    if(summary)summary.textContent=open.length ? `You have ${open.length} open tasks, ${unread.length} unread emails and ${todayEvents.length} meetings today. Here is what needs your attention.` : `Your task list is clear. You have ${unread.length} unread emails and ${todayEvents.length} meetings today.`;
    const set=(id,value)=>{const e=$(id);if(e)e.textContent=value;};
    set('ceoOpenTasks',open.length);set('ceoUnreadMail',unread.length);set('ceoTodayEvents',todayEvents.length);set('ceoGoogleAccounts',data.accounts.length);
    set('ceoTaskSub',`${urgentTasks.length} high or urgent`);set('ceoMailSub',`${importantMail.length} marked or detected important`);set('ceoEventSub',todayEvents.length?'Across connected calendars':'No meetings scheduled');
    set('ceoRadarCount',`${radar.length} ITEMS`);
    const host=$('ceoRadarList');
    if(host)host.innerHTML=radar.length?radar.slice(0,5).map(item=>`<button type="button" class="ceo-radar-item ${item.tone}" data-radar-type="${item.type}" data-radar-id="${safe(String(item.id||''))}" data-source-mail-id="${safe(String(item.sourceMailId||''))}" data-source-account-id="${safe(String(item.sourceMailAccountId||''))}"><span class="ceo-radar-icon">${item.type==='task'?'✓':'✉'}</span><span><b>${safe(item.label)}</b><small>${safe(item.meta)}</small></span><i>↗</i></button>`).join(''):'<div class="ceo-radar-empty">No urgent items. Your attention is clear.</div>';
    host?.querySelectorAll('[data-radar-type]').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.radarId;
      if(b.dataset.radarType==='mail'){window.openMail?.(id);return;}
      if(b.dataset.sourceMailId){window.openTaskSourceEmail?.(b.dataset.sourceMailId,b.dataset.sourceAccountId);return;}
      if(typeof window.setTaskFilter==='function')window.setTaskFilter('all');
      window.showPage?.('tasks');
      requestAnimationFrame(()=>{const row=host.ownerDocument.querySelector(`[data-task-row="${CSS.escape(id)}"]`);row?.scrollIntoView({behavior:'smooth',block:'center'});row?.classList.add('notification-target');setTimeout(()=>row?.classList.remove('notification-target'),1800);});
    }));
    set('ceoLastRefresh',`UPDATED ${now.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`);
  }

  // Theme palette: presets can be used in both light and dark modes.
  const themeLabels = {
    studio:'Studio', noir:'Noir', nexus:'Nexus', aurora:'Aurora Glass',
    ocean:'Ocean', orchid:'Orchid', sage:'Sage', graphite:'Graphite', sunset:'Sunset'
  };
  function addThemePalette() {
    const select=$('visualPreset');
    if(select) {
      Object.entries(themeLabels).forEach(([value,label]) => {
        if(![...select.options].some(o=>o.value===value)) select.add(new Option(label,value));
      });
    }
    const settings=document.querySelector('#settings .settings-card, #settings .panel.settings-card');
    const visualField=select?.closest('.setting-field');
    if(!visualField || $('onespaceThemePalette')) return;
    const wrap=document.createElement('div');
    wrap.id='onespaceThemePalette';
    wrap.className='onespace-theme-palette';
    wrap.innerHTML=`<div class="onespace-theme-palette-head"><b>Theme collection</b><small>iOS-inspired glass, calm neutrals and cinematic dark themes</small></div><div class="onespace-theme-swatches">${Object.entries(themeLabels).map(([key,label])=>`<button type="button" data-theme-choice="${key}" class="theme-swatch theme-${key}" aria-label="${label} theme"><span></span><b>${label}</b></button>`).join('')}</div>`;
    visualField.insertAdjacentElement('afterend',wrap);
    wrap.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.addEventListener('click',()=>{
      const mode=$('appearanceMode')?.value || (document.body.classList.contains('dark')?'dark':'light');
      window.applyOneSpaceTheme?.(btn.dataset.themeChoice,mode);
      if(select)select.value=btn.dataset.themeChoice;
      syncThemeSwatches();
    }));
    select?.addEventListener('change',()=>syncThemeSwatches());
  }
  function syncThemeSwatches() {
    const chosen=document.body.dataset.skin||localStorage.getItem('onespaceVisualPreset')||'studio';
    document.querySelectorAll('[data-theme-choice]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.themeChoice===chosen)));
  }

  // Four Google accounts total: the primary account plus three additional accounts.
  async function connectedGoogleRows() {
    const client=window.onespaceAuthClient;
    if(!client) return [];
    const {data:{user}}=await client.auth.getUser();
    if(!user) return [];
    const {data,error}=await client.from('connected_accounts').select('id,email,display_name,provider_account_id,connection_status,last_synced_at,scopes').eq('user_id',user.id).eq('provider','google').eq('connection_status','connected').order('updated_at',{ascending:false}).limit(4);
    if(error) throw error;
    return data||[];
  }
  function renderAccountHub() {
    const host=$('onespaceAccountHub');
    if(!host) return;
    const data=snapshot(), rows=data.accounts||[];
    const count=rows.length;
    host.innerHTML=`
      <div class="account-hub-head"><div><span>UNIFIED GOOGLE WORKSPACE</span><h3>${count} of 4 accounts connected</h3><p>One inbox, one calendar and one Drive view. Choose an account when composing or filter by account in Mail.</p></div><button class="ceo-account-add" type="button" ${count>=4?'disabled':''} id="ceoAddGoogle">${count>=4?'Limit reached':'＋ Add Google account'}</button></div>
      <div class="account-hub-grid">${rows.map((a,i)=>`<article class="account-hub-card"><div class="account-hub-avatar">${i===0?'G':String(i+1)}</div><div class="account-hub-copy"><b>${safe(a.email||a.displayName||`Google account ${i+1}`)}</b><small>${safe(a.services||'Gmail · Calendar · Drive')}</small><small class="account-hub-last">${a.lastSyncedAt?'Last sync '+safe(new Date(a.lastSyncedAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})):'Connected · waiting for sync'}</small></div><button type="button" class="account-hub-sync" data-sync-account="${safe(a.id)}" aria-label="Sync ${safe(a.email||'Google account')}">↻</button></article>`).join('') || '<div class="account-hub-empty">No Google accounts connected yet. Connect your primary Google account to begin.</div>'}</div>
      <div class="account-hub-footer"><span>Account data stays separated by its Google account ID.</span><button type="button" id="ceoSyncAllAccounts">Sync all accounts ↻</button></div>`;
    $('ceoAddGoogle')?.addEventListener('click',()=>window.connectOneSpaceProvider?.('google'));
    $('ceoSyncAllAccounts')?.addEventListener('click',async()=>{try{const r=await window.onespaceCloud?.syncGoogle?.({mode:'full'});window.toast?.(`Boss, synced ${r?.accountsSynced||0} Google accounts.`);}catch(e){window.toast?.(`Boss, ${e.message}`);}});
    host.querySelectorAll('[data-sync-account]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await window.onespaceCloud?.syncGoogle?.({mode:'full',accountId:btn.dataset.syncAccount});window.toast?.('Boss, account sync completed.');}catch(e){window.toast?.(`Boss, ${e.message}`);}finally{btn.disabled=false;}}));
  }
  function refreshAccountFilters() {
    const select=$('mailFilter');
    if(!select) return;
    const current=select.value;
    [...select.querySelectorAll('option[data-google-account]')].forEach(o=>o.remove());
    const data=snapshot();
    (data.accounts||[]).forEach(a=>{
      const option=new Option(a.email||a.displayName||'Google account',`account:${a.id}`);
      option.dataset.googleAccount='1';select.add(option);
    });
    if([...select.options].some(o=>o.value===current))select.value=current;
    else select.value='all';
  }

  // Inbox wake-up watcher. First load is a quiet baseline; later syncs trigger only on new IDs.
  let baselineUser='', knownMail=new Set(), knownTasks=new Set();
  const wakeEnabled=()=>localStorage.getItem('onespaceAriesMailWake')!=='0';
  function showWake(title,body,tag='onespace-wake') {
    const text=ensureBoss(body);
    if(typeof window.raiseAlert==='function') window.raiseAlert(title,text,{notify:true});
    else window.toast?.(text);
    if(wakeEnabled() && 'Notification' in window && Notification.permission==='granted') {
      try { new Notification('OneSpace · '+title,{body:text,tag,icon:'icons/icon-192.png'}); } catch (_) {}
    }
  }
  function processNewData(event) {
    const userId=event?.detail?.userId||'local';
    const data=snapshot();
    const storageKey=`onespaceV19Known:${userId}`;
    if(userId!==baselineUser) {
      baselineUser=userId;
      try {
        const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
        knownMail=new Set(saved?.mail||[]);
        knownTasks=new Set(saved?.tasks||[]);
      } catch (_) { knownMail=new Set();knownTasks=new Set(); }
      if(!knownMail.size && data.emails.length) data.emails.forEach(m=>{if(m.id)knownMail.add(String(m.id));});
      if(!knownTasks.size && data.tasks.length) data.tasks.forEach(t=>{if(t.id)knownTasks.add(String(t.id));});
      try{localStorage.setItem(storageKey,JSON.stringify({mail:[...knownMail].slice(-1500),tasks:[...knownTasks].slice(-1500)}));}catch(_){}
      renderExecutiveDeck();renderAccountHub();refreshAccountFilters();
      return;
    }
    const newMail=data.emails.filter(m=>m.id&&!knownMail.has(String(m.id))&&!m.outbound&&(m.folder||'inbox')==='inbox');
    const newTasks=data.tasks.filter(t=>t.id&&!knownTasks.has(String(t.id))&&!isDone(t));
    data.emails.forEach(m=>{if(m.id)knownMail.add(String(m.id));});
    data.tasks.forEach(t=>{if(t.id)knownTasks.add(String(t.id));});
    try{localStorage.setItem(storageKey,JSON.stringify({mail:[...knownMail].slice(-1500),tasks:[...knownTasks].slice(-1500)}));}catch(_){}
    if(wakeEnabled() && newMail.length) {
      const important=newMail.filter(m=>m.important||m.is_important||/urgent|action required|payment|approval|deadline|invoice|security alert/i.test(`${m.subject||''} ${m.snippet||''}`));
      const chosen=(important.length?important:newMail).slice(0,2);
      chosen.forEach(m=>showWake(important.length?'Priority email received':'New email received',`New message from ${m.name||m.email||'a sender'}: ${m.subject||'No subject'}.`,String(m.id)));
    }
    const urgentNew=newTasks.filter(t=>weight(t)>=3);
    urgentNew.slice(0,1).forEach(t=>showWake('New priority task',`A new ${String(t.priority||'high').toLowerCase()} priority task was added: ${t.title}.`,'task-'+t.id));
    renderExecutiveDeck();renderAccountHub();refreshAccountFilters();
  }
  function configureWakeSetting() {
    const input=$('ariesMailWakeSetting');
    if(!input)return;
    input.checked=wakeEnabled();
    const row=input.closest('.settings-row');
    if(row && !row.querySelector('#ariesWakePermissionButton')) {
      const button=document.createElement('button');
      button.id='ariesWakePermissionButton';button.type='button';button.className='textbtn';
      button.textContent='Allow browser alerts';
      button.addEventListener('click',async()=>{
        if(!('Notification' in window)){window.toast?.('Boss, this browser does not support desktop notifications.');return;}
        try { const result=await Notification.requestPermission();window.toast?.(result==='granted'?'Boss, browser alerts are enabled.':'Boss, browser alerts were not allowed.'); }
        catch(error){window.toast?.(`Boss, could not enable browser alerts: ${error.message}`);}
      });
      row.querySelector('.settings-copy')?.appendChild(button);
    }
    input.addEventListener('change',async()=>{
      localStorage.setItem('onespaceAriesMailWake',input.checked?'1':'0');
      if(input.checked && 'Notification' in window && Notification.permission==='default') {
        try { await Notification.requestPermission(); } catch (_) {}
      }
      if(input.checked && 'Notification' in window && Notification.permission==='denied') window.toast?.('Boss, browser notifications are blocked. Allow them in site settings.');
      else window.toast?.(input.checked?'Boss, inbox wake-ups enabled.':'Boss, inbox wake-ups paused.');
    });
  }

  function install() {
    insertExecutiveDeck();
    addThemePalette();
    configureWakeSetting();
    renderAccountHub();
    refreshAccountFilters();
    if(window.applyOneSpaceTheme) {
      const current=document.body.dataset.skin||localStorage.getItem('onespaceVisualPreset')||'studio';
      const mode=$('appearanceMode')?.value || (document.body.classList.contains('dark')?'dark':'light');
      const original=window.applyOneSpaceTheme;
      window.applyOneSpaceTheme=function(theme,themeMode,save=true){const result=original(theme,themeMode,save);syncThemeSwatches();return result;};
      window.applyOneSpaceTheme(current,mode,false);
    }
    syncThemeSwatches();
    const reduceMotion=$('reduceMotion');
    const syncReducedMotion=()=>document.body.classList.toggle('reduce-motion',!!reduceMotion?.checked);
    syncReducedMotion();
    reduceMotion?.addEventListener('change',syncReducedMotion);
    const existingConnect=window.connectOneSpaceProvider;
    if(typeof existingConnect==='function'&&!existingConnect.__v19Limit) {
      const wrapped=async function(provider) {
        if(provider==='google') {
          try {
            const rows=await connectedGoogleRows();
            if(rows.length>=4) {
              const msg='Boss, the maximum of four Google accounts is already connected. Disconnect one before adding another.';
              window.showIntegrationFeedback?.(msg,'error');
              window.toast?.(msg);
              return;
            }
          } catch(error) {
            window.toast?.(`Boss, could not verify connected accounts: ${error.message}`);
            return;
          }
        }
        return existingConnect.call(this,provider);
      };
      wrapped.__v19Limit=true;
      window.connectOneSpaceProvider=wrapped;
    }
    window.addEventListener('onespace:data-loaded',processNewData);
    window.addEventListener('onespace:google-auto-synced',()=>{renderExecutiveDeck();renderAccountHub();refreshAccountFilters();});
    if(window.getOneSpaceSnapshot) {
      const current=snapshot();
      if(current.accounts?.length || current.tasks?.length || current.emails?.length) {
        window.onespaceCloud?.currentUser?.().then(user=>processNewData({detail:{userId:user.id}})).catch(()=>processNewData({detail:{userId:'local'}}));
      }
    }
    // Keep deck clock and summary current without excessive rendering.
    setInterval(renderExecutiveDeck,60000);
    const addMailFilter=()=>{refreshAccountFilters();};
    $('mailFilter')?.addEventListener('focus',addMailFilter);
    document.querySelectorAll('.theme-toggle').forEach(btn=>btn.addEventListener('click',()=>setTimeout(syncThemeSwatches,30)));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
