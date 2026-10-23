import { getBirefNetCapability as getEngineCapability } from "./birefnetBg.js";

let worker = null;
let requestId = 0;
const pending = new Map();

function stopWorker(error) {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    request.cleanup();
    request.reject(error);
  }
  pending.clear();
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./birefnetWorker.js", import.meta.url), { type: "module", name: "mlmlive-birefnet" });
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    if (data.type === "progress") {
      request.touch();
      request.onProgress?.(data.stage, data.percentage);
      return;
    }
    pending.delete(data.id);
    request.cleanup();
    if (data.type === "done") request.resolve(data.value);
    else request.reject(Object.assign(new Error(data.error?.message || "BiRefNet worker failed."), data.error));
  };
  worker.onerror = event => {
    event.preventDefault?.();
    stopWorker(Object.assign(new Error(event.message || "BiRefNet worker failed to start."), { removeBgUnsupported: true }));
  };
  worker.onmessageerror = () => stopWorker(new Error("BiRefNet worker response could not be read."));
  return worker;
}

export async function getBirefNetCapability() {
  if (typeof Worker !== "function" || typeof OffscreenCanvas !== "function" || typeof createImageBitmap !== "function") {
    return { supported: false, reason: "image-worker-unavailable" };
  }
  return getEngineCapability();
}

function requestWorker(type, file, onProgress, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException("Background removal cancelled", "AbortError"));
  const current = getWorker();
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    let timer;
    const cancel = () => stopWorker(new DOMException("Background removal cancelled", "AbortError"));
    const touch = () => {
      clearTimeout(timer);
      // Continuous download progress resets this watchdog. A stuck GPU/runtime
      // cannot hold every subsequent photo in the serialized queue forever.
      timer = setTimeout(() => stopWorker(Object.assign(new Error("BiRefNet stopped responding."), {
        removeBgUnsupported: true, removeBgStage: "worker-timeout",
      })), 60_000);
    };
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); };
    pending.set(id, { resolve, reject, onProgress, touch, cleanup });
    signal?.addEventListener("abort", cancel, { once: true });
    touch();
    try { current.postMessage({ id, type, file }); }
    catch (error) { stopWorker(error); }
  });
}

export function preloadBirefNet(onProgress) {
  return requestWorker("preload", undefined, onProgress);
}

export function removeBackgroundWithBirefNet(file, onProgress, signal) {
  return requestWorker("process", file, onProgress, signal);
}

export function resetBirefNetEngine() {
  // Termination releases GPU allocations. Persisted model bytes stay intact.
  stopWorker(new DOMException("Background removal reset", "AbortError"));
}
