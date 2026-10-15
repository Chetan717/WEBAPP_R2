const STORAGE_PREFIX = "mlmlive:known-subtypes:v1:";

function previewOf(graphic) {
  return graphic?.suggestionImage || graphic?.url || graphic?.backgroundVideoUrl || "";
}

export function findNewSubtypeAnnouncement(companyId, typeSections, storage = typeof localStorage === "undefined" ? null : localStorage) {
  if (!companyId || !storage) return null;
  let announcement = null;
  for (const typeSection of typeSections || []) {
    const type = String(typeSection?.type || "").trim();
    if (!type) continue;
    const subtypes = (typeSection.subtypeSections || []).filter((section) => section?.subtype && section?.items?.length);
    const names = [...new Set(subtypes.map((section) => String(section.subtype).trim()))];
    // Every company and type has a separate baseline; the very first load
    // should not advertise all historical designs as new.
    const key = `${STORAGE_PREFIX}${encodeURIComponent(companyId)}:${encodeURIComponent(type)}`;
    try {
      const oldRaw = storage.getItem(key);
      const old = oldRaw === null ? null : JSON.parse(oldRaw);
      if (Array.isArray(old) && !announcement) {
        const previous = new Set(old);
        const added = subtypes.find((section) => !previous.has(String(section.subtype).trim()));
        if (added) {
          const graphic = added.items[0];
          announcement = { type, subtype: added.subtype, graphic, preview: previewOf(graphic) };
        }
      }
      storage.setItem(key, JSON.stringify(names));
    } catch {
      // Denied storage should never break production template navigation.
    }
  }
  return announcement;
}
