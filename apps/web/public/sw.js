self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const resolveSafeTargetUrl = (rawUrl) => {
  const fallbackUrl = new URL("/", self.location.origin);
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    return fallbackUrl.toString();
  }
  try {
    const candidate = new URL(rawUrl, self.location.origin);
    if (candidate.origin !== self.location.origin) {
      return fallbackUrl.toString();
    }
    return candidate.toString();
  } catch {
    return fallbackUrl.toString();
  }
};

const NOTIFICATION_TITLE_DB_NAME = "vde-monitor-local-notification-titles";
const NOTIFICATION_TITLE_STORE_NAME = "session_titles";
const NOTIFICATION_TITLE_DB_VERSION = 1;
let notificationTitleDbPromise = null;

const openNotificationTitleDb = () => {
  if (notificationTitleDbPromise) {
    return notificationTitleDbPromise;
  }
  if (!("indexedDB" in self)) {
    return Promise.resolve(null);
  }
  notificationTitleDbPromise = new Promise((resolve) => {
    const request = self.indexedDB.open(NOTIFICATION_TITLE_DB_NAME, NOTIFICATION_TITLE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTIFICATION_TITLE_STORE_NAME)) {
        db.createObjectStore(NOTIFICATION_TITLE_STORE_NAME, { keyPath: "paneId" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        notificationTitleDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      notificationTitleDbPromise = null;
      resolve(null);
    };
    request.onblocked = () => {
      notificationTitleDbPromise = null;
      resolve(null);
    };
  });
  return notificationTitleDbPromise;
};

const readLocalSessionTitle = async (paneId) => {
  if (typeof paneId !== "string" || paneId.length === 0) {
    return null;
  }
  const db = await openNotificationTitleDb();
  if (!db) {
    return null;
  }
  return await new Promise((resolve) => {
    let settled = false;
    const tx = db.transaction(NOTIFICATION_TITLE_STORE_NAME, "readonly");
    const store = tx.objectStore(NOTIFICATION_TITLE_STORE_NAME);
    const request = store.get(paneId);
    request.onsuccess = () => {
      const record = request.result;
      const title = typeof record?.title === "string" ? record.title.trim() : "";
      settled = true;
      resolve(title.length > 0 ? title : null);
    };
    request.onerror = () => {
      settled = true;
      resolve(null);
    };
    tx.onabort = () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    };
    tx.onerror = () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    };
  });
};

const resolveNotificationBody = ({ payloadBody, eventType, localSessionTitle }) => {
  if (typeof payloadBody !== "string") {
    return "Session update";
  }
  if (!localSessionTitle) {
    return payloadBody;
  }
  if (eventType === "pane.waiting_permission") {
    return `${localSessionTitle} is waiting for permission`;
  }
  if (eventType === "pane.task_completed") {
    return `${localSessionTitle} completed and is now waiting for input`;
  }
  return payloadBody;
};

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
  const payloadBody = typeof payload?.body === "string" ? payload.body : "Session update";
  const paneId = typeof payload?.paneId === "string" ? payload.paneId : null;
  const eventType = typeof payload?.eventType === "string" ? payload.eventType : null;
  const tag = typeof payload?.tag === "string" ? payload.tag : "session-update";
  const url = typeof payload?.url === "string" ? payload.url : "/";

  event.waitUntil(
    (async () => {
      const localSessionTitle = paneId ? await readLocalSessionTitle(paneId) : null;
      const body = resolveNotificationBody({
        payloadBody,
        eventType,
        localSessionTitle,
      });
      await self.registration.showNotification(title, {
        body,
        tag,
        data: { url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = resolveSafeTargetUrl(event.notification?.data?.url);

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if (!client.url.startsWith(self.location.origin)) {
          continue;
        }
        try {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return;
        } catch {
          break;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
