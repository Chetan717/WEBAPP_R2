import { getBirefNetCapability as getEngineCapability } from "./birefnetBg.js";
import { createAiWorkerClient } from "./aiWorkerClient.js";
const client = createAiWorkerClient(() => new Worker(new URL("./birefnetWorker.js", import.meta.url), { type: "module", name: "mlmlive-birefnet" }), 'birefnet');
export async function getBirefNetCapability() {
  if (typeof Worker !== "function" || typeof OffscreenCanvas !== "function" || typeof createImageBitmap !== "function") return { supported: false, reason: "image-worker-unavailable" };
  return getEngineCapability();
}
export const preloadBirefNet = onProgress => client.request("preload", undefined, onProgress);
export const removeBackgroundWithBirefNet = (file, onProgress, signal) => client.request("process", file, onProgress, signal);
export const resetBirefNetEngine = () => client.reset();
