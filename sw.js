/* 일잡코리아 강원본부 - 앱(PWA) 오프라인 지원
   - 화면(HTML)·설정(js): 항상 최신을 먼저 받고, 인터넷이 끊기면 저장해 둔 것을 보여줌
   - 사진·아이콘: 한 번 받은 것은 저장해 두고 빠르게 보여줌
   - 영상·데이터베이스(Supabase)·외부 글꼴: 저장하지 않고 그대로 통과
   홈페이지를 고친 뒤 사진을 같은 이름으로 바꿨다면 아래 VERSION 날짜를 바꿔 주세요. */
const VERSION = 'iljob-2026-11-09h';
const CORE = [
  './', './index.html', './admin.html', './privacy.html', './gallery.html', './config.js',
  './manifest.webmanifest', './admin.webmanifest',
  './icons/app-192.png', './icons/admin-192.png', './icons/favicon-32.png',
  './images/care-0.jpg', './images/repair-0.jpg', './images/construction-0.jpg',
  './images/cleaning-0.jpg', './images/waste-0.jpg', './images/farm-0.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.all(CORE.map(u => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase·CDN·지도 등은 그대로
  if (/\.mp4$/i.test(url.pathname)) return;                  // 영상은 저장하지 않음

  const isPage = req.mode === 'navigate' || /\.(html|js|webmanifest)$/i.test(url.pathname) || url.pathname.endsWith('/');
  if (isPage) {
    // 최신 우선, 실패하면 저장본
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })
          .then(hit => hit || (req.mode === 'navigate'
            ? caches.match(url.pathname.endsWith('admin.html') ? './admin.html' : './')
            : undefined)))
    );
    return;
  }

  if (/\.(png|jpe?g|webp|svg|ico)$/i.test(url.pathname)) {
    // 저장본 우선
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});
