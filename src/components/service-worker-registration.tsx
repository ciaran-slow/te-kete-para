"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failures (unsupported browser quirks, blocked by an
      // extension, etc.) must not block the app from working online.
    });
  }, []);

  return null;
}
