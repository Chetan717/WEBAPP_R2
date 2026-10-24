export const POPUP_PAGES = Object.freeze([
  { value: "/", label: "Home" }, { value: "/categories", label: "All Categories" },
  { value: "/alltemp?group=everyday-moments", label: "Everyday Moments" },
  { value: "/subscription", label: "Subscription / Offers" }, { value: "/profile", label: "My Profile" },
  { value: "/mlmprofile", label: "MLM Profile" }, { value: "/selectcomp", label: "Select Company" },
  { value: "/search", label: "Template Search" }, { value: "/reporting", label: "Reporting" }, { value: "/ask-ai", label: "Ask AI" },
]);
export const POPUP_CACHE_MS = 5 * 60 * 1000;
export function safePopupImage(value) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; } catch { return ""; }
}
export function popupPreview(row) {
  const first = row?.templateMeta?.GraphicsLink?.[0] || row?.template?.GraphicsLink?.[0];
  return row?.kind === "template" ? safePopupImage(first?.suggestionImage || first?.url || first?.backgroundVideoUrl) : safePopupImage(row?.imageUrl);
}
export function emptyPopupDocument() { return { schemaVersion: 1, revision: 0, publishedRevision: 0, campaigns: {} }; }
export function validatePopupDocument(raw) {
  if (!raw) return emptyPopupDocument();
  if (raw.schemaVersion != null && raw.schemaVersion !== 1) throw new Error("Unsupported popup document version.");
  if (raw.campaigns != null && (!raw.campaigns || typeof raw.campaigns !== "object" || Array.isArray(raw.campaigns))) throw new Error("The campaigns field must be a map.");
  return { ...emptyPopupDocument(), ...raw };
}
export function updatePopupCampaign(raw, { id, values, expectedVersion, remove = false }, now = new Date().toISOString()) {
  const data = validatePopupDocument(raw);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id || "")) throw new Error("Invalid popup ID.");
  const old = data.campaigns[id];
  if (old ? old.version !== expectedVersion : expectedVersion != null) throw new Error("This popup changed in another session. Refresh and open it again.");
  const campaigns = { ...data.campaigns };
  if (remove) delete campaigns[id];
  else {
    const row = { ...values, id, title: String(values.title || "").trim(), message: String(values.message || "").trim() };
    if (!["general", "template"].includes(row.kind)) throw new Error("Choose a popup type.");
    if (!row.title || row.title.length > 100 || row.message.length > 400) throw new Error("Enter a title (up to 100 characters) and message (up to 400).");
    if (row.kind === "general" && (!safePopupImage(row.imageUrl) || !POPUP_PAGES.some(page => page.value === row.destination))) throw new Error("Choose an image and a valid app destination.");
    if (row.kind === "template" && (!row.templateId || row.templateMeta?.id !== row.templateId || !popupPreview(row))) throw new Error("Load and select a template with a valid first GraphicsLink preview.");
    const start = row.startsAt ? Date.parse(row.startsAt) : 0, end = row.endsAt ? Date.parse(row.endsAt) : 0;
    if (row.startsAt && !start || row.endsAt && !end || start && end && end <= start) throw new Error("End date must be after the start date.");
    campaigns[id] = { ...row, version: (old?.version || 0) + 1, createdAt: old?.createdAt || now, updatedAt: now };
  }
  if (Object.keys(campaigns).length > 40) throw new Error("Keep up to 40 campaigns; delete old entries before adding more.");
  const next = { ...data, campaigns, schemaVersion: 1, revision: (Number(data.revision) || 0) + 1, updatedAt: now };
  if (new TextEncoder().encode(JSON.stringify(next)).length > 600 * 1024) throw new Error("Popup settings are too large. Remove old campaigns.");
  return next;
}
export function popupIsEligible(item, companyId, now = Date.now()) {
  if (!item?.id || !["general", "template"].includes(item.kind)) return false;
  if (item.startsAt && (!Date.parse(item.startsAt) || Date.parse(item.startsAt) > now)) return false;
  if (item.endsAt && (!Date.parse(item.endsAt) || Date.parse(item.endsAt) <= now)) return false;
  if (item.companyId && item.companyId !== companyId) return false;
  if (item.kind === "general") return Boolean(safePopupImage(item.imageUrl)) && POPUP_PAGES.some(page => page.value === item.destination);
  return Boolean(item.template?.id && popupPreview(item));
}
export function eligiblePopupQueue(feed, companyId, seen, now = Date.now()) {
  return (Array.isArray(feed?.items) ? feed.items : []).filter(item => popupIsEligible(item, companyId, now) && !seen.has(item.id)).sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
}
export function isNewSubtypeDate(value, now = Date.now()) {
  const birth = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(birth) && birth > 0 && now >= birth && now - birth < 7 * 86400000;
}
