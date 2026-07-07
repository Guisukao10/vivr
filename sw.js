/* ── Vivr — Service Worker ── */
var CACHE = 'vivr-v1';

var SHELL = [
  '/vivr/',
  '/vivr/index.html',
  '/vivr/manifest.json',
  '/vivr/assets/shared.css',
  '/vivr/assets/supabase.js',
  '/vivr/assets/icons/icon.svg',
  '/vivr/auth/login.html',
  '/vivr/auth/register.html',
  '/vivr/app/index.html',
  '/vivr/app/financeiro/',
  '/vivr/app/financeiro/index.html',
  '/vivr/app/financeiro/lancamentos.html',
  '/vivr/app/financeiro/cadastros.html',
  '/vivr/app/financeiro/planejador.html',
  '/vivr/app/financeiro/analise.js',
  '/vivr/app/financeiro/lancamentos.js',
  '/vivr/app/financeiro/cadastros.js',
  '/vivr/app/financeiro/planejador.js',
  '/vivr/app/financeiro/storage.js',
  '/vivr/app/financeiro/utils.js',
  '/vivr/app/financeiro/ui.js',
  '/vivr/app/financeiro/style.css',
  '/vivr/app/financeiro/site-controle.css',
  '/vivr/app/metas/',
  '/vivr/app/metas/index.html',
  '/vivr/app/metas/app.js',
  '/vivr/app/metas/style.css',
  '/vivr/app/habitos/',
  '/vivr/app/habitos/index.html',
  '/vivr/app/habitos/app.js',
  '/vivr/app/habitos/style.css',
  '/vivr/app/nutricao/',
  '/vivr/app/nutricao/index.html',
  '/vivr/app/nutricao/app.js',
  '/vivr/app/nutricao/style.css',
  '/vivr/app/saude/',
  '/vivr/app/saude/index.html',
  '/vivr/app/saude/app.js',
  '/vivr/app/saude/style.css'
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

  // App shell: stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(function(cache) {
      return cache.match(e.request).then(function(cached) {
        var net = fetch(e.request).then(function(res) {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(function() { return cached; });
        return cached || net;
      });
    })
  );
});
