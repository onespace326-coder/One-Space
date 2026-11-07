/* OneSpace Supabase data bootstrap.
 * Uses the browser-safe Supabase client created by the auth controller.
 * No seed records are inserted. Configure RLS in the project schema and run
 * SUPABASE_V32_SCHEMA_AUDIT.sql to verify the deployed tables and policies.
 */
(() => {
  'use strict';
  const client = () => window.onespaceAuthClient || null;
  const notify = (message) => window.toast?.(message);
  const safeTime = (value) => value ? new Date(value).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '';
  const safeDate = (value) => value ? new Date(value).toLocaleDateString([], {month:'short',day:'numeric'}) : '';
  const safeDateKey = (value) => { if(!value)return ''; const d=new Date(value); if(Number.isNaN(d.getTime()))return ''; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const size = (n) => { n=Number(n)||0; if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`; return `${(n/1073741824).toFixed(2)} GB`; };

  // One Google mailbox per signed-in OneSpace identity. Prefer the mailbox whose
  // Google address matches the OneSpace login address; never pool other accounts.
  function choosePrimaryGoogleAccount(rows,user){
    const active=(rows||[]).filter(a=>String(a.provider||'').toLowerCase()==='google'&&String(a.connection_status||'').toLowerCase()==='connected');
    const login=String(user?.email||'').trim().toLowerCase();
    const matching=active.filter(a=>String(a.email||'').trim().toLowerCase()===login);
    const sortNewest=(list)=>[...list].sort((a,b)=>Date.parse(b.updated_at||b.last_synced_at||b.created_at||'')-Date.parse(a.updated_at||a.last_synced_at||a.created_at||''));
    if(matching.length)return sortNewest(matching)[0];
    if(active.length===1)return active[0];
    return null;
  }
  async function fetchAllPages(makeQuery,pageSize=500){
    const rows=[];let start=0;
    while(true){
      const {data,error}=await makeQuery(start,start+pageSize-1);
      if(error)return {data:null,error};
      const page=data||[];rows.push(...page);
      if(page.length<pageSize)break;
      start+=pageSize;
    }
    return {data:rows,error:null};
  }

  async function currentUser() {
    const c=client(); if(!c) throw new Error('Supabase is not configured.');
    const {data,error}=await c.auth.getUser(); if(error)throw error; if(!data.user)throw new Error('Please sign in first.'); return data.user;
  }
  let loadFlight = null, loadGeneration = 0, lastLoadError = '';
  function clearWorkspaceState() {
    try { if(typeof emails!=='undefined'&&Array.isArray(emails))emails.splice(0,emails.length); } catch (_) {}
    try { if(typeof events!=='undefined'&&Array.isArray(events))events.splice(0,events.length); } catch (_) {}
    try { if(typeof files!=='undefined'&&Array.isArray(files))files.splice(0,files.length); } catch (_) {}
    try { if(typeof accounts!=='undefined'&&Array.isArray(accounts))accounts.splice(0,accounts.length); } catch (_) {}
    try { if(typeof contacts!=='undefined'&&Array.isArray(contacts))contacts.splice(0,contacts.length); } catch (_) {}
    try { if(typeof tasks!=='undefined'&&Array.isArray(tasks))tasks.splice(0,tasks.length); } catch (_) {}
    const note=document.getElementById('dailyNoteText');if(note)note.value='';
    const saved=document.getElementById('dailyNoteSaved');if(saved)saved.textContent='Not synced';
    const storageStatus=document.getElementById('storageConnectionText');if(storageStatus)storageStatus.textContent='Not connected';
    const storageUsed=document.getElementById('storageUsedText');if(storageUsed)storageUsed.innerHTML='0 B <small>used · connect your account to sync storage</small>';
    ['storageDocs','storageImages','storageOther'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='0 B';});
    const render=fn=>{try{fn?.()}catch(e){console.warn('OneSpace empty-state render skipped:',e)}};
    render(window.renderMail);render(window.renderEvents);render(window.renderAccounts);render(window.renderContacts);render(window.renderTasks);render(window.refreshOverview);render(window.refreshMail);render(window.updateMailCounters);render(window.renderDriveV6);render(window.renderMonth);render(window.renderNotifications);render(window.renderAriesTaskCalendar);
    window.dispatchEvent(new CustomEvent('onespace:data-cleared'));
  }
  function parseTaskMetadata(description) {
    const desc=String(description||'');
    return {
      sourceId:desc.match(/^Source:\s*([^\s\r\n]+)/mi)?.[1]||null,
      accountId:desc.match(/^Account:\s*([^\s\r\n]+)/mi)?.[1]||null
    };
  }
  async function load() {
    const c=client();if(!c)return {configured:false};
    const user=await currentUser();
    if(loadFlight&&loadFlight.userId===user.id)return loadFlight.promise;
    const generation=++loadGeneration;
    const promise=(async()=>{
      const accountResult=await c.from('connected_accounts')
        .select('id,user_id,provider,provider_account_id,email,display_name,scopes,connection_status,last_synced_at,created_at,updated_at')
        .eq('user_id',user.id).eq('provider','google').eq('connection_status','connected')
        .order('updated_at',{ascending:false});
      if(accountResult.error)throw accountResult.error;
      const rawConnectedRows=accountResult.data||[];
      const primaryAccount=choosePrimaryGoogleAccount(rawConnectedRows,user);
      const connectedRows=primaryAccount?[primaryAccount]:[];
      const connectedIds=new Set(connectedRows.map(a=>String(a.id)));
      const primaryId=primaryAccount?String(primaryAccount.id):null;
      window.onespacePrimaryGoogleAccount=primaryAccount?{id:primaryAccount.id,email:primaryAccount.email||'',lastSyncedAt:primaryAccount.last_synced_at||null}:null;
      window.onespaceAccountSelectionIssue=rawConnectedRows.length>1&&!primaryAccount
        ? 'More than one Google mailbox is connected, but none matches this OneSpace login. No mailbox was selected to avoid mixing data.'
        : rawConnectedRows.length>1&&primaryAccount
          ? `Only ${primaryAccount.email||'the sign-in mailbox'} is active in this OneSpace login. Other saved Google connections are not loaded or synced.`
          : '';

      // Fetch every synchronized email page for the single selected mailbox.
      // This lets Aries scan the full loaded mailbox rather than an arbitrary first 160/400 rows.
      const [emailResult,eventResult,taskResult,noteResult,contactResult,driveResult]=await Promise.all([
        primaryId
          ? fetchAllPages((from,to)=>c.from('email_messages').select('*').eq('user_id',user.id).eq('account_id',primaryId).eq('provider','gmail').order('received_at',{ascending:false}).range(from,to))
          : Promise.resolve({data:[],error:null}),
        fetchAllPages((from,to)=>c.from('calendar_events').select('*').eq('user_id',user.id).order('starts_at',{ascending:true}).range(from,to)),
        fetchAllPages((from,to)=>c.from('tasks').select('*').eq('user_id',user.id).order('due_at',{ascending:true,nullsFirst:false}).range(from,to)),
        c.from('daily_notes').select('*').eq('user_id',user.id).order('note_date',{ascending:false}).limit(500),
        fetchAllPages((from,to)=>c.from('contacts').select('*').eq('user_id',user.id).range(from,to)),
        fetchAllPages((from,to)=>c.from('drive_files').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}).range(from,to))
      ]);
      if(generation!==loadGeneration)return {configured:true,superseded:true};
      const tableResults=[emailResult,eventResult,taskResult,noteResult,contactResult,driveResult];
      const tableNames=['email_messages','calendar_events','tasks','daily_notes','contacts','drive_files'];
      const failed=tableResults.map((r,i)=>r.error?`${tableNames[i]}: ${r.error.message}`:null).filter(Boolean);
      if(failed.length){
        console.error('OneSpace Supabase data load:',failed);
        clearWorkspaceState();
        const signature=failed.join(' | ');
        if(signature!==lastLoadError){notify('Workspace data could not be loaded. Check the OneSpace Supabase schema and table permissions.');lastLoadError=signature;}
        window.dispatchEvent(new CustomEvent('onespace:data-load-error',{detail:{userId:user.id,errors:failed}}));
        return {configured:true,errors:failed};
      }
      lastLoadError='';
      const data={
        connected_accounts:connectedRows,
        email_messages:emailResult.data||[],
        calendar_events:eventResult.data||[],
        tasks:taskResult.data||[],
        daily_notes:noteResult.data||[],
        contacts:contactResult.data||[],
        drive_files:driveResult.data||[]
      };
      const activeMailRows=data.email_messages.filter(m=>String(m.provider||'').toLowerCase()==='gmail'&&m.account_id&&connectedIds.has(String(m.account_id)));
      const mappedEmails=activeMailRows.map(m=>({id:m.id,accountId:String(m.account_id),providerMessageId:m.provider_message_id,threadId:m.thread_id,name:m.sender_name||m.sender_email||'Unknown sender',email:m.sender_email||'',to:(m.to_recipients||[]).map(x=>x.email).filter(Boolean).join(', '),cc:(m.cc_recipients||[]).map(x=>x.email).filter(Boolean).join(', '),subject:m.subject||'(no subject)',snippet:m.snippet||'',body:m.body_text||'',bodyHtml:m.body_html||'',time:safeTime(m.received_at),receivedAt:m.received_at,ts:Date.parse(m.received_at)||0,provider:'Gmail',initial:(m.sender_name||m.sender_email||'?').split(/[\s@]/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase(),unread:!m.is_read,starred:m.is_starred,important:m.is_important,folder:m.folder,archived:m.folder==='archive',trashed:m.folder==='trash',outbound:m.folder==='sent',category:m.category,attachments:m.metadata?.attachments||[],messageHeaders:m.metadata?.headers||{}}));
      if(Array.isArray(emails))emails.splice(0,emails.length,...mappedEmails);
      const activeEvents=data.calendar_events.filter(e=>!e.is_cancelled&&(String(e.provider||'').toLowerCase()==='onespace'||(String(e.provider||'').toLowerCase()==='google'&&e.account_id&&connectedIds.has(String(e.account_id)))));
      if(Array.isArray(events))events.splice(0,events.length,...activeEvents.map(e=>({id:e.id,accountId:e.account_id||null,title:e.title,date:safeDate(e.starts_at),dateISO:safeDateKey(e.starts_at),startsAtISO:e.starts_at,endsAtISO:e.ends_at,time:e.all_day?'All day':safeTime(e.starts_at),end:e.all_day?'All day':safeTime(e.ends_at),allDay:!!e.all_day,provider:e.provider==='google'?'Google Calendar':'OneSpace',durationMin:e.all_day?0:Math.max(0,(new Date(e.ends_at)-new Date(e.starts_at))/60000),location:e.location||'',agenda:e.description||'',attendees:Array.isArray(e.attendees)?e.attendees.map(a=>a.email||a.name||'').filter(Boolean).join(', '):''})));
      const activeDriveRows=data.drive_files.filter(f=>{
        const provider=String(f.storage_provider||'').toLowerCase();
        if(provider==='onedrive')return false;
        if(provider==='google_drive')return !!f.account_id&&connectedIds.has(String(f.account_id));
        return provider==='supabase'||!provider;
      });
      if(Array.isArray(files))files.splice(0,files.length,...activeDriveRows.map(f=>({id:f.id,accountId:f.account_id||null,name:f.name,type:f.is_folder?'FOLDER':f.mime_type||'FILE',source:f.storage_provider==='google_drive'?'Google Drive':'Supabase Storage',date:safeDate(f.updated_at),size:size(f.size_bytes),bytes:Number(f.size_bytes)||0,icon:(f.mime_type||'FILE').split('/').pop()?.slice(0,4).toUpperCase()||'FILE',mime:f.mime_type||'',object_path:f.object_path,bucket_id:f.bucket_id,storage_provider:f.storage_provider,web_view_link:f.web_view_link})));
      if(Array.isArray(accounts))accounts.splice(0,accounts.length,...connectedRows.map(a=>({id:a.id,providerAccountId:a.provider_account_id||null,provider:'Google',email:a.email||'Google account',displayName:a.display_name||a.email||'Google account',services:'Gmail · Calendar · Drive',status:a.connection_status,cls:'g',lastSyncedAt:a.last_synced_at||null,scopes:Array.isArray(a.scopes)?a.scopes:[]})));
      if(Array.isArray(contacts))contacts.splice(0,contacts.length,...data.contacts.filter(row=>!row.account_id||connectedIds.has(String(row.account_id))).map(row=>[row.full_name||row.email||'Contact',row.email||'',row.organisation||'',row.source||'manual']));
      if(Array.isArray(tasks)){
        const visibleTasks=data.tasks.map(t=>{
          const meta=parseTaskMetadata(t.description);
          const sourceId=meta.sourceId||t.source_mail_id||null;
          const sourceAccountId=meta.accountId||null;
          const base={id:t.id,title:t.title,due:t.due_at?safeDate(t.due_at):'No due date',dueAt:t.due_at,priority:(t.priority||'normal').replace(/^./,x=>x.toUpperCase()),done:t.status==='completed',status:t.status,description:t.description,source:t.source||'onespace'};
          const isEmailTask=!!sourceId||String(t.source||'').toLowerCase()==='aries-mail'||/^Created from email:/i.test(String(t.description||''));
          if(!isEmailTask){
            // Personal OneSpace tasks never depend on a Google mailbox.
            if(sourceAccountId&&!connectedIds.has(sourceAccountId))return null;
            return base;
          }
          if(!sourceId)return null;
          if(sourceAccountId&&!connectedIds.has(sourceAccountId))return null;
          let sourceMail=mappedEmails.find(m=>String(m.id)===String(sourceId)&&(!sourceAccountId||String(m.accountId)===String(sourceAccountId)));
          if(!sourceMail){
            const providerMatches=mappedEmails.filter(m=>String(m.providerMessageId||'')===String(sourceId)&&(!sourceAccountId||String(m.accountId)===String(sourceAccountId)));
            if(providerMatches.length===1)sourceMail=providerMatches[0];
          }
          // Only show email-derived tasks when the originating email can be verified.
          if(!sourceMail)return null;
          const sourceAccount=connectedRows.find(a=>String(a.id)===String(sourceMail.accountId));
          return {...base,source:'aries-mail',ariesAdded:true,sourceMailId:sourceId,sourceMailInternalId:sourceMail.id,sourceMailAccountId:sourceMail.accountId,sourceMailSubject:sourceMail.subject||'(no subject)',sourceMailSender:sourceMail.name||sourceMail.email||'Unknown sender',sourceMailAccountEmail:sourceAccount?.email||'Connected Google account',sourceMailReceivedAt:sourceMail.receivedAt||null};
        }).filter(Boolean);
        tasks.splice(0,tasks.length,...visibleTasks);
      }
      const render=fn=>{try{fn?.()}catch(e){console.warn('OneSpace render skipped:',e)}};
      render(window.renderMail);render(window.renderEvents);render(window.renderAccounts);render(window.renderContacts);render(window.renderTasks);render(window.refreshOverview);render(window.refreshMail);render(window.updateMailCounters);render(window.renderDriveV6);render(window.renderMonth);render(window.renderNotifications);render(window.renderAriesTaskCalendar);
      const today=document.getElementById('dailyNoteDate')?.value||new Date().toLocaleDateString('en-CA');
      const note=data.daily_notes.find(n=>n.note_date===today);
      if(document.getElementById('dailyNoteText'))document.getElementById('dailyNoteText').value=note?.content||'';
      const noteStatus=document.getElementById('dailyNoteSaved');if(noteStatus)noteStatus.textContent=note?'Synced to your account':'No saved note for this date';
      const status=document.getElementById('storageConnectionText');if(status)status.textContent='Supabase database connected';
      const usedBytes=activeDriveRows.filter(f=>f.storage_provider==='supabase'&&!f.is_folder).reduce((n,f)=>n+(Number(f.size_bytes)||0),0);
      const usedLabel=size(usedBytes);const usage=document.getElementById('storageUsedText');if(usage)usage.innerHTML=`${usedLabel} <small>used · quota shown in Supabase</small>`;
      const docsBytes=activeDriveRows.filter(f=>!f.is_folder&&/pdf|document|spreadsheet|text|presentation|csv|msword|officedocument/i.test(f.mime_type||'')).reduce((n,f)=>n+(Number(f.size_bytes)||0),0);
      const mediaBytes=activeDriveRows.filter(f=>!f.is_folder&&/image|video|audio/i.test(f.mime_type||'')).reduce((n,f)=>n+(Number(f.size_bytes)||0),0);
      const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=size(value);};setText('storageDocs',docsBytes);setText('storageImages',mediaBytes);setText('storageOther',Math.max(0,usedBytes-docsBytes-mediaBytes));
      window.dispatchEvent(new CustomEvent('onespace:data-loaded',{detail:{userId:user.id,counts:{connected_accounts:rawConnectedRows.length,email_messages:activeMailRows.length,calendar_events:activeEvents.length,tasks:tasks.length,daily_notes:data.daily_notes.length,contacts:data.contacts.length,drive_files:activeDriveRows.length,visibleEmails:mappedEmails.length,visibleEvents:activeEvents.length,visibleTasks:tasks.length},accounts:connectedRows.map(a=>({id:a.id,email:a.email||'',lastSyncedAt:a.last_synced_at||null,scopes:Array.isArray(a.scopes)?a.scopes:[]})),accountSelectionIssue:window.onespaceAccountSelectionIssue||'',mailboxCount:connectedRows.length}}));
      return {configured:true,userId:user.id,counts:{email_messages:mappedEmails.length,calendar_events:activeEvents.length,tasks:tasks.length,drive_files:activeDriveRows.length},mailboxCount:connectedRows.length,accountSelectionIssue:window.onespaceAccountSelectionIssue||''};
    })();
    loadFlight={userId:user.id,promise};
    try{return await promise;}finally{if(loadFlight?.promise===promise)loadFlight=null;}
  }
  async function saveDailyNote(noteDate,content){const c=client();const user=await currentUser();const {error}=await c.from('daily_notes').upsert({user_id:user.id,note_date:noteDate,content},{onConflict:'user_id,note_date'});if(error)throw error;return true;}
  async function saveTask(task){const c=client();const user=await currentUser();let dueAt=task.dueAt||null;if(!dueAt){const label=String(task.due||'').toLowerCase();if(label.startsWith('today')){const d=new Date();d.setHours(23,59,0,0);dueAt=d.toISOString();}else if(label.startsWith('tomorrow')){const d=new Date();d.setDate(d.getDate()+1);d.setHours(23,59,0,0);dueAt=d.toISOString();}}let description=String(task.description||'');const upsertMeta=(key,value)=>{if(!value)return;const re=new RegExp('^'+key+':\\s*[^\\r\\n]*','mi');if(re.test(description))description=description.replace(re,key+': '+String(value));else description=(description?description+'\n':'')+key+': '+String(value);};if(task.sourceMailId){upsertMeta('Source',task.sourceMailId);upsertMeta('Account',task.sourceMailAccountId||task.accountId);}const row={user_id:user.id,title:task.title,description:description||null,source:task.sourceMailId?(task.source||'aries-mail'):(task.source||'onespace'),source_mail_id:task.sourceMailId?String(task.sourceMailId):null,due_at:dueAt,priority:String(task.priority||'normal').toLowerCase(),status:task.done?'completed':'open'};const isDbId=typeof task.id==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(task.id);const q=isDbId?c.from('tasks').update(row).eq('id',task.id).eq('user_id',user.id).select('id').single():c.from('tasks').insert(row).select('id').single();const {data,error}=await q;if(error)throw error;return data.id;}
  async function removeTask(id){const c=client();const user=await currentUser();const {error}=await c.from('tasks').delete().eq('id',id).eq('user_id',user.id);if(error)throw error;return true;}
  async function saveEvent(event){const c=client();const user=await currentUser();const row={user_id:user.id,title:event.title,description:event.description||event.agenda||null,location:event.location||null,starts_at:event.starts_at||event.startsAt,ends_at:event.ends_at||event.endsAt,provider:'onespace'};const {data,error}=await c.from('calendar_events').insert(row).select('id').single();if(error)throw error;return data.id;}
  async function updateEvent(id,patch){const c=client();const user=await currentUser();const row={};if(patch.starts_at)row.starts_at=patch.starts_at;if(patch.ends_at)row.ends_at=patch.ends_at;if(patch.title)row.title=String(patch.title).slice(0,240);const {data,error}=await c.from('calendar_events').update(row).eq('id',id).eq('user_id',user.id).eq('provider','onespace').select('id').single();if(error)throw error;return data.id;}

  async function loadAriesPersonalization(){
    const c=client();if(!c)return{profile:null,memories:[]};
    const user=await currentUser();
    const [profileResult,memoryResult]=await Promise.all([
      c.from('aries_profiles').select('*').eq('user_id',user.id).maybeSingle(),
      c.from('aries_memory_entries').select('id,entry_type,title,content,entry_date,source,created_at').eq('user_id',user.id).order('entry_date',{ascending:false}).order('created_at',{ascending:false}).limit(20)
    ]);
    if(profileResult.error)throw profileResult.error;if(memoryResult.error)throw memoryResult.error;
    return{profile:profileResult.data||null,memories:memoryResult.data||[],userId:user.id};
  }
  async function saveAriesProfile(profile){
    const c=client();const user=await currentUser();
    const row={user_id:user.id,preferred_name:String(profile.preferred_name||'').slice(0,80),role_context:String(profile.role_context||'').slice(0,120),preferred_language:['auto','hi','en'].includes(profile.preferred_language)?profile.preferred_language:'auto',response_style:['natural','concise','detailed','professional'].includes(profile.response_style)?profile.response_style:'natural',about_user:String(profile.about_user||'').slice(0,1800),goals:String(profile.goals||'').slice(0,1200),interests:String(profile.interests||'').slice(0,1200),memory_enabled:!!profile.memory_enabled,workspace_context_enabled:profile.workspace_context_enabled!==false};
    const {data,error}=await c.from('aries_profiles').upsert(row,{onConflict:'user_id'}).select('*').single();if(error)throw error;return data;
  }
  async function saveAriesMemoryEntry(entry){
    const c=client();const user=await currentUser();
    const row={user_id:user.id,entry_type:entry.entry_type||'daily_journal',title:String(entry.title||'').slice(0,120),content:String(entry.content||'').slice(0,5000),entry_date:entry.entry_date||new Date().toLocaleDateString('en-CA'),source:entry.source==='assistant_suggestion'?'assistant_suggestion':'user'};
    const {data,error}=await c.from('aries_memory_entries').insert(row).select('id,entry_type,title,content,entry_date,source,created_at').single();if(error)throw error;return data;
  }
  async function deleteAriesMemoryEntry(id){const c=client();const user=await currentUser();const {error}=await c.from('aries_memory_entries').delete().eq('id',id).eq('user_id',user.id);if(error)throw error;return true;}
  async function deleteAriesMemoryEntries(ids){const c=client();const user=await currentUser();const list=(Array.isArray(ids)?ids:[]).filter(Boolean);if(!list.length)return true;const {error}=await c.from('aries_memory_entries').delete().in('id',list).eq('user_id',user.id);if(error)throw error;return true;}

  async function syncGoogle(options={}){
    const cfg=window.ONESPACE_INTEGRATION_CONFIG||{};
    if(!cfg.googleSyncUrl)throw new Error('Google sync endpoint is not configured.');
    const c=client();
    if(!c)throw new Error('Supabase authentication is not ready. Refresh and sign in again.');
    const {data,error}=await c.auth.getSession();
    if(error)throw error;
    if(!data?.session?.access_token)throw new Error('Please sign in first.');
    const publicKey=window.ONESPACE_AUTH_CONFIG?.supabaseAnonKey||'';
    if(!publicKey)throw new Error('Supabase publishable key is missing from auth-config.js.');
    const user=await currentUser();
    const {data:rows,error:accountError}=await c.from('connected_accounts')
      .select('id,email,connection_status,provider,updated_at,last_synced_at')
      .eq('user_id',user.id).eq('provider','google').eq('connection_status','connected')
      .order('updated_at',{ascending:false});
    if(accountError)throw accountError;
    const primary=choosePrimaryGoogleAccount(rows||[],user);
    if(!primary){
      await load();
      if((rows||[]).length>1)throw new Error('Multiple Google mailboxes are connected to this OneSpace login, but none matches the sign-in email. OneSpace now supports one mailbox per login. No mailbox was synced to avoid mixing data.');
      throw new Error('No connected Google mailbox was found. Connect the Google account that matches your OneSpace login.');
    }
    const explicitAccountId=options?.accountId?String(options.accountId):null;
    if(explicitAccountId&&explicitAccountId!==String(primary.id)){
      throw new Error('This mailbox is not the selected Google account for the current OneSpace login.');
    }
    const request={...(options||{}),accountId:primary.id};
    window.dispatchEvent(new CustomEvent('onespace:google-sync-start',{detail:{accountId:primary.id,email:primary.email||''}}));
    try{
      const response=await fetch(cfg.googleSyncUrl,{
        method:'POST',
        headers:{Authorization:`Bearer ${data.session.access_token}`,apikey:publicKey,'Content-Type':'application/json'},
        body:JSON.stringify(request)
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||`Sync failed (${response.status})`);
      await load();
      const counts=result.counts||{};
      const output={ok:true,accountsSynced:1,accountsAttempted:1,accountEmail:primary.email||'',counts:{emails:Number(counts.emails)||0,events:Number(counts.events)||0,driveFiles:Number(counts.driveFiles)||0},results:[{accountId:primary.id,email:primary.email||'',...result}],errors:[]};
      window.dispatchEvent(new CustomEvent('onespace:google-sync-complete',{detail:output}));
      return output;
    }catch(error){
      window.dispatchEvent(new CustomEvent('onespace:google-sync-error',{detail:{accountId:primary.id,email:primary.email||'',message:error?.message||'Sync failed'}}));
      throw error;
    }
  }
  async function logAriesAction(action){const c=client();if(!c)return null;const user=await currentUser();const row={user_id:user.id,action_type:String(action.action_type||'workspace_action').slice(0,80),action_label:String(action.action_label||'').slice(0,240),target_type:action.target_type||null,target_id:action.target_id||null,status:action.status||'succeeded',details:action.details&&typeof action.details==='object'?action.details:{}};const {data,error}=await c.from('aries_action_log').insert(row).select('id').single();if(error)throw error;return data;}
  async function listAriesActions(limit=12){const c=client();if(!c)return[];const user=await currentUser();const {data,error}=await c.from('aries_action_log').select('id,action_type,action_label,target_type,target_id,status,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(Math.min(30,Math.max(1,Number(limit)||12)));if(error)throw error;return data||[];}
  window.getOneSpaceSnapshot=()=>({
    tasks:(typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks:[]).map(t=>({...t})),
    emails:(typeof emails!=='undefined'&&Array.isArray(emails)?emails:[]).map(m=>({...m})),
    events:(typeof events!=='undefined'&&Array.isArray(events)?events:[]).map(e=>({...e})),
    accounts:(typeof accounts!=='undefined'&&Array.isArray(accounts)?accounts:[]).map(a=>({...a}))
  });
  window.onespaceCloud={load,saveDailyNote,saveTask,removeTask,saveEvent,updateEvent,currentUser,syncGoogle,loadAriesPersonalization,saveAriesProfile,saveAriesMemoryEntry,deleteAriesMemoryEntry,deleteAriesMemoryEntries,logAriesAction,listAriesActions};
  const noteDate=document.getElementById('dailyNoteDate'),noteText=document.getElementById('dailyNoteText');
  const syncNote=()=>{if(!noteDate||!noteText||!client())return;saveDailyNote(noteDate.value,noteText.value).then(()=>{const st=document.getElementById('dailyNoteSaved');if(st)st.textContent='Synced to your account';}).catch(e=>{console.warn('Daily note sync:',e);notify('Note saved locally, but cloud sync failed: '+e.message);});};
  noteText?.addEventListener('change',syncNote);document.getElementById('dailyNoteSave')?.addEventListener('click',syncNote);
  let googleAutoSyncTimer=null,googleAutoSyncBusy=false,googleAutoSyncError='',lastGooglePollAt=0;
  async function pollGoogleInBackground(){
    if(googleAutoSyncBusy||document.hidden||navigator.onLine===false||!client())return;
    if(Date.now()-lastGooglePollAt<240000)return;
    googleAutoSyncBusy=true;lastGooglePollAt=Date.now();
    try{
      const result=await syncGoogle({mode:'poll'});
      googleAutoSyncError='';
      const st=document.getElementById('googleAutoSyncState');
      if(st)st.textContent=`Auto-sync active · ${result.accountEmail||'Google mailbox'} · ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
      window.dispatchEvent(new CustomEvent('onespace:google-auto-synced',{detail:result}));
    }catch(error){
      const message=error?.message||'sync unavailable';
      const st=document.getElementById('googleAutoSyncState');
      if(st)st.textContent='Auto-sync paused: '+message.slice(0,90);
      if(message!==googleAutoSyncError){console.warn('OneSpace background Google sync:',error);googleAutoSyncError=message;}
    }finally{googleAutoSyncBusy=false;}
  }
  function startGoogleAutoSync(){
    if(googleAutoSyncTimer)clearInterval(googleAutoSyncTimer);
    googleAutoSyncTimer=null;
    const st=document.getElementById('googleAutoSyncState');
    let raw=null;try{raw=localStorage.getItem('onespaceSyncMs');}catch(_){/* storage may be blocked */}
    const parsed=raw===null?300000:Number(raw);
    const requestedMs=Number.isFinite(parsed)?Math.max(0,Math.min(3600000,parsed)):300000;
    const ms=requestedMs>0?Math.max(300000,requestedMs):0;
    if(st)st.textContent=ms>0?`Automatic sync checks every ${Math.round(ms/60000)} min`:'Automatic sync is off';
    if(ms>0)googleAutoSyncTimer=setInterval(pollGoogleInBackground,ms);
  }
  window.onespaceRestartAutoSync=startGoogleAutoSync;
  let authLoadUserId=null;
  function loadForAuthenticatedUser(userId){
    const id=String(userId||'');
    // The auth listener and initial getSession check can report the same user.
    // The active ID is set by the auth controller before it emits the event.
    if(!id||id!==String(window.onespaceActiveUserId||'')||authLoadUserId===id)return;
    authLoadUserId=id;
    load().then(startGoogleAutoSync).catch(e=>{console.error(e);clearWorkspaceState();notify('Could not load your OneSpace data: '+e.message);});
  }
  window.addEventListener('onespace:authenticated',event=>loadForAuthenticatedUser(event.detail?.user?.id||window.onespaceActiveUserId));
  window.addEventListener('onespace:signed-out',()=>{authLoadUserId=null;loadGeneration++;loadFlight=null;if(googleAutoSyncTimer)clearInterval(googleAutoSyncTimer);googleAutoSyncTimer=null;clearWorkspaceState();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&client())pollGoogleInBackground();});
  // Recover if auth restoration finished before this data module attached its listener.
  client()?.auth.getSession().then(({data})=>{const id=data?.session?.user?.id;if(id)loadForAuthenticatedUser(id);}).catch(error=>console.warn('OneSpace initial session check:',error));
})();
