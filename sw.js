// 7th Wave — Service Worker
//
// Stratégie : cache-first pour l'app shell (HTML, manifest, icônes) afin de permettre le
// lancement offline depuis l'écran d'accueil. Les appels réseau vers les API météo/géocodage
// ne sont PAS interceptés : l'app a déjà son propre cache de prévisions dans localStorage
// (4h de fraîcheur, cf. CACHE_KEY dans le HTML) — le service worker ne doit pas s'en mêler,
// sinon on fige les conditions de surf affichées indéfiniment.
//
// ⚠️ À chaque déploiement qui modifie le HTML/CSS/JS de l'app : incrémenter CACHE_NAME
// ci-dessous, sinon les visiteurs récurrents restent bloqués sur l'ancienne version en cache.
const CACHE_NAME = '7thwave-shell-v1';

const APP_SHELL = [
  './',
  './index.html', // ⚠️ à adapter si le fichier déployé porte un autre nom
  './manifest.json',
  './7th.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // cache.addAll() est atomique : un seul fichier en échec (404, casse de nom
        // incorrecte — GitHub Pages est sensible à la casse) fait échouer tout le lot,
        // sans qu'aucun fichier ne soit mis en cache. Avant, cet échec était totalement
        // invisible ; on le journalise au moins, pour pouvoir le diagnostiquer.
        console.error('7thWave SW : échec de mise en cache de l\'app shell', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne touche jamais aux requêtes vers les API météo/géocodage : toujours le réseau,
  // jamais le cache du service worker (l'app gère déjà sa propre fraîcheur de données).
  const isApiCall = req.url.includes('open-meteo.com') || req.url.includes('nominatim.openstreetmap.org');
  if (req.method !== 'GET' || isApiCall) {
    return; // laisse la requête suivre son cours normalement, sans interception
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
