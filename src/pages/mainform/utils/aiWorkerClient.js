import { hasNativeModelCache, readNativeModel, backupBrowserModel } from '../../../utils/nativeModelCache.js';

export function createAiWorkerClient(createWorker, name = 'AI') {
  let worker = null;
  let next = 0;
  const pending = new Map();
  const backups = new Map();
  const stop = error => {
    worker?.terminate(); worker = null;
    for (const item of pending.values()) { item.cleanup(); item.reject(error); }
    pending.clear(); backups.clear();
  };
  const getWorker = () => {
    if (worker) return worker;
    const current = createWorker(); worker = current;
    current.onmessage = async ({ data }) => {
      if (data.type === 'native-model-read') {
        try {
          const bytes = await readNativeModel(data.asset, data.url, progress => {
            for (const item of pending.values()) item.touch();
            if (worker === current) current.postMessage({ type: 'native-model-reply', nativeId: data.nativeId, progress });
          });
          if (worker === current) current.postMessage({ type: 'native-model-reply', nativeId: data.nativeId, buffer: bytes.buffer }, [bytes.buffer]);
        } catch (e) {
          if (worker === current) current.postMessage({ type: 'native-model-reply', nativeId: data.nativeId, error: e.message, nativeCacheFailure: e.nativeCacheFailure });
        }
        return;
      }
      if (data.type === 'native-model-backup') { backups.set(data.asset, data.url); return; }
      const item = pending.get(data.id);
      if (!item) return;
      if (data.type === 'progress') { item.touch(); item.onProgress?.(data.stage, data.percentage); return; }
      pending.delete(data.id); item.cleanup();
      if (data.type === 'done') {
        // Local diagnostics only: no telemetry, database write, or extra request.
        const metrics = globalThis.__MLMLIVE_BG_METRICS__ ||= [];
        metrics.push({ engine: name, request: item.type, ...data.timing, at: Date.now() });
        if (metrics.length > 30) metrics.shift();
        item.resolve(data.value);
      }
      else item.reject(Object.assign(new Error(data.error?.message || 'Photo engine failed'), data.error));
      if (!pending.size) {
        for (const [asset, assetUrl] of backups) backupBrowserModel(asset, assetUrl);
        backups.clear();
      }
    };
    current.onerror = e => { e.preventDefault?.(); stop(Object.assign(new Error(e.message || 'Photo worker failed'), { removeBgUnsupported: true })); };
    current.onmessageerror = () => stop(new Error('Photo worker response could not be read'));
    return current;
  };
  return {
    request(type, file, onProgress, signal) {
      if (signal?.aborted) return Promise.reject(new DOMException('Background removal cancelled', 'AbortError'));
      const current = getWorker(); const id = ++next;
      return new Promise((resolve, reject) => {
        let timer;
        const cancel = () => {
          pending.delete(id); cleanup();
          current.postMessage({ type: 'cancel', id });
          reject(new DOMException('Background removal cancelled', 'AbortError'));
        };
        const touch = () => { clearTimeout(timer); timer = setTimeout(() => stop(Object.assign(new Error('Photo engine stopped responding'), { removeBgUnsupported: true })), 90000); };
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
        pending.set(id, { resolve, reject, onProgress, touch, cleanup, type });
        signal?.addEventListener('abort', cancel, { once: true }); touch();
        try { current.postMessage({ id, type, file, nativeCache: hasNativeModelCache() }); }
        catch (e) { stop(e); }
      });
    },
    reset() { stop(new Error('Photo engine restarted')); },
  };
}
