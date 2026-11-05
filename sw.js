// 오프라인에서도 앱 화면이 열리도록 앱 파일을 보관한다. GitHub API 요청은 건드리지 않는다.
const CACHE = 'my-notes-v12';  // 앱을 고칠 때마다 숫자를 올리면 휴대폰도 새 버전을 받는다
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'dom.js', 'store.js', 'cloud.js', 'firebase-config.js', 'vendor/firebase.js',  'supp.js', 'calendar.js', 'holidays.js', 'vendor/editor.js', 'icon.svg', 'manifest.webmanifest'];
const CDN = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const same = url.origin === location.origin;
  if (!same && !CDN.includes(url.hostname)) return;
  // 네트워크 먼저(최신 앱), 안 되면 보관본
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: same }).then((r) => r || caches.match('index.html'))));
});
