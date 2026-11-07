/* OneSpace V18.2 task calendar: month-grid planning, pressure summary and editable deadlines. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const fromKey = key => { const m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12) : null; };
  const today = () => keyOf(new Date());
  let view = new Date(); view.setDate(1); view.setHours(12,0,0,0);
  let selected = today();
  let filter = 'date';
  const priority = t => String(t?.priority || 'normal').toLowerCase();
  const priorityWeight = t => ({urgent:4,high:3,normal:2,low:1}[priority(t)] || 2);
  function dueKey(task) {
    const raw = task?.dueAt || task?.due_at || '';
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) return keyOf(d);
    }
    const text = String(task?.due || '').trim();
    if (!text || /no date|no due|no deadline|undated/i.test(text)) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^today$/i.test(text)) return today();
    if (/^tomorrow$/i.test(text)) { const d=new Date(); d.setDate(d.getDate()+1); return keyOf(d); }
    const weekday = text.match(/^(?:due\s+)?(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
    if (weekday) { const names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; const d=new Date(); let delta=(names.indexOf(weekday[1].toLowerCase())-d.getDay()+7)%7; if(!delta)delta=7;d.setDate(d.getDate()+delta);return keyOf(d); }
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime()) && /\b20\d{2}\b/.test(text)) return keyOf(parsed);
    const short = new Date(`${text} ${new Date().getFullYear()} 12:00:00`);
    if (!Number.isNaN(short.getTime())) return keyOf(short);
    return null;
  }
  const isAries = t => !!(t && (t.ariesAdded || t.source === 'aries-mail' || /^Created from email:/i.test(String(t.description || ''))));
  const ago = ms => { if (!ms) return 'not yet'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  function renderStrip() {
    const anchor = $('ariesTaskCalendarSummary'); if (!anchor) return;
    let strip = $('ariesAutoScanStrip');
    if (!strip) { strip = document.createElement('div'); strip.id = 'ariesAutoScanStrip'; strip.className = 'aries-autoscan-strip'; anchor.before(strip); }
    const st = window.AriesSmart?.stats || { checked: 0, added: 0, lastScanAt: 0 };
    const on = $('ariesAutoScanInbox') ? $('ariesAutoScanInbox').checked : true;
    const addedNow = (typeof tasks !== 'undefined' ? tasks : []).filter(t => !t.done && isAries(t)).length;
    strip.innerHTML = `<div class="aries-autoscan-copy"><strong>Aries auto-scan ${on ? 'is on' : 'is off'}</strong><span>${on ? `Reads new mail for tasks and deadlines and adds clear ones here. Last scan ${ago(st.lastScanAt)}.` : 'Turn on to let Aries add tasks and deadlines from new mail.'}</span></div><div class="aries-autoscan-stats"><span><b>${addedNow}</b> from email</span><span><b>${st.checked || 0}</b> emails read</span></div><div class="aries-autoscan-actions"><button type="button" class="textbtn" data-autoscan-scan>Scan now</button><button type="button" class="textbtn" data-autoscan-toggle>${on ? 'Pause' : 'Turn on'}</button></div>`;
    strip.querySelector('[data-autoscan-scan]').onclick = e => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Scanning…'; Promise.resolve(window.rescanAriesMail?.()?.done).finally(() => { b.disabled = false; b.textContent = 'Scan now'; render(); window.toast?.('Aries finished scanning your inbox.'); }); };
    strip.querySelector('[data-autoscan-toggle]').onclick = () => { const cb = $('ariesAutoScanInbox'); if (cb) cb.click(); setTimeout(renderStrip, 60); };
  }
  function openTasks() {
    return (typeof tasks !== 'undefined' && Array.isArray(tasks) ? tasks : [])
      .filter(t => !t.done && !['completed','cancelled'].includes(String(t.status||'').toLowerCase()));
  }
  function dayDelta(key) { const d=fromKey(key),t=fromKey(today()); return d ? Math.round((d-t)/86400000) : null; }
  function pressure(rows) {
    return rows.reduce((s,t)=>s+priorityWeight(t),0) + Math.max(0,rows.length-1)*0.7;
  }
  function intensity(score) { return score >= 12 ? 3 : score >= 7 ? 2 : score >= 3 ? 1 : 0; }
  function sorted(rows) { return [...rows].sort((a,b)=>priorityWeight(b)-priorityWeight(a) || (dueKey(a)||'9999').localeCompare(dueKey(b)||'9999') || String(a.title).localeCompare(String(b.title))); }
  function listForCurrentFilter(all) {
    if (filter === 'overdue') return all.filter(t=>dayDelta(dueKey(t)) < 0);
    if (filter === 'pressure') return all.filter(t=>priorityWeight(t)>=3 || (dueKey(t) && dayDelta(dueKey(t))<=2));
    if (filter === 'undated') return all.filter(t=>!dueKey(t));
    if (filter === 'month') return all.filter(t=>dueKey(t)?.slice(0,7)===keyOf(view).slice(0,7));
    return all.filter(t=>dueKey(t)===selected);
  }
  function renderSummary(all) {
    const host=$('ariesTaskCalendarSummary'); if(!host)return;
    const monthKey=keyOf(view).slice(0,7);
    const month=all.filter(t=>dueKey(t)?.slice(0,7)===monthKey);
    const overdue=all.filter(t=>dayDelta(dueKey(t))<0);
    const pressureRows=all.filter(t=>priorityWeight(t)>=3 || (dueKey(t)&&dayDelta(dueKey(t))<=2));
    const undated=all.filter(t=>!dueKey(t));
    const cards=[
      ['month',month.length,'Due this month',''],
      ['overdue',overdue.length,'Overdue','summary-overdue'],
      ['pressure',pressureRows.length,'High priority / near due','summary-pressure'],
      ['undated',undated.length,'No deadline','']
    ];
    host.innerHTML=cards.map(([id,count,label,cls])=>`<button type="button" class="${cls}" data-task-calendar-filter="${id}" aria-pressed="${filter===id}"><strong>${count}</strong><small>${label}</small></button>`).join('');
    host.querySelectorAll('[data-task-calendar-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.taskCalendarFilter;render();}));
  }
  function renderGrid(all) {
    const host=$('ariesTaskCalendarGrid'); if(!host)return;
    const monthStart=new Date(view.getFullYear(),view.getMonth(),1,12);
    const offset=(monthStart.getDay()+6)%7;
    const gridStart=new Date(monthStart);gridStart.setDate(monthStart.getDate()-offset);
    const cells=[];
    for(let i=0;i<42;i++){
      const day=new Date(gridStart);day.setDate(gridStart.getDate()+i);const key=keyOf(day);
      const rows=sorted(all.filter(t=>dueKey(t)===key));
      const heat=intensity(pressure(rows));
      const chips=rows.slice(0,2).map(t=>`<span class="aries-task-day-chip p-${esc(priority(t))}${isAries(t)?' is-aries':''}" title="${esc(t.title)}">${esc(t.title||'Untitled task')}</span>`).join('');
      const more=rows.length>2?`<span class="aries-task-more">+${rows.length-2} more</span>`:'';
      const classes=['aries-task-day-cell',day.getMonth()!==view.getMonth()?'is-outside':'',key===today()?'is-today':'',key===selected&&filter==='date'?'is-selected':'',heat?`aries-task-cell-pressure-${heat}`:''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${classes}" data-task-calendar-date="${key}" aria-label="${day.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}, ${rows.length} open tasks"><span class="aries-task-day-number"><strong>${day.getDate()}</strong><small>${rows.length?`${rows.length} task${rows.length===1?'':'s'}`:' '}</small></span>${chips}${more}</button>`);
    }
    host.innerHTML=cells.join('');
    host.querySelectorAll('[data-task-calendar-date]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.taskCalendarDate;filter='date';if(!selected.startsWith(keyOf(view).slice(0,7))){const d=fromKey(selected);if(d)view=new Date(d.getFullYear(),d.getMonth(),1,12);}render();}));
  }
  function renderDetails(all) {
    const title=$('ariesTaskSelectedDate'),summary=$('ariesTaskSelectedSummary'),host=$('ariesTaskSelectedList'); if(!host)return;
    let rows=listForCurrentFilter(all);
    if(filter==='date'){
      const d=fromKey(selected);
      if(title)title.textContent=d?.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})||'Selected date';
      if(summary)summary.textContent=`${rows.length} open task${rows.length===1?'':'s'} due on this date`;
    } else {
      const labels={month:'Tasks due this month',overdue:'Overdue tasks',pressure:'High-priority or near-deadline tasks',undated:'Tasks without a deadline'};
      if(title)title.textContent=labels[filter]||'Upcoming tasks';
      if(summary)summary.textContent=`${rows.length} matching open task${rows.length===1?'':'s'} · sorted by priority`;
    }
    rows=sorted(rows);
    if(!rows.length){host.innerHTML=`<div class="aries-task-calendar-empty">${filter==='date'?'Nothing is due on this date.':'No tasks match this view.'}<br>Ask Aries to capture a task or add one from My Tasks.</div>`;return;}
    host.innerHTML=rows.slice(0,18).map(t=>{
      const id=esc(t.id),key=dueKey(t)||'',p=priority(t),label=key?fromKey(key)?.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'No deadline',sourceMailId=t.sourceMailInternalId||t.sourceMailId||'',sourceAccountId=t.sourceMailAccountId||'';
      return `<article class="aries-task-detail" data-task-detail="${id}"><div class="aries-task-detail-top"><strong class="aries-task-detail-title">${esc(t.title||'Untitled task')}</strong><span class="aries-task-priority-badge p-${esc(p)}">${esc(p)}</span></div><div class="aries-task-detail-meta"><span>${esc(label)}</span><span>·</span><span>${esc(t.status||'open')}</span>${isAries(t)?`<span class="aries-from-mail" title="${esc(t.sourceMailSubject||t.sourceSubject||'Added by Aries from your inbox')}">✦ Added by Aries from email</span>`:''}</div>${sourceMailId?`<div class="aries-workday-source"><div class="aries-workday-source-copy"><strong>${esc(t.sourceMailSubject||t.sourceSubject||'Original email')}</strong><small>From ${esc(t.sourceMailSender||t.sourceSender||'Unknown sender')} · ${esc(t.sourceMailAccountEmail||'Connected mailbox')}</small></div><button type="button" data-open-task-mail data-source-mail-id="${esc(sourceMailId)}" data-source-account-id="${esc(sourceAccountId)}">View email ↗</button></div>`:''}<div class="aries-task-detail-controls"><input type="date" data-task-deadline value="${key}" aria-label="Change deadline for ${esc(t.title)}"><select data-task-priority aria-label="Change priority for ${esc(t.title)}"><option value="low" ${p==='low'?'selected':''}>Low</option><option value="normal" ${p==='normal'?'selected':''}>Normal</option><option value="high" ${p==='high'?'selected':''}>High</option><option value="urgent" ${p==='urgent'?'selected':''}>Urgent</option></select><button type="button" data-task-save-deadline>Save task changes</button>${isAries(t)?'<button type="button" class="aries-not-task" data-task-not-task>Not a task</button>':''}</div></article>`;
    }).join('');
    host.querySelectorAll('[data-task-detail]').forEach(card=>{
      const id=card.dataset.taskDetail;
      card.querySelector('[data-task-save-deadline]')?.addEventListener('click',async()=>{
        const date=card.querySelector('[data-task-deadline]')?.value||'';
        const select=card.querySelector('[data-task-priority]');
        let ok=true;
        if(date)ok=await (window.changeTaskDeadline?.(id,date))!==false;
        else if(dueKey((typeof tasks!=='undefined'?tasks:[]).find(t=>String(t.id)===String(id))||{})!==null){ok=await (window.changeTaskDeadline?.(id,''))!==false;}
        const liveTask=(typeof tasks!=='undefined'?tasks:[]).find(t=>String(t.id)===String(id));
        if(select&&liveTask&&priority(liveTask)!==select.value){const changed=await (window.changeTaskPriority?.(id,select.value));if(changed===false)ok=false;}
        if(ok){render();}
      });
      card.querySelector('[data-task-not-task]')?.addEventListener('click',()=>{window.ariesRejectAutoTask?.(id);window.deleteTask?.(id);render();});
      card.querySelector('[data-task-priority]')?.addEventListener('change',async e=>{
        const result=await window.changeTaskPriority?.(id,e.target.value);if(result!==false)render();
      });
    });
  }
  function render() {
    const month=$('ariesTaskCalendarMonth');if(!month)return;
    month.textContent=view.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const all=openTasks();
    renderStrip();renderSummary(all);renderGrid(all);renderDetails(all);
  }
  window.shiftAriesTaskCalendar=delta=>{view.setMonth(view.getMonth()+Number(delta||0));selected=keyOf(view);filter='date';render();};
  window.goAriesTaskCalendarToday=()=>{const d=new Date();view=new Date(d.getFullYear(),d.getMonth(),1,12);selected=today();filter='date';render();};
  window.filterAriesTaskCalendar=key=>{filter=key==='all'?'month':key;render();};
  // Compatibility aliases for older Aries code paths that request a heatmap refresh.
  window.renderAriesTaskCalendar=render;
  window.renderAriesTaskHeatmap=render;
  window.filterAriesHeatmapDate=key=>{if(key==='all')filter='month';else if(['overdue','pressure','undated'].includes(key))filter=key;else{selected=key;filter='date';}render();};
  ['renderTasks','refreshOverview','renderOverviewKPIs'].forEach(name=>{
    const fn=window[name];if(typeof fn==='function'&&!fn.__ariesV182CalendarWrapped){
      const wrapped=function(){const result=fn.apply(this,arguments);render();return result;};wrapped.__ariesV182CalendarWrapped=true;window[name]=wrapped;
    }
  });
  window.addEventListener('onespace:data-loaded',render);
  window.addEventListener('aries:scan-updated',render);
  window.addEventListener('aries:tasks-auto-added',render);
  document.addEventListener('DOMContentLoaded',render);
  setTimeout(render,250);setTimeout(render,1100);
})();
