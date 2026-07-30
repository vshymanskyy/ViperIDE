/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided 'as is', without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purposevent.
 */

const cacheName = `viper-${VIPER_IDE_VERSION}`;
const offlineReadyMessage = 'VIPER_IDE_OFFLINE_CACHE_READY';

const log = console.log.bind(console).bind(console, `[Service Worker ${VIPER_IDE_VERSION}]`);

const contentToCache = new Set([
    '/index.html',
    '/assets/favicon.png',
    '/assets/app_1024.png',
    '/assets/logo_1024.png',
    '/assets/mpy-cross-v4.wasm',
    '/assets/mpy-cross-v5.wasm',
    '/assets/mpy-cross-v6.wasm',
    '/assets/mpy-cross-v6.1.wasm',
    '/assets/mpy-cross-v6.2.wasm',
    '/assets/mpy-cross-v6.3.wasm',
    '/assets/micropython.wasm',
    '/assets/ruff_wasm_bg.wasm',
    '/assets/tools_vfs.tar.gz',
    '/assets/vm_vfs.tar.gz',
]);

self.addEventListener('install', event => {
  log('Install');
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await Promise.all(contentToCache.values().map(resource => {
      return cache.add(new Request(resource, { cache: 'no-store' }));
    }));
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const client of clients) {
      client.postMessage({
        type: offlineReadyMessage,
        version: VIPER_IDE_VERSION,
      });
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  log('Activate');
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== cacheName) {
        log(`Deleting ${key}`);
        await caches.delete(key);
      }
    }
  })());
});

function normalizeUrl(s) {
  const url = new URL(s);
  if (url.pathname === '/') {
    return new URL('/index.html', url.origin);
  }
  return url;
}

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const url = normalizeUrl(event.request.url);
    const r = await cache.match(url);
    if (r) {
      log(`Using cached: ${url}`);
      return r;
    } else {
      //log(`Loading: ${url}`);
      try {
        const rsp = await fetch(event.request);

        if (contentToCache.has(url.pathname)) {
          log(`Caching: ${url}`);
          cache.put(event.request, rsp.clone());
        }

        return rsp;
      } catch (err) {
        log(err.message);
        throw err;
      }
    }
  })());
});
