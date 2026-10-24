// Optional Expo bridge. Browser-only builds continue to use Cache Storage/HTTP.
const waiting = new Map();
const page = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let next = 0;
let listening = false;
const CHUNK = 196608;
export const hasNativeModelCache = () => typeof window !== 'undefined' &&
  window.__MLMLIVE_MODEL_CACHE__ === 1 && typeof window.ReactNativeWebView?.postMessage === 'function';

function request(action, fields = {}, progress) {
  if (!hasNativeModelCache()) return Promise.reject(new Error('Native model cache unavailable'));
  if (!listening) {
    window.addEventListener('MLMLIVE_MODEL_CACHE_ACK', ({ detail }) => {
      const item = waiting.get(detail?.id);
      if (!item) return;
      item.touch();
      if (detail.progress !== undefined) { item.progress?.(detail.progress); return; }
      waiting.delete(detail.id); clearTimeout(item.timer);
      if (detail.error) item.reject(Object.assign(new Error(detail.error), { nativeCacheFailure: true }));
      else item.resolve(detail);
    });
    listening = true;
  }
  const id = `${page}:${++next}`;
  return new Promise((resolve, reject) => {
    const item = { resolve, reject, progress, timer: null, touch() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { waiting.delete(id); reject(new Error('Native model cache stopped responding')); }, 45000);
    } };
    waiting.set(id, item); item.touch();
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'AI_MODEL_CACHE', page, id, action, ...fields })); }
    catch (e) { clearTimeout(item.timer); waiting.delete(id); reject(e); }
  });
}
export async function readNativeModel(asset, url, onProgress) {
  const info = await request('prepare', { asset, url }, onProgress);
  const bytes = new Uint8Array(info.size);
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const length = Math.min(CHUNK, bytes.length - offset);
    const part = await request('read', { asset, offset, length });
    const binary = atob(part.data);
    if (binary.length !== length) throw new Error('Native model chunk is incomplete');
    for (let i = 0; i < length; i++) bytes[offset + i] = binary.charCodeAt(i);
    onProgress?.(Math.round((offset + length) / bytes.length * 100));
  }
  return bytes;
}
let backupTail = Promise.resolve();
const backedUp = new Set();
export function backupBrowserModel(asset, url) {
  if (!hasNativeModelCache() || backedUp.has(asset)) return;
  backedUp.add(asset);
  backupTail = backupTail.catch(() => {}).then(async () => {
    let started = false;
    let reader;
    try {
      if ((await request('status', { asset })).ready) return;
      const response = await caches.match(url);
      if (!response?.body) throw new Error('Browser cache unavailable for migration');
      await request('write-start', { asset }); started = true;
      reader = response.body.getReader();
      let offset = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (let at = 0; at < value.length; at += CHUNK) {
          const part = value.subarray(at, at + CHUNK);
          let binary = '';
          for (let j = 0; j < part.length; j++) binary += String.fromCharCode(part[j]);
          await request('write', { asset, offset, data: btoa(binary) }); offset += part.length;
        }
      }
      await request('write-finish', { asset }); started = false;
    } catch {
      backedUp.delete(asset);
      if (started) await request('write-cancel', { asset }).catch(() => {});
    } finally { reader?.releaseLock(); }
  });
}
