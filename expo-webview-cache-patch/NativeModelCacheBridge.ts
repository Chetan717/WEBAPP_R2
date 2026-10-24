import { AppState } from 'react-native';
import { NativeModelCache } from './NativeModelCache';
export const MODEL_CACHE_BOOTSTRAP = 'window.__MLMLIVE_MODEL_CACHE__=1;true;';
const caches = new Map<string, NativeModelCache>();
let subscribed = false;
type WebRef = { current: { injectJavaScript: (script: string) => void } | null };
export function handleNativeModelCacheMessage(event: { nativeEvent: { data: string; url?: string } }, ref: WebRef, appUrl: string) {
  let data;
  try { data = JSON.parse(event.nativeEvent.data); } catch { return false; }
  if (data?.type !== 'AI_MODEL_CACHE') return false;
  try {
    const origin = new URL(appUrl).origin;
    if (!origin.startsWith('https://') || new URL(event.nativeEvent.url || '').origin !== origin) return true;
    let cache = caches.get(origin);
    if (!cache) { cache = new NativeModelCache(origin); caches.set(origin, cache); void cache.setActive(AppState.currentState !== 'background'); }
    if (!subscribed) {
      subscribed = true;
      AppState.addEventListener('change', state => {
        for (const c of caches.values()) void c.setActive(state !== 'background');
      });
    }
    void cache.receive(data, detail => {
      ref.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('MLMLIVE_MODEL_CACHE_ACK',{detail:${JSON.stringify(detail)}}));true;`);
    });
  } catch (e) {
    ref.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('MLMLIVE_MODEL_CACHE_ACK',{detail:${JSON.stringify({ id: data.id, error: String(e) })}}));true;`);
  }
  return true;
}
