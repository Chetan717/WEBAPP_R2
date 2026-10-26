// The Admin publishes this public feed to the existing template CDN.
// Popup delivery never queries Firestore or calls a Cloud Function.
export const POPUP_CACHE_MS = 5 * 60 * 1000;
const ROUTES = new Set([
  "/",
  "/profile",
  "/subscription",
  "/categories",
  "/search",
  "/selectcomp",
  "/mlmprofile",
  "/alltemp?group=everyday-moments",
  "/reporting",
  "/ask-ai",
]);

function deviceStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function safePopupMedia(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function popupPreview(item) {
  if (item?.kind !== "template")
    return { url: safePopupMedia(item?.imageUrl), video: false };
  const first = item.template?.GraphicsLink?.[0];
  return {
    url: safePopupMedia(
      first?.suggestionImage || first?.url || first?.backgroundVideoUrl,
    ),
    video:
      !first?.suggestionImage &&
      !first?.url &&
      Boolean(first?.backgroundVideoUrl),
  };
}

export function eligiblePopups(
  feed,
  companyId,
  seen = new Set(),
  now = Date.now(),
) {
  if (feed?.schemaVersion !== 1 || !Array.isArray(feed.items)) return [];
  return feed.items
    .filter((item) => {
      if (
        !/^[A-Za-z0-9_-]{1,100}$/.test(item?.id || "") ||
        seen.has(item.id) ||
        !popupPreview(item).url
      )
        return false;
      if (
        item.startsAt &&
        (!Number.isFinite(Date.parse(item.startsAt)) ||
          Date.parse(item.startsAt) > now)
      )
        return false;
      if (
        item.endsAt &&
        (!Number.isFinite(Date.parse(item.endsAt)) ||
          Date.parse(item.endsAt) <= now)
      )
        return false;
      // General announcements and General templates are for every app user.
      if (item.kind === "general") return ROUTES.has(item.destination);
      const template = item.template;
      if (
        item.kind !== "template" ||
        !template?.id ||
        !(template.type || template.SelectType)
      )
        return false;
      if (template.Active === false || template.Launched === false)
        return false;
      if (template.MainType === "General") return true;
      // Check the actual template company as well as the published target.
      return (
        template.MainType === "MLM" &&
        Boolean(companyId) &&
        template.Company === companyId &&
        item.companyId === companyId
      );
    })
    .sort(
      (a, b) =>
        (Number(b.priority) || 0) - (Number(a.priority) || 0) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
}

export function createPopupFeedClient(
  baseUrl,
  {
    storage = deviceStorage(),
    fetcher = (...args) => fetch(...args),
    now = () => Date.now(),
  } = {},
) {
  const base = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const key = `mlmlive:popup-feed:v1:${base}`;
  let entry = null;
  let pending = null;
  const validFeed = (feed) =>
    feed?.schemaVersion === 1 && Array.isArray(feed.items);
  try {
    const stored = JSON.parse(storage?.getItem(key) || "null");
    if (validFeed(stored?.feed) && Number.isFinite(stored.ts)) entry = stored;
  } catch {
    /* Private browsing/storage quota must not break Home. */
  }

  return async function loadPopupFeed() {
    if (!/^https:\/\//i.test(base)) return null;
    if (entry && now() >= entry.ts && now() - entry.ts < POPUP_CACHE_MS)
      return entry.feed;
    if (pending) return pending;
    pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      let feed = entry?.feed || null;
      try {
        const response = await fetcher(`${base}/catalog/v1/popups.json`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (response.status === 404) feed = { schemaVersion: 1, items: [] };
        else {
          if (!response.ok) throw new Error("Popup feed unavailable");
          const payload = await response.json();
          if (!validFeed(payload)) throw new Error("Unsupported popup feed");
          feed = payload;
        }
      } catch {
        /* Use cached public data on transient errors; eligibility still checks expiry. */
      } finally {
        clearTimeout(timer);
      }
      // Also cache empty/error responses to avoid retrying on every Home render.
      entry = { ts: now(), feed: feed || { schemaVersion: 1, items: [] } };
      try {
        storage?.setItem(key, JSON.stringify(entry));
      } catch {}
      return entry.feed;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}

// IDs deliberately survive feed revisions and edits. Copy as New in Admin
// creates a new campaign ID. Never clear this history on logout/company change.
export function createPopupSeenStore(storage = deviceStorage()) {
  const memory = new Map();
  function read(uid) {
    const seen = new Set(memory.get(uid) || []);
    try {
      const saved = JSON.parse(
        storage?.getItem(`mlmlive:popup-seen:v1:${encodeURIComponent(uid)}`) ||
          "[]",
      );
      if (Array.isArray(saved))
        saved.forEach((id) => {
          if (typeof id === "string") seen.add(id);
        });
    } catch {}
    return seen;
  }
  return {
    read,
    mark(uid, id) {
      if (!uid || !id) return;
      const seen = read(uid);
      seen.add(id);
      memory.set(uid, seen);
      try {
        storage?.setItem(
          `mlmlive:popup-seen:v1:${encodeURIComponent(uid)}`,
          JSON.stringify([...seen]),
        );
      } catch {}
    },
  };
}
