let cacheName = 'v1';

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(cacheName).then(function(cache) {
            return cache.addAll([
                // '/move-capture-pwa/',
                '/moveCapture/',
                // '/move-capture-pwa/index.html',
                '/moveCapture/index.html',
                // '/move-capture-pwa/main.js',
                '/moveCapture/main.js',
                // '/move-capture-pwa/opencv.js'
                '/moveCapture/opencv.js',
                '/moveCapture/style.css'
            ]);
        })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request).then(function(response) {
            console.log('fetching resource: ' + event.request.url);
            if (response !== undefined) {
                return response;
            } else {
                return fetch(event.request).then(function(response) {
                    let responseClone = response.clone();
                    caches.open(cacheName).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                // .catch(function() {
                   // return caches.match('/moveCapture/unko.png');
                //     return caches.match('/move-capture-pwa/unko.png');
                // });
            }
        })
    );
});