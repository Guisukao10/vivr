/* ── Vivr — Service Worker ── */
var CACHE = 'vivr-v7';

var SHELL = [
  '/vivr/',
  '/vivr/index.html',
  '/vivr/manifest.json',
  '/vivr/assets/shared.css',
  '/vivr/assets/supabase.js',
  '/vivr/assets/icons/icon.svg',
  '/vivr/app/financeiro/',
  '/vivr/app/financeiro/index.html',
  '/vivr/app/financeiro/planejador.html',
  '/vivr/app/financeiro/analise.js',
  '/vivr/app/financeiro/planejador.js',
  '/vivr/app/financeiro/sync.js',
  '/vivr/app/financeiro/storage.js',
  '/vivr/app/financeiro/utils.js',
  '/vivr/app/financeiro/ui.js',
  '/vivr/app/financeiro/style.css',
  '/vivr/app/financeiro/site-controle.css'
];

/* ── Install: cache app shell ── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(SHELL);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ── Activate: clear old caches ── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── Fetch: stale-while-revalidate para o shell, sempre rede para a API ── */
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Supabase: sempre rede (dados em tempo real)
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Google Fonts & CDN: cache, atualiza em segundo plano
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('cdnjs.cloudflare.com')) {
    e.respondWith(
      caches.open(CACHE + '-cdn').then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var net = fetch(e.request).then(function(res) {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          });
          return cached || net;
        });
      })
    );
    return;
  }

  // App shell: rede primeiro, cache só quando offline.
  // (Stale-while-revalidate deixava o usuário eternamente uma versão atrás:
  // servia o cache velho e só atualizava por trás — a atualização aparecia
  // apenas no SEGUNDO acesso. Aqui a versão nova chega na hora e o cache
  // vira rede de segurança pra quando não houver internet.)
  e.respondWith(
    caches.open(CACHE).then(function(cache) {
      return fetch(e.request).then(function(res) {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(function() {
        return cache.match(e.request);
      });
    })
  );
});
