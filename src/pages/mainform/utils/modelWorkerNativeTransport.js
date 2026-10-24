let id = 0;
const pending = new Map();
export function receiveNativeReply(data) {
  if (data?.type !== 'native-model-reply') return false;
  const item = pending.get(data.nativeId);
  if (item) {
    if (data.progress !== undefined) item.progress?.(data.progress);
    else { pending.delete(data.nativeId); data.error
      ? item.reject(Object.assign(new Error(data.error), { nativeCacheFailure: data.nativeCacheFailure }))
      : item.resolve(new Uint8Array(data.buffer)); }
  }
  return true;
}
export function nativeEnabled() { return globalThis.__MLMLIVE_NATIVE_MODEL_CACHE__ === true; }
export function fetchNativeAsset(asset, url, progress) {
  return new Promise((resolve, reject) => {
    const nativeId = ++id; pending.set(nativeId, { resolve, reject, progress });
    self.postMessage({ type: 'native-model-read', nativeId, asset, url });
  });
}
export function backupNativeAsset(asset, url) {
  if (nativeEnabled()) self.postMessage({ type: 'native-model-backup', asset, url });
}
