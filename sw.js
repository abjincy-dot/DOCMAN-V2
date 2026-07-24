const VERSION='2.0.0';
const CACHE=`docman-${VERSION}`;
const CORE=['./','./index.html','./app.js','./style.css','./manifest.json'];

self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener('message',e=>{
 if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET') return;
 const url=new URL(e.request.url);
 if(url.origin!==location.origin) return;
 if(e.request.destination==='document'){
   e.respondWith(fetch(e.request).then(r=>{
      const c=r.clone(); caches.open(CACHE).then(cache=>cache.put(e.request,c));
      return r;
   }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
   return;
 }
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{
    const c=res.clone(); caches.open(CACHE).then(cache=>cache.put(e.request,c));
    return res;
 })));
});
