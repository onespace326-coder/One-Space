/* Aries private per-user learning. Memory is opt-in, stored under the signed-in Supabase user, and never sent to a paid AI provider. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const PROFILE_KEY = 'onespaceAriesProfileV1';
  const MEMORY_KEY = 'onespaceAriesJournalV1';
  let userScope = 'local';
  let loadGeneration = 0;
  let profile = { preferred_name:'', role_context:'', preferred_language:'auto', response_style:'natural', about_user:'', goals:'', interests:'', memory_enabled:false, workspace_context_enabled:true };
  let memories = [];
  const fields = {preferred_name:'ariesProfileName',role_context:'ariesProfileRole',preferred_language:'ariesProfileLanguage',response_style:'ariesProfileStyle',about_user:'ariesProfileAbout',goals:'ariesProfileGoals',interests:'ariesProfileInterests'};
  const localKey = key => `${key}:${userScope}`;
  function localRead(key, fallback){ try { const value=JSON.parse(localStorage.getItem(localKey(key))||'null'); return value??fallback; } catch(_) { return fallback; } }
  function localWrite(key, value){ try { localStorage.setItem(localKey(key),JSON.stringify(value)); return true; } catch(_) { return false; } }
  function status(message, good=false){ const el=$('ariesProfileStatus'); if(el){el.textContent=message;el.style.color=good?'var(--success)':'var(--muted)';} }
  function readForm(){
    const next={}; Object.entries(fields).forEach(([key,id])=>next[key]=String($(id)?.value||'').trim());
    next.memory_enabled=!!$('ariesMemoryEnabled')?.checked;
    next.workspace_context_enabled=$('ariesWorkspaceContextEnabled')?.checked!==false;
    return next;
  }
  function fillForm(){
    Object.entries(fields).forEach(([key,id])=>{const el=$(id);if(el)el.value=profile[key]||'';});
    if($('ariesMemoryEnabled'))$('ariesMemoryEnabled').checked=!!profile.memory_enabled;
    if($('ariesWorkspaceContextEnabled'))$('ariesWorkspaceContextEnabled').checked=profile.workspace_context_enabled!==false;
    status(profile.preferred_name?'Personal setup loaded':'Not configured',!!profile.preferred_name);
  }
  function renderMemories(){
    const host=$('ariesMemoryList'); if(!host)return;
    host.innerHTML=memories.slice(0,5).map(m=>`<article class="aries-memory-item"><div class="aries-memory-item-head"><strong>${esc(m.title||'Daily note')} · ${esc(m.entry_date||'')}</strong><button type="button" class="softbtn" data-aries-memory-delete="${esc(m.id||'')}" aria-label="Delete saved journal entry">Delete</button></div><div>${esc(String(m.content||'').slice(0,260))}${String(m.content||'').length>260?'…':''}</div></article>`).join('')||'<div class="aries-memory-item">No saved day notes yet. Tell Aries about your day and save a note here.</div>';
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function load(){
    const generation=++loadGeneration, scopeAtStart=userScope;
    profile=localRead(PROFILE_KEY,profile); memories=localRead(MEMORY_KEY,[]); fillForm(); renderMemories();
    if(window.onespaceCloud?.loadAriesPersonalization){
      try{
        const result=await window.onespaceCloud.loadAriesPersonalization();
        if(generation!==loadGeneration||scopeAtStart!==userScope)return;
        if(result?.profile)profile={...profile,...result.profile};if(Array.isArray(result?.memories))memories=result.memories;localWrite(PROFILE_KEY,profile);localWrite(MEMORY_KEY,memories);fillForm();renderMemories();if(result?.userId)status(profile.preferred_name?'Synced to your account':'Profile ready · cloud connected',true);
      }
      catch(error){if(generation===loadGeneration&&scopeAtStart===userScope){console.warn('Aries profile cloud load:',error);status('Local profile · cloud sync needs setup');}}
    }
    if(generation===loadGeneration&&scopeAtStart===userScope)window.ariesPersonalProfile=profile;
  }
  async function saveProfile(){
    const next=readForm();profile={...profile,...next};localWrite(PROFILE_KEY,profile);window.ariesPersonalProfile=profile;status('Saved on this device',true);
    if(window.onespaceCloud?.saveAriesProfile){try{const saved=await window.onespaceCloud.saveAriesProfile(profile);profile={...profile,...saved};localWrite(PROFILE_KEY,profile);window.ariesPersonalProfile=profile;status('Saved to your OneSpace account',true);}
      catch(error){console.error('Aries profile sync:',error);status('Saved locally · cloud save failed');window.toast?.('Profile saved on this device, but cloud sync failed: '+error.message);return;}}
    window.dispatchEvent(new CustomEvent('aries:profile-updated',{detail:{profile}}));window.toast?.('Aries personal setup saved.');
  }
  async function saveJournalText(content, title='Daily journal', entryType='daily_journal', source='user'){
    const clean=String(content||'').trim();
    if(!clean)return false;
    const duplicate=memories.find(m=>String(m.content||'').trim()===clean && m.entry_date===new Date().toLocaleDateString('en-CA'));
    if(duplicate){if($('ariesJournalStatus'))$('ariesJournalStatus').textContent='This note is already saved for today.';return duplicate;}
    const entry={id:'local-'+Date.now(),entry_type:entryType,title,content:clean,entry_date:new Date().toLocaleDateString('en-CA'),created_at:new Date().toISOString(),source};
    memories=[entry,...memories].slice(0,60);localWrite(MEMORY_KEY,memories);renderMemories();
    if($('ariesJournalStatus'))$('ariesJournalStatus').textContent='Saved on this device · enable personal memory to let Aries use it';
    if(window.onespaceCloud?.saveAriesMemoryEntry){
      try{const saved=await window.onespaceCloud.saveAriesMemoryEntry(entry);memories=[saved,...memories.filter(x=>x.id!==entry.id)].slice(0,60);localWrite(MEMORY_KEY,memories);renderMemories();if($('ariesJournalStatus'))$('ariesJournalStatus').textContent='Saved to your OneSpace account';}
      catch(error){console.error('Aries journal sync:',error);if($('ariesJournalStatus'))$('ariesJournalStatus').textContent='Saved locally · cloud sync failed';window.toast?.('Journal saved locally, but cloud sync failed: '+error.message);}
    }
    window.dispatchEvent(new CustomEvent('aries:journal-saved',{detail:{entry}}));
    window.toast?.('Aries saved that to your journal.');
    return entry;
  }
  const sensitiveMemoryPattern=/\b(password|passcode|one.?time password|otp|api key|secret key|recovery code|credit card|debit card|cvv|bank account|account number|aadhaar|pan number|medical diagnosis|medication|sexual orientation|political party|religious belief)\b/i;
  function learningCandidate(message){
    const text=String(message||'').trim();
    if(!text||text.length<10||text.length>1600)return null;
    let match=text.match(/^(?:aries[, ]*)?(?:please )?(?:remember(?: that)?|don't forget that|yaad rakh(?:na|o|iye)?|याद रख(?:ना|ो|िए)?)(?:\s*[:,-]\s*|\s+)(.{8,1200})$/i);
    if(match)return{type:'fact',title:'Remembered detail',content:match[1].trim(),source:'user'};
    const patterns=[
      {re:/\b(?:i prefer|i usually prefer|my preference is|my communication preference is|i like to work|i prefer working|i work best when|i work best in|i want answers|please keep answers|explain things to me)\s+(.{8,700})$/i,type:'preference',title:'Work and answer preference'},
      {re:/\b(?:i like to|i enjoy|i usually|i normally|i always|i tend to|my routine is)\s+(.{10,700})$/i,type:'preference',title:'Personal routine'},
      {re:/\b(?:i do not like|i don't like|i dislike|i avoid)\s+(.{8,700})$/i,type:'preference',title:'Preference to avoid'},
      {re:/\b(?:my goal is|my current goal is|i am working toward|i'm working toward|i want to learn|my long.?term goal is|i am preparing for|i'm preparing for)\s+(.{8,700})$/i,type:'goal',title:'Personal goal'},
      {re:/\b(?:my current project is|i am working on|i'm working on|i am learning|i'm learning|i am studying|i'm studying|i study)\s+(.{8,700})$/i,type:'goal',title:'Current focus'},
      {re:/\b(?:i work as|i am working as|i'm working as|my role is|my job is|my profession is|i am a student of|i'm a student of|i study at|my background is|i have experience in)\s+(.{8,700})$/i,type:'fact',title:'Background detail'},
      {re:/\b(?:i am|i'm) (?:a |an )?((?:student|pgdm student|mba student|finance student|analyst|manager|developer|founder|entrepreneur|professional|consultant|engineer|accountant|designer|teacher|researcher|intern)[^.!?]{0,160})$/i,type:'fact',title:'Role and background'},
      {re:/\b(?:i am interested in|i'm interested in|my interests include)\s+(.{8,700})$/i,type:'fact',title:'Interests'},
      {re:/\b(?:please call me|call me|my preferred name is)\s+([A-Za-z][A-Za-z .'-]{1,70})$/i,type:'fact',title:'Preferred name'}
    ];
    for(const item of patterns){match=text.match(item.re);if(match)return{type:item.type,title:item.title,content:match[1].trim(),source:'assistant_suggestion'};}
    return null;
  }
  async function saveLearnedMemory(candidate){
    if(!candidate||!profile.memory_enabled)return false;
    const content=String(candidate.content||'').trim().slice(0,1200);
    if(content.length<8||sensitiveMemoryPattern.test(content))return false;
    if(/(?:\b\d{12}\b|\b\d{16}\b|\b\d{3,4}\s*[- ]?\d{3,4}\b)/.test(content))return false;
    const duplicate=memories.some(m=>String(m.content||'').trim().toLowerCase()===content.toLowerCase());
    if(duplicate)return false;
    const entry={id:'local-'+Date.now(),entry_type:candidate.type||'fact',title:String(candidate.title||'Learned detail').slice(0,120),content,entry_date:new Date().toLocaleDateString('en-CA'),created_at:new Date().toISOString(),source:candidate.source||'assistant_suggestion'};
    memories=[entry,...memories].slice(0,100);localWrite(MEMORY_KEY,memories);renderMemories();
    if(window.onespaceCloud?.saveAriesMemoryEntry){
      try{const saved=await window.onespaceCloud.saveAriesMemoryEntry(entry);memories=[saved,...memories.filter(x=>x.id!==entry.id)].slice(0,100);localWrite(MEMORY_KEY,memories);renderMemories();}
      catch(error){console.warn('Aries memory cloud save:',error);if($('ariesJournalStatus'))$('ariesJournalStatus').textContent='Learning note saved locally only · cloud sync failed';}
    }
    window.dispatchEvent(new CustomEvent('aries:memory-learned',{detail:{entry}}));
    return true;
  }
  async function clearAllMemories(){
    if(!memories.length)return;
    if(!window.confirm('Delete every saved Aries memory and journal entry for this account? This cannot be undone.'))return;
    const cloudIds=memories.filter(m=>!String(m.id||'').startsWith('local-')).map(m=>m.id);
    try{
      if(cloudIds.length&&window.onespaceCloud?.deleteAriesMemoryEntries)await window.onespaceCloud.deleteAriesMemoryEntries(cloudIds);
      else if(cloudIds.length&&window.onespaceCloud?.deleteAriesMemoryEntry)for(const id of cloudIds)await window.onespaceCloud.deleteAriesMemoryEntry(id);
      memories=[];localWrite(MEMORY_KEY,memories);renderMemories();if($('ariesJournalStatus'))$('ariesJournalStatus').textContent='All saved memories deleted';window.toast?.('All saved Aries memories deleted.');
    }catch(error){window.toast?.('Could not clear every cloud memory: '+(error.message||'Please try again.'));}
  }
  window.saveAriesLearnedMemory=saveLearnedMemory;
  window.clearAriesMemories=clearAllMemories;
  async function saveJournal(){
    const input=$('ariesJournalInput');const content=String(input?.value||'').trim();
    if(!content)return window.toast?.('Write or dictate a few lines about your day first.');
    const saved=await saveJournalText(content);
    if(saved&&input)input.value='';
  }
  window.saveAriesJournalText=saveJournalText;
  async function deleteMemory(id){
    const entry=memories.find(m=>String(m.id)===String(id));if(!entry)return;
    if(!window.confirm('Delete this saved Aries journal entry?'))return;
    try{
      if(!String(id).startsWith('local-')&&window.onespaceCloud?.deleteAriesMemoryEntry)await window.onespaceCloud.deleteAriesMemoryEntry(id);
      memories=memories.filter(m=>String(m.id)!==String(id));localWrite(MEMORY_KEY,memories);renderMemories();
      if($('ariesJournalStatus'))$('ariesJournalStatus').textContent='Journal entry deleted';
      window.toast?.('Saved journal entry deleted.');
    }catch(error){window.toast?.('Could not delete the cloud journal entry: '+(error.message||'Please try again.'));}
  }
  let lastUserMessage='';
  window.saveLastAriesMessageToJournal=()=>{
    if(!lastUserMessage)return window.toast?.('Tell Aries about your day first, then choose Save last message.');
    return saveJournalText(lastUserMessage,'Saved from Aries conversation');
  };
  const priorSendMessage=window.sendAssistantMessage;
  if(typeof priorSendMessage==='function')window.sendAssistantMessage=async function(raw){
    const message=String(raw||'').trim();lastUserMessage=message;
    const candidate=learningCandidate(message);
    if(candidate){
      if(profile.memory_enabled)await saveLearnedMemory(candidate).catch(error=>console.warn('Aries learning:',error));
      else if(/^(?:aries[, ]*)?(?:please )?(?:remember|don't forget|yaad rakh|याद रख)/i.test(message))window.toast?.('Turn on “Let Aries learn from our conversations” in Settings to save this detail.');
    }
    return await priorSendMessage.apply(this,arguments);
  };
  window.getAriesPersonalContext=function(){
    if(!profile.memory_enabled)return{profile:null,memories:[]};
    return {profile:{preferred_name:profile.preferred_name,role_context:profile.role_context,preferred_language:profile.preferred_language,response_style:profile.response_style,about_user:profile.about_user,goals:profile.goals,interests:profile.interests},memories:memories.slice(0,30).map(m=>({entry_type:m.entry_type,entry_date:m.entry_date,title:m.title,content:String(m.content||'').slice(0,850)}))};
  };
  window.getAriesPersonalProfile=()=>({...profile});
  $('ariesSaveProfile')?.addEventListener('click',saveProfile);
  $('ariesClearMemories')?.addEventListener('click',clearAllMemories);
  $('ariesSaveJournal')?.addEventListener('click',saveJournal);
  $('ariesMemoryList')?.addEventListener('click',event=>{const button=event.target.closest('[data-aries-memory-delete]');if(button)deleteMemory(button.dataset.ariesMemoryDelete);});
  window.addEventListener('onespace:data-loaded',event=>{const next=event.detail?.userId||'local';if(next!==userScope){userScope=next;profile={preferred_name:'',role_context:'',preferred_language:'auto',response_style:'natural',about_user:'',goals:'',interests:'',memory_enabled:false,workspace_context_enabled:true};memories=[];load();}});
  window.addEventListener('onespace:signed-out',()=>{loadGeneration++;userScope='signed-out';profile={preferred_name:'',role_context:'',preferred_language:'auto',response_style:'natural',about_user:'',goals:'',interests:'',memory_enabled:false,workspace_context_enabled:true};memories=[];fillForm();renderMemories();window.ariesPersonalProfile=profile;});
  $('ariesAiEnabled')?.addEventListener('change',e=>{if(e.target.checked&&!profile.memory_enabled)window.toast?.('Enable Remember my personal context separately if you want Aries to use your profile or journal.');});
  load();
})();
