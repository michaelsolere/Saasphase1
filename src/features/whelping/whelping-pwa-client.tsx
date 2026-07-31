"use client";

import { useEffect } from "react";

export function WhelpingPwaClient() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/whelping-sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch(() => {
        console.warn("Le service worker du mode mise-bas n’a pas pu être enregistré.");
      });
  }, []);

  return null;
}
