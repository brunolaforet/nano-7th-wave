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
const CACHE_NAME = '7th Wave — V2026.07.5'; // remise photo bg 25.4 Ko seulement

const APP_SHELL = [
  './',
  './index.html', // ⚠️ à adapter si le fichier déployé porte un autre nom
  './manifest.json',
  './7th.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './bg-7thwave.avif',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        // Mise en cache fichier par fichier plutôt que cache.addAll() : addAll() est
        // atomique — un seul 404 (casse de nom incorrecte, fichier renommé/oublié —
        // GitHub Pages est sensible à la casse) fait rejeter TOUT le lot d'un coup.
        // Avant, ce rejet court-circuitait le .then(() => self.skipWaiting()) suivant
        // sans jamais le relancer : le SW s'installait "avec succès" du point de vue du
        // navigateur, mais restait bloqué en attente indéfiniment — aucune mise à jour
        // ne prenait jamais la main, et le cache app shell restait vide. Ici, chaque
        // fichier a son propre filet : un échec isolé est journalisé mais n'empêche ni
        // la mise en cache des autres fichiers, ni skipWaiting() de s'exécuter.
        APP_SHELL.map((url) => cache.add(url).catch((err) => {
          console.warn(`7thWave SW : fichier non mis en cache (${url})`, err);
        }))
      ))
      .then(() => self.skipWaiting())
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
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => {
        // Hors-ligne (ou réseau qui échoue) et rien en cache : pour une navigation, on
        // retombe sur l'app shell (index.html) au lieu de laisser le navigateur afficher
        // sa page d'erreur générique — cohérent avec l'objectif de lancement offline
        // depuis l'écran d'accueil énoncé en tête de fichier. Pour une sous-ressource
        // (image, script) sans équivalent offline pertinent, on laisse l'échec remonter
        // normalement plutôt que de retourner un faux positif.
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
