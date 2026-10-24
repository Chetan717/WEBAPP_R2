import { POPUP_CACHE_MS } from "./popupModel.js";

export function createPopupFeedClient({ url, fetcher = globalThis.fetch, storage = null, clock = Date.now, timeoutMs = 6000 }) {
  const key = `mlmlive.popup-feed.v1:${url}`;
  let cache = null, pending = null;
  const empty = () => ({ schemaVersion: 1, revision: 0, items: [] });
  const read = () => {
    if (cache) return cache;
    try {
      const value = JSON.parse(storage?.getItem(key) || "null");
      if (value?.feed?.schemaVersion === 1 && Array.isArray(value.feed.items) && clock() - value.checkedAt < 2 * 86400000) cache = value;
    } catch { /* Cache failure never breaks Home. */ }
    return cache;
  };
  const load = async () => {
    const saved = read();
    if (saved && clock() >= saved.checkedAt && clock() - saved.checkedAt < POPUP_CACHE_MS) return saved.feed;
    if (pending) return pending;
    const request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let feed = saved?.feed || empty();
      try {
        const response = await fetcher(url, { cache: "default", signal: controller.signal, headers: { accept: "application/json" } });
        if (response.status === 404) feed = empty();
        else {
          if (!response.ok) throw new Error("Popup feed unavailable");
          const body = await response.text();
          if (body.length > 1024 * 1024) throw new Error("Popup feed too large");
          const parsed = JSON.parse(body);
          if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items) || parsed.items.length > 40) throw new Error("Invalid popup feed");
          feed = parsed;
        }
      } catch { /* CDN-only: use previous cache, never query Firestore. */ }
      finally { clearTimeout(timer); }
      // Cache failures and 404s as well, so a missing object / outage does not
      // cause repeated requests on every render or Home navigation.
      cache = { checkedAt: clock(), feed };
      try { storage?.setItem(key, JSON.stringify(cache)); } catch { /* In-memory fallback. */ }
      return feed;
    })();
    pending = request;
    try { return await request; } finally { if (pending === request) pending = null; }
  };
  return { load };
}

const seenMemory = new Map();
export const POPUP_SEEN_PREFIX = "mlmlive.popup-seen.v1:";
export function seenPopups(uid, storage = null) {
  if (!uid) return new Set();
  const result = new Set(seenMemory.get(uid) || []);
  try { const values = JSON.parse(storage?.getItem(`${POPUP_SEEN_PREFIX}${uid}`) || "[]"); if (Array.isArray(values)) for (const id of values) if (typeof id === "string") result.add(id); } catch { /* Memory retains dismissals. */ }
  return result;
}
export function markPopupSeen(uid, id, storage = null) {
  if (!uid || !id) return;
  const next = seenPopups(uid, storage); next.add(id); seenMemory.set(uid, next);
  try { storage?.setItem(`${POPUP_SEEN_PREFIX}${uid}`, JSON.stringify([...next])); } catch { /* Memory retains dismissals. */ }
}
