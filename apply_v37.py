from pathlib import Path
root=Path('/mnt/data/onespace_v37_work')
p=root/'index.html'
s=p.read_text()
# Topbar and welcome copy/layout
s=s.replace('<button class="connect" onclick="openModal(\'connectModal\')"><span>＋</span> Connect account</button>', '<button class="connect" id="onespaceTopConnect" onclick="openModal(\'connectModal\')"><span>＋</span> Connect Google</button>')
s=s.replace('<p>Your personal workspace, ready when your accounts are connected.</p>', '<p class="welcome-description">Your personal workspace, ready when your Google mailbox is connected.</p>')
# One mailbox messaging / no account integration list
s=s.replace('<h2>Connected accounts</h2></div><button class="softbtn primary" onclick="openModal(\'connectModal\')">＋ Connect account</button>', '<h2>Google connection</h2><p class="page-subtitle">One Google mailbox per OneSpace login.</p></div>')
s=s.replace('<h3>Your accounts</h3><small>Connected provider accounts</small>', '<h3>Your Google mailbox</h3><small>One connected mailbox for this OneSpace login</small>')
s=s.replace('<h3 id="connectModalTitle">Bring your accounts together.</h3><p>Choose a provider. You’ll review permissions on the provider’s own secure consent screen.</p>', '<h3 id="connectModalTitle">Connect your Google mailbox.</h3><p>Connect the Google account used by this OneSpace login. One mailbox is supported per login.</p>')
s=s.replace('<p>Bring your inbox, meetings and selected Drive files into OneSpace.</p><small class="integration-auth-note">OneSpace sign-in and Google Workspace access are separate security permissions. Connect once to grant Gmail, Calendar and Drive access.</small>', '<p>Bring this mailbox’s Gmail, Calendar and Drive into OneSpace.</p><small class="integration-auth-note">One Google mailbox per OneSpace login. To replace it, disconnect the existing Google connection before connecting another.</small>')
s=s.replace('<strong>Your accounts stay yours</strong><small>OneSpace should request only the permissions you approve. Passwords and provider secrets are never entered into this page.</small>', '<strong>Your Google mailbox stays yours</strong><small>OneSpace uses one Google mailbox for each login. You approve Google permissions on Google’s secure consent screen.</small>')
s=s.replace('<span>Connect a provider to populate this workspace with your data.</span>', '<span>Connect one Google mailbox to populate this workspace.</span>')
s=s.replace('<option value="all">All accounts</option><option value="Gmail">Gmail</option>', '<option value="all">All mail</option><option value="Gmail">Gmail</option>')
s=s.replace('>Connect mailbox</button>', '>Connect Google</button>')
s=s.replace('>View original email <span aria-hidden="true">↗</span>', '>View email <span aria-hidden="true">↗</span>')
# Calendar sync toolbar/status
old='<div class="toolbar calendar-toolbar"><button class="softbtn calendar-today" onclick="goCalendarToday()">Today</button>'
new='<div class="toolbar calendar-toolbar"><button class="softbtn calendar-today" onclick="goCalendarToday()">Today</button><button class="softbtn calendar-sync-button" id="calendarSyncNowBtn" type="button" onclick="syncOneSpaceCalendarNow()">Sync calendar ↻</button>'
s=s.replace(old,new)
s=s.replace('<p class="page-subtitle">Choose any day to see what is booked, what is free, and what needs your attention.</p></div><div class="toolbar calendar-toolbar">', '<p class="page-subtitle">Choose any day to see what is booked, what is free, and what needs your attention.</p><small class="calendar-sync-status" id="calendarSyncStatus" aria-live="polite">Checking your connected Google Calendar…</small></div><div class="toolbar calendar-toolbar">')
# Notification header labels
s=s.replace('onclick="markAllNotificationsRead()" type="button">Mark all read</button>', 'onclick="markAllNotificationsRead()" type="button">Mark all seen</button>')
s=s.replace('<div class="notification-popover-foot"><span>Updates from your workspace</span>', '<div class="notification-popover-foot"><span>Seen here only; Gmail unread status is unchanged.</span>')
# Replace notification renderer and mark-as-read logic with seen-state logic
start=s.index(' window.renderNotifications=function(){', s.index('let notificationReadScope'))
end=s.index(" $('notificationItems')?.addEventListener('click'", start)
new_block=r''' window.renderNotifications=function(){
   ensureNotificationReadScope();
   const items=buildWorkspaceNotifications();
   const box=$('notificationItems');
   if(box)box.innerHTML=items.length?items.slice(0,6).map(n=>{
     const key=notificationKey(n),isSeen=notificationReadKeys.has(key);
     const iconMarkup=n.icon==='mail'?'<path d="M4 5.5h16v13H4z"/><path d="m4 7 8 6 8-6"/>':n.icon==='calendar'?'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4m8-4v4M3 9h18"/>':'<path d="m5 12 4 4L19 6"/>';
     return `<div class="notification-row ${isSeen?'is-read':'is-unread'}" data-notification-kind="${esc(n.kind)}" data-notification-id="${esc(String(n.id||''))}" data-notification-key="${esc(key)}">
       <button type="button" class="notification-row-main" data-notification-open data-notification-kind="${esc(n.kind)}" data-notification-id="${esc(String(n.id||''))}" data-notification-date="${esc(n.date||'')}" data-source-mail-id="${esc(n.sourceMailId||'')}" data-source-account-id="${esc(n.sourceMailAccountId||'')}" aria-label="Open ${esc(n.title)}">
        <span class="notification-row-icon ${n.icon==='mail'?'notification-mail-received':''}"><svg viewBox="0 0 24 24">${iconMarkup}</svg></span><span class="notification-row-copy"><strong>${esc(n.title)}</strong><small>${esc(n.body)}</small><em>${esc(n.when)}</em></span>
       </button>
       <button type="button" class="notification-mark-read" data-notification-read="${esc(key)}" aria-label="${isSeen?'Already seen':'Mark notification as seen'}" title="${isSeen?'Already seen':'Mark as seen'}" ${isSeen?'disabled':''}>${isSeen?'<span aria-hidden="true">✓</span><span>Seen</span>':'<span aria-hidden="true">✓</span><span>Mark seen</span>'}</button>
     </div>`;
   }).join(''):'<div class="empty-note">You’re all caught up.</div>';
   const unseenCount=items.filter(n=>!notificationReadKeys.has(notificationKey(n))).length;
   const badge=$('notificationBadge');
   if(badge){badge.textContent=Math.min(9,unseenCount);badge.style.display=unseenCount?'grid':'none';badge.setAttribute('aria-label',`${unseenCount} unseen notifications`);}
   const markAll=$('notificationMarkAllRead');
   if(markAll){markAll.disabled=!unseenCount;markAll.textContent=unseenCount?'Mark all seen':'All seen';}
 };
 async function markOneNotificationRead(key){
   ensureNotificationReadScope();
   notificationReadKeys.add(String(key));
   persistNotificationReadState();
   window.renderNotifications?.();
   return true;
 }
 window.markAllNotificationsRead=async function(){
   ensureNotificationReadScope();
   const items=buildWorkspaceNotifications().slice(0,6);
   let marked=0;
   for(const item of items){
     const key=notificationKey(item);
     if(notificationReadKeys.has(key))continue;
     notificationReadKeys.add(key);marked++;
   }
   persistNotificationReadState();
   window.renderNotifications?.();
   window.toast?.(`${marked} notification${marked===1?'':'s'} marked as seen. Gmail read status was not changed.`);
   return marked;
 };
 // Compatibility aliases retained for older UI hooks.
 window.markNotificationsSeen=window.markAllNotificationsRead;
'''
s=s[:start]+new_block+s[end:]
# Modify delegated event click block to mark opened notifications seen; remove duplicate per-kind writes.
old="""   const readButton=event.target.closest('[data-notification-read]');
   if(readButton){event.preventDefault();event.stopPropagation();readButton.disabled=true;const marked=await markOneNotificationRead(readButton.dataset.notificationRead,readButton.dataset.notificationKind,readButton.dataset.notificationId);if(!marked)readButton.disabled=false;return;}
   const row=event.target.closest('[data-notification-open]');if(!row)return;
   const kind=row.dataset.notificationKind,id=row.dataset.notificationId,key=row.closest('.notification-row')?.dataset.notificationKey||'';
   if(kind==='mail')window.openMail?.(id);
   else if(kind==='calendar'){if(key){notificationReadKeys.add(key);persistNotificationReadState();}if(row.dataset.notificationDate)window.selectCalendarDay?.(row.dataset.notificationDate);window.showPage?.('calendar');}
   else if(kind==='task'){
     if(key){notificationReadKeys.add(key);persistNotificationReadState();}
     if(row.dataset.sourceMailId)window.openTaskSourceEmail?.(row.dataset.sourceMailId,row.dataset.sourceAccountId);
     else{window.showPage?.('tasks');requestAnimationFrame(()=>{const target=document.querySelector(`[data-task-row="${CSS.escape(id)}"]`);target?.scrollIntoView({behavior:'smooth',block:'center'});target?.classList.add('notification-target');setTimeout(()=>target?.classList.remove('notification-target'),1800);});}
   }
   window.renderNotifications?.();window.toggleNotifications?.(false);
"""
new="""   const readButton=event.target.closest('[data-notification-read]');
   if(readButton){event.preventDefault();event.stopPropagation();readButton.disabled=true;await markOneNotificationRead(readButton.dataset.notificationRead);return;}
   const row=event.target.closest('[data-notification-open]');if(!row)return;
   const kind=row.dataset.notificationKind,id=row.dataset.notificationId,key=row.closest('.notification-row')?.dataset.notificationKey||'';
   if(key){notificationReadKeys.add(key);persistNotificationReadState();}
   if(kind==='mail')window.openMail?.(id);
   else if(kind==='calendar'){if(row.dataset.notificationDate)window.selectCalendarDay?.(row.dataset.notificationDate);window.showPage?.('calendar');}
   else if(kind==='task'){
     if(row.dataset.sourceMailId)window.openTaskSourceEmail?.(row.dataset.sourceMailId,row.dataset.sourceAccountId);
     else{window.showPage?.('tasks');requestAnimationFrame(()=>{const target=document.querySelector(`[data-task-row="${CSS.escape(id)}"]`);target?.scrollIntoView({behavior:'smooth',block:'center'});target?.classList.add('notification-target');setTimeout(()=>target?.classList.remove('notification-target'),1800);});}
   }
   window.renderNotifications?.();window.toggleNotifications?.(false);
"""
if old not in s: print('WARNING notification delegated block not matched')
else: s=s.replace(old,new)
# safer task source email opener: exact mailbox and graceful refresh once
old="window.openTaskSourceEmail=function(id,accountId){const key=String(id||\"\");const message=(typeof emails!==\"undefined\"?emails:[]).find(m=>(String(m.id)===key||String(m.providerMessageId||\"\")===key)&&(!accountId||String(m.accountId||\"\")===String(accountId)));if(!message){toast(\"The source email is no longer available in a connected mailbox. Reconnect that Google account and sync again.\");return;}window.openMail?.(message.id);};"
new="window.openTaskSourceEmail=async function(id,accountId){const key=String(id||\"\");const find=()=>(typeof emails!==\"undefined\"?emails:[]).find(m=>(String(m.id)===key||String(m.providerMessageId||\"\")===key)&&(!accountId||String(m.accountId||\"\")===String(accountId)));let message=find();if(!message&&window.onespaceCloud?.load){try{await window.onespaceCloud.load();message=find();}catch(error){console.warn(\"Could not refresh task source email:\",error);}}if(!message){toast(\"The original email is not available in this login's connected mailbox. The task is kept, but its source cannot currently be opened.\");return false;}window.openMail?.(message.id);return true;};"
if old not in s: print('WARNING task open source block not matched')
else:s=s.replace(old,new)
# Calendar sync UI script
calendar_script=r'''
<script id="onespace-v37-calendar-sync-ui">
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 let busy=false;
 function setStatus(message,mode='idle'){
   const el=$('calendarSyncStatus');if(!el)return;
   el.textContent=message;el.dataset.state=mode;
 }
 function renderStatus(){
   const account=window.onespacePrimaryGoogleAccount;
   const issue=window.onespaceAccountSelectionIssue;
   const button=$('calendarSyncNowBtn');
   if(issue&&!account){setStatus(issue,'warning');if(button)button.disabled=true;return;}
   if(!account){setStatus('OneSpace calendar is available. Connect the Google mailbox used by this login to show Google events.','idle');if(button)button.disabled=true;return;}
   if(button)button.disabled=busy;
   const last=account.lastSyncedAt?new Date(account.lastSyncedAt):null;
   const when=last&&!Number.isNaN(last.getTime())?` · Last sync ${last.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'';
   setStatus(`Connected to ${account.email||'your Google Calendar'}${when}`,'success');
 }
 window.syncOneSpaceCalendarNow=async function(){
   if(busy)return;
   const account=window.onespacePrimaryGoogleAccount;
   if(!account){setStatus(window.onespaceAccountSelectionIssue||'Connect one Google mailbox before syncing Calendar.','warning');return;}
   const button=$('calendarSyncNowBtn');busy=true;
   if(button){button.disabled=true;button.textContent='Syncing…';}
   setStatus(`Syncing Calendar for ${account.email||'your connected mailbox'}…`,'loading');
   try{
     const sync=window.onespaceCloud?.syncGoogle;
     if(typeof sync!=='function')throw new Error('Google sync is not loaded. Refresh OneSpace and try again.');
     const result=await sync({mode:'full',accountId:account.id});
     if(!result||result.ok===false)throw new Error('Google Calendar sync was not confirmed.');
     const count=Number(result.counts?.events)||0;
     setStatus(`Calendar sync completed for ${account.email||'your mailbox'} · ${count} event updates.`,'success');
     window.toast?.(`Calendar sync complete · ${count} event updates.`);
   }catch(error){
     setStatus(`Calendar sync failed: ${error?.message||'Unknown error'}`,'error');
     window.toast?.(`Calendar sync failed: ${error?.message||'Unknown error'}`);
   }finally{
     busy=false;
     if(button){button.disabled=false;button.textContent='Sync calendar ↻';}
     renderStatus();
   }
 };
 window.addEventListener('onespace:data-loaded',renderStatus);
 window.addEventListener('onespace:google-sync-complete',renderStatus);
 window.addEventListener('onespace:data-cleared',renderStatus);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderStatus);else renderStatus();
})();
</script>
'''
s=s.replace('</body></html>', calendar_script+'\n</body></html>')
p.write_text(s)
print('updated index.html')
