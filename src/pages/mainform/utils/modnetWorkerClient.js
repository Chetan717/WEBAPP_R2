import { createAiWorkerClient } from './aiWorkerClient.js';
const client = createAiWorkerClient(() => new Worker(new URL('./modnetWorker.js', import.meta.url), { type: 'module', name: 'mlmlive-modnet' }), 'modnet');
const workerSupported = () => typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';
let legacy;
const fallback = () => legacy ||= import('./modnetBg.js');
export async function preloadModNet(progress) {
  return workerSupported() ? client.request('preload', undefined, progress) : (await fallback()).preloadModNet(progress);
}
export async function removeBackgroundWithModNet(file, progress, signal) {
  return workerSupported() ? client.request('process', file, progress, signal) : (await fallback()).removeBackgroundWithModNet(file, progress, signal);
}
export function resetModNetEngine(options) {
  client.reset();
  if (legacy) void legacy.then(m => m.resetModNetEngine(options));
}
