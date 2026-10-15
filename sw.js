const CACHE='dehaze-media-lab-v3.1.0';
const ASSETS=['./','./index.html','./src/styles.css','./src/app.js','./src/auto3.js','./src/gl.js','./src/shaders/dehaze-webgl.frag','./assets/icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
