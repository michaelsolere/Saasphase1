self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isWhelpingNavigation =
    request.mode === "navigate" &&
    request.method === "GET" &&
    url.origin === self.location.origin &&
    (url.pathname === "/whelping" || url.pathname.startsWith("/whelping/"));

  if (!isWhelpingNavigation) return;
});
