const CACHE_NAME = 'mon-calendrier-v1';
const urlsToCache = [
    '/',
    '/static/index.html',
    '/static/styles.css',
    '/static/app.js',
    '/static/manifest.json'
];

// Installation du service worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache ouvert');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activation du service worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Suppression ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Interception des requêtes
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Retourne la réponse du cache si elle existe
                if (response) {
                    return response;
                }
                
                // Sinon, fait la requête réseau
                return fetch(event.request).then(response => {
                    // Vérifie si on a reçu une réponse valide
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clone la réponse
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
            .catch(() => {
                // Si tout échoue, retourne une page offline basique
                if (event.request.destination === 'document') {
                    return caches.match('/');
                }
            })
    );
});

// Gestion des notifications push
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body,
            icon: '/static/icon-192.png',
            badge: '/static/icon-192.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: data.id
            },
            actions: [
                {
                    action: 'explore',
                    title: 'Voir l\'événement',
                    icon: '/static/icon-192.png'
                },
                {
                    action: 'close',
                    title: 'Fermer',
                    icon: '/static/icon-192.png'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Gestion des clics sur les notifications
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'explore') {
        // Ouvre l'application
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Synchronisation en arrière-plan
self.addEventListener('sync', event => {
    if (event.tag === 'sync-events') {
        event.waitUntil(syncEvents());
    }
});

async function syncEvents() {
    try {
        const token = await getStoredToken();
        if (!token) return;
        
        // Synchroniser les événements en attente
        const pendingEvents = await getPendingEvents();
        
        for (const event of pendingEvents) {
            try {
                await fetch('/api/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(event)
                });
                
                // Marquer comme synchronisé
                await markEventSynced(event.id);
            } catch (error) {
                console.error('Erreur sync événement:', error);
            }
        }
    } catch (error) {
        console.error('Erreur synchronisation:', error);
    }
}

// Fonctions utilitaires pour la synchronisation
async function getStoredToken() {
    // Implémentation pour récupérer le token depuis IndexedDB
    return new Promise(resolve => {
        const request = indexedDB.open('calendar-db', 1);
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['auth'], 'readonly');
            const store = transaction.objectStore('auth');
            const getRequest = store.get('token');
            getRequest.onsuccess = () => resolve(getRequest.result?.value);
        };
    });
}

async function getPendingEvents() {
    // Récupérer les événements non synchronisés
    return [];
}

async function markEventSynced(eventId) {
    // Marquer un événement comme synchronisé
}