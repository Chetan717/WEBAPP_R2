import { nativeEnabled, fetchNativeAsset, backupNativeAsset } from './modelWorkerNativeTransport.js';
const CACHE = 'mlmlive-ai-models-v3';
export async function fetchAiAsset(url, { size, magic, asset, onProgress, fresh = false }) {
  const validate = bytes => {
    if (bytes.length !== size || !magic.every((b, i) => bytes[i] === b)) throw new Error('Incomplete or invalid AI binary');
    return bytes;
  };
  const save = async bytes => {
    try { const cache = await caches.open(CACHE); await cache.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) } })); } catch {}
  };
  if (!fresh && 'caches' in globalThis) {
    try {
      const cache = await caches.open(CACHE); const hit = await cache.match(url);
      if (hit) {
        try {
          const bytes = validate(new Uint8Array(await hit.arrayBuffer()));
          if (asset) backupNativeAsset(asset, url);
          return bytes;
        } catch { await cache.delete(url); }
      }
    } catch {}
  }
  if (asset && nativeEnabled()) {
    try {
      const bytes = validate(await fetchNativeAsset(asset, url, onProgress));
      // Expo has already committed the file atomically. Browser caching here
      // would duplicate that write and increase peak WebView memory.
      return bytes;
    } catch (e) {
      // A definite native storage error can use the regular HTTP cache. A
      // stalled native request must not launch a second giant download.
      if (!e.nativeCacheFailure) throw e;
    }
  }
  const controller = new AbortController();
  let timer;
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 30000); };
  let reader;
  touch();
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit', cache: fresh ? 'reload' : 'force-cache', signal: controller.signal });
    if (response.status !== 200 || /text\/html|application\/json/i.test(response.headers.get('content-type') || '')) throw new Error(`AI download failed (${response.status})`);
    const bytes = new Uint8Array(size);
    if (response.body?.getReader) {
      reader = response.body.getReader(); let offset = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        touch();
        if (offset + value.length > size) throw new Error('AI response is oversized');
        bytes.set(value, offset); offset += value.length;
        onProgress?.(Math.round(offset / size * 100));
      }
      if (offset !== size) throw new Error('AI download is incomplete');
    } else {
      const body = new Uint8Array(await response.arrayBuffer());
      validate(body); bytes.set(body);
    }
    validate(bytes); clearTimeout(timer); await save(bytes);
    if (asset) backupNativeAsset(asset, url);
    return bytes;
  } catch (e) { await reader?.cancel().catch(() => {}); throw e; }
  finally { clearTimeout(timer); reader?.releaseLock(); }
}
