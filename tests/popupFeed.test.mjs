import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPopupFeedClient, seenPopups, markPopupSeen } from "../src/utils/popupFeedClient.js";
import { POPUP_CACHE_MS, eligiblePopupQueue } from "../src/utils/popupModel.js";
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) }; };
const feed = { schemaVersion: 1, revision: 1, items: [{ id: "popup-a", kind: "general", title: "Offer", imageUrl: "https://cdn.mlmposter.com/a.webp", destination: "/subscription" }] };
const response = value => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });
test("one feed GET is shared by StrictMode / parallel consumers and reused for five minutes", async () => {
  let reads = 0, now = Date.now(); const cache = storage();
  const client = createPopupFeedClient({ url: "https://cdn.mlmposter.com/catalog/v1/popups.json", storage: cache, clock: () => now, fetcher: async () => { reads++; return response(feed); } });
  await Promise.all([client.load(), client.load(), client.load()]); assert.equal(reads, 1);
  await client.load(); assert.equal(reads, 1);
  const reloaded = createPopupFeedClient({ url: "https://cdn.mlmposter.com/catalog/v1/popups.json", storage: cache, clock: () => now, fetcher: async () => { reads++; return response(feed); } });
  await reloaded.load(); assert.equal(reads, 1);
  now += POPUP_CACHE_MS + 1; await reloaded.load(); assert.equal(reads, 2);
});
test("404s and failures are cached; an outage cannot cause repeated GETs", async () => {
  for (const failed of [async () => ({ status: 404 }), async () => { throw Error("offline"); }]) {
    let calls = 0; const client = createPopupFeedClient({ url: "https://cdn.mlmposter.com/popups.json", fetcher: async () => { calls++; return failed(); } });
    assert.equal((await client.load()).items.length, 0); await client.load(); assert.equal(calls, 1);
  }
});
test("last confirmed feed remains available when the CDN temporarily fails", async () => {
  let now = Date.now(), fail = false;
  const client = createPopupFeedClient({ url: "https://cdn.mlmposter.com/popups.json", clock: () => now, fetcher: async () => { if (fail) throw Error("offline"); return response(feed); } });
  await client.load(); now += POPUP_CACHE_MS + 1; fail = true;
  assert.equal((await client.load()).revision, 1);
});
test("dismissals persist per verified user; a different popup identity remains eligible", () => {
  const device = storage(); markPopupSeen("user-a", "popup-a", device);
  assert.equal(seenPopups("user-a", device).has("popup-a"), true);
  assert.equal(seenPopups("user-b", device).has("popup-a"), false);
  assert.equal(eligiblePopupQueue(feed, "company-a", seenPopups("user-a", device)).length, 0);
  const other = { ...feed, items: [{ ...feed.items[0], id: "popup-b" }] };
  assert.equal(eligiblePopupQueue(other, "company-a", seenPopups("user-a", device)).length, 1);
});
test("denied browser storage does not crash dismissal or feed loading", async () => {
  const denied = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
  markPopupSeen("private-user", "popup-a", denied);
  assert.ok(seenPopups("private-user", denied).has("popup-a"));
  const client = createPopupFeedClient({ url: "https://cdn.mlmposter.com/popups.json", storage: denied, fetcher: async () => response(feed) });
  assert.equal((await client.load()).items.length, 1);
});
test("popup runtime has no Firestore / callable fallback and hands template selection to existing Home handler", () => {
  const client = readFileSync(new URL("../src/utils/popupFeedClient.js", import.meta.url), "utf8");
  const host = readFileSync(new URL("../src/components/Popups/PopupCampaignHost.jsx", import.meta.url), "utf8");
  assert.ok(!/from ["']firebase|httpsCallable|onSnapshot|getDoc\(/.test(client + host));
  assert.match(host, /onTemplateSelect\(template\)/);
  const home = readFileSync(new URL("../src/pages/Homepage/Component/ListOfGenaraltemp.jsx", import.meta.url), "utf8");
  assert.match(home, /PopupCampaignHost onTemplateSelect=\{handleImagePress\}/);
});
