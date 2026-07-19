const CACHE_NAME = '__CACHE_NAME__'
const CACHE_PREFIX = 'offline-games-'
const PRECACHE = __PRECACHE__

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name))))
            .then(() => self.clients.claim())
    )
})

self.addEventListener('fetch', event => {
    const request = event.request
    if (request.method !== 'GET') return

    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
                    return response
                })
                .catch(async () => {
                    const cached = await caches.match(request, {ignoreSearch: true})
                    return cached || caches.match('./index.html')
                })
        )
        return
    }

    event.respondWith(
        caches.match(request, {ignoreSearch: true}).then(cached => cached || fetch(request))
    )
})
