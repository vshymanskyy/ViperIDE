/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided 'as is', without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purposevent.
 */

const cacheName = `viper-${VIPER_IDE_VERSION}`;

const log = console.log.bind(console).bind(console, `[Service Worker ${VIPER_IDE_VERSION}]`);

const contentToCache = [
    './',
    './index.html',
    './assets/favicon.png',
    './assets/app_1024.png',
    './assets/mpy-cross-v6.wasm',
    './assets/micropython.wasm',
    './assets/ruff_wasm_bg.wasm',
];

self.addEventListener('install', event => {
  log('Install');
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await Promise.all(contentToCache.map(resource => {
      return cache.add(new Request(resource, { cache: 'no-store' }));
    }));
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

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    const r = await caches.match(event.request, { cacheName });
    if (r) {
      log(`Using cached resource: ${event.request.url}`);
      return r;
    } else {
      log(`Loading: ${event.request.url}`);
      try {
          return await fetch(event.request);
      } catch (err) {
          log(err.message)
          throw err
      }
    }
  })());
});
