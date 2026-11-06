import { useEffect, useState } from "react";
import { getDiwaliSeasonState } from "../../utils/diwaliSeason";

const MODE = import.meta.env.VITE_DIWALI_MODE || "auto";

export default function useDiwaliSeason() {
  const [enabled, setEnabled] = useState(
    () => getDiwaliSeasonState(Date.now(), MODE).enabled,
  );

  useEffect(() => {
    let timer;
    const syncSeason = () => {
      window.clearTimeout(timer);
      const season = getDiwaliSeasonState(Date.now(), MODE);
      setEnabled(season.enabled);
      if (season.nextTransitionAt !== null) {
        // Recheck long-lived WebViews without exceeding setTimeout's limit.
        timer = window.setTimeout(
          syncSeason,
          Math.min(86_400_000, Math.max(1, season.nextTransitionAt - Date.now())),
        );
      }
    };
    syncSeason();
    window.addEventListener("focus", syncSeason);
    document.addEventListener("visibilitychange", syncSeason);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", syncSeason);
      document.removeEventListener("visibilitychange", syncSeason);
    };
  }, []);

  return enabled;
}
