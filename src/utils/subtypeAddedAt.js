const NEW_SUBTYPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function subtypeTimestamp(value) {
  let milliseconds;
  if (typeof value?.toMillis === "function") milliseconds = value.toMillis();
  else if (typeof value?.toDate === "function")
    milliseconds = value.toDate().getTime();
  else if (
    value &&
    typeof value === "object" &&
    typeof value.seconds === "number"
  ) {
    milliseconds = value.seconds * 1000 + Number(value.nanoseconds || 0) / 1e6;
  } else
    milliseconds = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
}

// Matches the Admin catalog publisher's key, including company and main type.
export function subtypeDateKey(template) {
  return JSON.stringify([
    template?.MainType || "General",
    template?.Company || template?.company || "",
    template?.SelectType || template?.type || "",
    String(template?.Subtype || "").trim(),
  ]);
}

export function annotateSubtypeAddedAt(
  templates,
  publishedDates = {},
  { complete = false } = {},
) {
  const dates = new Map();
  for (const template of templates) {
    const key = subtypeDateKey(template);
    // Only a complete subtype catalog may infer birth from createdAt. A
    // limited Home/Firestore slice may omit an older template of that subtype.
    const value =
      template.subtypeAddedAt === undefined
        ? complete
          ? template.createdAt
          : undefined
        : template.subtypeAddedAt;
    const timestamp = subtypeTimestamp(value);
    const previous = dates.get(key);
    dates.set(
      key,
      previous === 0 || !timestamp
        ? 0
        : Math.min(previous || timestamp, timestamp),
    );
  }
  return templates.map((template) => {
    const key = subtypeDateKey(template);
    const timestamp =
      publishedDates && Object.hasOwn(publishedDates, key)
        ? subtypeTimestamp(publishedDates[key])
        : dates.get(key);
    return {
      ...template,
      subtypeAddedAt: timestamp ? new Date(timestamp).toISOString() : "",
    };
  });
}

export function isNewSubtype(template, now = Date.now()) {
  if (!String(template?.Subtype || "").trim()) return false;
  const addedAt = subtypeTimestamp(template?.subtypeAddedAt);
  const age = now - addedAt;
  return addedAt > 0 && age >= 0 && age < NEW_SUBTYPE_WINDOW_MS;
}
