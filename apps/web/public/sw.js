self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    if (!event.data) {
      return null;
    }
    try {
      return event.data.json();
    } catch {
      return null;
    }
  })();

  const title = typeof payload?.title === "string" ? payload.title : "VDE Monitor";
  const body = typeof payload?.body === "string" ? payload.body : "Session update";
  const tag = typeof payload?.tag === "string" ? payload.tag : "session-update";
  const url = typeof payload?.url === "string" ? payload.url : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url;
  const targetPath = typeof rawUrl === "string" && rawUrl.length > 0 ? rawUrl : "/";
  const targetUrl = new URL(targetPath, self.location.origin).toString();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    }),
  );
});
