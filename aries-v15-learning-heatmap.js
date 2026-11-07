/* Aries V17: per-account learning support + workload heatmap. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selectedDate = 'all';
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const atNoon = key => new Date(`${key}T12:00:00`);
  const todayKey = () => ymd(new Date());
  function dueDate(task){
    if(task?.dueAt){const d=new Date(task.dueAt);if(!Number.isNaN(d.getTime()))return ymd(d);}
    const raw=String(task?.due||'').trim();
    if(!raw||/no date|no deadline|undated/i.test(raw))return null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
    if(/^today$/i.test(raw))return todayKey();
    if(/^tomorrow$/i.test(raw)){const d=new Date();d.setDate(d.getDate()+1);return ymd(d);}
    const parsed=new Date(raw);
    if(!Number.isNaN(parsed.getTime())){
      if(!/\b20\d{2}\b/.test(raw))parsed.setFullYear(new Date().getFullYear());
      return ymd(parsed);
    }
    const md=raw.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
    if(md){const parsedMonth=new Date(`${md[1]} ${md[2]}, ${new Date().getFullYear()} 12:00:00`);if(!Number.isNaN(parsedMonth.getTime()))return ymd(parsedMonth);}
    return null;
  }
  function dayDiff(key){if(!key)return null;const a=atNoon(todayKey()),b=atNoon(key);return Math.round((b-a)/86400000);}
  function priorityBase(task){const p=String(task?.priority||'normal').toLowerCase();return p==='urgent'?5.6:p==='high'?4.2:p==='low'?1.4:2.8;}
  function score(task){const base=priorityBase(task),days=dayDiff(dueDate(task));const pressure=days===null?0:days<0?4.5:days===0?3.5:days===1?3:days<=3?2.2:days<=7?1.3:.2;return base+pressure;}
  function level(value){return value>=14?3:value>=8?2:value>=4?1:0;}
  function priorityText(task){const p=String(task.priority||'Normal');return p.charAt(0).toUpperCase()+p.slice(1).toLowerCase();}
  function dueText(task){const key=dueDate(task),days=dayDiff(key);if(days===null)return 'No deadline';if(days<0)return `${Math.abs(days)}d overdue`;if(days===0)return 'Due today';if(days===1)return 'Due tomorrow';return `Due ${atNoon(key).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`;}
  function openTasks(){return (typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks:[]).filter(t=>!t.done&&t.status!=='completed'&&t.status!=='cancelled');}
  function renderFocus(items,title,note){
    const host=$('ariesHeatmapFocusList');if(!host)return;
    $('ariesHeatmapFocusTitle').textContent=title;$('ariesHeatmapFocusNote').textContent=note;$('ariesHeatmapSelectedCount').textContent=`${items.length} task${items.length===1?'':'s'}`;
    host.innerHTML=items.length?items.slice(0,5).map(t=>{const id=esc(t.id),date=dueDate(t)||'',priority=String(t.priority||'normal').toLowerCase();return `<article class="aries-heat-task"><span class="aries-heat-priority p-${esc(priority)}">${esc(priorityText(t))}</span><div class="aries-heat-task-copy"><strong>${esc(t.title||'Untitled task')}</strong><small>${esc(dueText(t))}</small></div><div class="aries-heat-task-actions"><input type="date" value="${date}" aria-label="Change deadline for ${esc(t.title)}" id="heat-date-${id}"><button type="button" onclick="changeTaskDeadline('${id}',document.getElementById('heat-date-${id}').value)">Change date</button><select aria-label="Change task priority" onchange="changeTaskPriority('${id}',this.value)"><option value="low" ${priority==='low'?'selected':''}>Low</option><option value="normal" ${priority==='normal'?'selected':''}>Normal</option><option value="high" ${priority==='high'?'selected':''}>High</option><option value="urgent" ${priority==='urgent'?'selected':''}>Urgent</option></select><button type="button" onclick="showPage('tasks')">Open</button></div></article>`}).join(''):'<div class="aries-heat-empty">No open tasks for this date. Your schedule has some breathing room.</div>';
  }
  function render(){
    const grid=$('ariesHeatmapGrid');if(!grid)return;
    const all=openTasks(),today=todayKey(),start=atNoon(today);if(!selectedDate)selectedDate=today;
    const overdue=all.filter(t=>{const d=dayDiff(dueDate(t));return d!==null&&d<0;});
    const noDate=all.filter(t=>!dueDate(t));
    const critical=all.filter(t=>score(t)>=7).length;
    const summary=$('ariesHeatmapSummary');if(summary)summary.innerHTML=`<button type="button" class="heat-summary-card" aria-pressed="${selectedDate==='all'}" onclick="filterAriesHeatmapDate('all')"><strong>${all.length}</strong><small>Open tasks</small></button><button type="button" class="heat-summary-card warn" aria-pressed="${selectedDate==='overdue'}" onclick="filterAriesHeatmapDate('overdue')"><strong>${overdue.length}</strong><small>Overdue</small></button><button type="button" class="heat-summary-card hot" aria-pressed="${selectedDate==='pressure'}" onclick="filterAriesHeatmapDate('pressure')"><strong>${critical}</strong><small>High pressure</small></button><button type="button" class="heat-summary-card" aria-pressed="${selectedDate==='undated'}" onclick="filterAriesHeatmapDate('undated')"><strong>${noDate.length}</strong><small>No deadline</small></button>`;
    const cells=[];
    for(let i=0;i<14;i++){
      const d=new Date(start);d.setDate(start.getDate()+i);const key=ymd(d);
      const dayTasks=all.filter(t=>dueDate(t)===key).sort((a,b)=>score(b)-score(a));
      const pressure=dayTasks.reduce((sum,t)=>sum+score(t),0)+Math.max(0,dayTasks.length-1)*1.25;const intensity=dayTasks.length?level(pressure):0;
      const detail=dayTasks.map(t=>t.title).slice(0,4).join(' · ');
      cells.push(`<button type="button" class="aries-heat-day heat-${intensity} ${key===selectedDate?'selected':''} ${key===today?'today':''}" data-heat-date="${key}" title="${esc(detail||'No tasks due')}" aria-label="${d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}: ${dayTasks.length} task(s)" onclick="filterAriesHeatmapDate('${key}')"><span>${d.toLocaleDateString(undefined,{weekday:'short'})}</span><strong>${d.getDate()}</strong><small>${dayTasks.length?`${dayTasks.length} task${dayTasks.length===1?'':'s'}`:'Clear'}</small></button>`);
    }
    grid.innerHTML=cells.join('');
    const selected=selectedDate;
    if(selected==='undated')renderFocus([...noDate].sort((a,b)=>score(b)-score(a)),'Tasks without deadlines','Add dates to make workload pressure clearer');
    else if(selected==='overdue')renderFocus([...overdue].sort((a,b)=>score(b)-score(a)),'Overdue tasks','Past deadline · review or reschedule');
    else if(selected==='all')renderFocus([...all].sort((a,b)=>score(b)-score(a)),'Top priorities','Ranked by importance and deadline');
    else if(selected==='pressure')renderFocus([...all].filter(t=>score(t)>=7).sort((a,b)=>score(b)-score(a)),'High-pressure tasks','High task priority or a deadline that is approaching');
    else {
      const dayItems=all.filter(t=>dueDate(t)===selected).sort((a,b)=>score(b)-score(a));
      renderFocus(dayItems,selected===today?'Due today':`Due ${atNoon(selected).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}`,'Tasks assigned to the selected date');
    }
    // A compact overflow chip for overdue work is placed before the first date cell.
    const old=$('ariesHeatmapOverdue');if(old)old.remove();
    if(overdue.length){const chip=document.createElement('button');chip.id='ariesHeatmapOverdue';chip.type='button';chip.className='aries-heat-overdue';chip.textContent=`${overdue.length} overdue · Review`;chip.onclick=()=>filterAriesHeatmapDate('overdue');grid.prepend(chip);}
  }
  window.renderAriesTaskHeatmap=render;
  window.filterAriesHeatmapDate=key=>{selectedDate=key;render();};
  // Wrap existing renderers so every create/complete/delete and cloud refresh updates the heatmap.
  ['renderTasks','refreshOverview','renderOverviewKPIs'].forEach(name=>{
    const fn=window[name];if(typeof fn==='function'&&!fn.__ariesV17Wrapped){const wrapped=function(){const result=fn.apply(this,arguments);render();return result;};wrapped.__ariesV17Wrapped=true;window[name]=wrapped;}
  });
  window.addEventListener('onespace:data-loaded',render);
  window.addEventListener('aries:memory-learned',()=>{});
  document.addEventListener('DOMContentLoaded',render);
  setTimeout(render,250);setTimeout(render,1200);
})();
