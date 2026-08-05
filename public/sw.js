const CACHE_VERSION = "v1";
const CACHE_NAME = `tkp-shell-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("tkp-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});

// Chrome (and other browsers) enforce a "user-visible" push contract: a
// push event that never results in a shown notification gets the browser's
// own generic replacement notification, and repeat offenders can have push
// permission revoked. So a malformed or absent payload must still resolve
// to *some* notification, never a silent no-op.
const DEFAULT_NOTIFICATION = {
  title: "Te Kete Para",
  body: "You have a collection reminder — open the app for details.",
};

self.addEventListener("push", (event) => {
  event.waitUntil(showPushNotification(event));
});

async function showPushNotification(event) {
  let notification = DEFAULT_NOTIFICATION;

  if (event.data) {
    try {
      const data = event.data.json();
      if (typeof data.title === "string" && typeof data.body === "string") {
        notification = { title: data.title, body: data.body };
      }
    } catch {
      // Malformed JSON -- fall back to DEFAULT_NOTIFICATION above.
    }
  }

  await self.registration.showNotification(notification.title, {
    body: notification.body,
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(focusOrOpenAppWindow());
});

async function focusOrOpenAppWindow() {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  if (windowClients.length > 0) {
    await windowClients[0].focus();
    return;
  }

  await self.clients.openWindow("/");
}
