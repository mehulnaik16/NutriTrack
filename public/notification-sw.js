/**
 * Minimal service worker, registered only by /debug/notifications.
 *
 * It exists for one reason: Android Chrome refuses `new Notification(...)` with
 * "Illegal constructor" and will only display a web notification through
 * ServiceWorkerRegistration.showNotification(). Desktop Chrome allows both, so
 * without this the preview page works on a laptop and silently does nothing on
 * the phone — which is the device that actually matters here.
 *
 * Deliberately inert. No fetch handler, so it never intercepts a request and
 * cannot serve anything stale; registration is scoped to /debug/ so it has no
 * say over the rest of the app. The notificationclick handler only focuses an
 * existing tab.
 *
 * This is a development aid. It has nothing to do with the real notification
 * feature, which goes through @capacitor/local-notifications and the OS.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      const open = all.find((c) => c.url.includes("/debug/notifications"));
      if (open) return open.focus();
      return self.clients.openWindow("/debug/notifications");
    }),
  );
});
