// Start after the first paint, without blocking React, login, or route loading.
// preloadBgModel owns the singleton: startup and later photo controls never
// create parallel downloads or a new session for each photo.
export function scheduleBgModelWarmup() {
  if (typeof window === "undefined") return () => {};
  let cancelled = false;
  let idleId;
  const start = () => {
    if (cancelled) return;
    void import("../pages/mainform/utils/removeBg.js")
      .then(({ preloadBgModel }) => { if (!cancelled) return preloadBgModel(); })
      .catch(error => console.warn("[removeBg] Startup warmup unavailable:", error));
  };
  const timer = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(start, { timeout: 2500 });
    } else start();
  }, 750);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
  };
}
