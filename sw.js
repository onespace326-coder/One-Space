const V="onespace-v37-single-mailbox-1",SHELL=["./","index.html","login-check.html","auth-config.js","integrations-config.js","onespace-supabase-data.js?v=37.0","scheduled-tasks.js","aries-intelligence.js?v=37.0","aries-personalization.js","aries-face-auth.js","aries-v18-task-calendar.js?v=37.0","onespace-v19-executive.js","onespace-v19-executive.css","onespace-v20-premium.css","onespace-v20-live.js","aries-v21-smart.js","aries-v21-wake.js","aries-chrome-audio.js","onespace-v21-glass.css","onespace-v22-overview.css","onespace-v22-mail.js","onespace-v29-premium.css","onespace-v30-premium.css","onespace-v31-theme.css","onespace-v32-data-integrity.css","onespace-v33-task-notifications.css","onespace-v37-single-mailbox.css?v=37.0","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/icon.svg"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>null)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  // Only handle same-origin GETs. Supabase/Google/API calls and OAuth redirects must always hit the network untouched.
  if(r.method!=="GET"||u.origin!==self.location.origin)return;
  if(u.searchParams.has("code")||u.searchParams.has("error")||u.searchParams.has("error_description")||u.searchParams.has("onespace_google")||u.searchParams.has("onespace_google_error"))return;
  e.respondWith(fetch(r).then(res=>{if(res&&res.ok&&res.type==="basic"){const c=res.clone();caches.open(V).then(x=>x.put(r,c)).catch(()=>{});}return res}).catch(()=>caches.match(r).then(m=>m||(r.mode==="navigate"?caches.match("index.html"):Response.error()))));
});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window"}).then(l=>l.length?l[0].focus():clients.openWindow("./")))});
