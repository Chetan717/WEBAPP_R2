// This campaign is deliberately dated: Diwali does not fall on the same date
// every year. End is exclusive, so the theme runs through 15 November in India.
export const DIWALI_SEASON_START = Date.parse("2026-11-01T00:00:00+05:30");
export const DIWALI_SEASON_END = Date.parse("2026-11-16T00:00:00+05:30");

export function getDiwaliSeasonState(now = Date.now(), mode = "auto") {
  const setting = String(mode).trim().toLowerCase();
  if (setting === "on" || setting === "true") {
    return { enabled: true, nextTransitionAt: null };
  }
  if (setting === "off" || setting === "false") {
    return { enabled: false, nextTransitionAt: null };
  }
  if (now < DIWALI_SEASON_START) {
    return { enabled: false, nextTransitionAt: DIWALI_SEASON_START };
  }
  return {
    enabled: now < DIWALI_SEASON_END,
    nextTransitionAt: now < DIWALI_SEASON_END ? DIWALI_SEASON_END : null,
  };
}
