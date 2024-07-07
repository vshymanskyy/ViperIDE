/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided 'as is', without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purposevent.
 */

import { version } from '../package.json'

const cacheName = `viper-${version}`;

const contentToCache = [
    '/',
    '/index.html',
    '/assets/favicon.png',
    '/assets/app_1024.png',
    '/assets/mpy-cross-v6.wasm',
];

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(contentToCache);
  })());
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
});

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    const r = await caches.match(event.request);
    if (r) {
      console.log(`[Service Worker] Using cached resource: ${event.request.url}`);
      return r;
    } else {
      const response = await fetch(event.request);
      //const cache = await caches.open(cacheName);
      //console.log(`[Service Worker] Caching new resource: ${event.request.url}`);
      //cache.put(event.request, response.clone());
      return response;
    }
  })());
});
