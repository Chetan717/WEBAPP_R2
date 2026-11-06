import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Sparkles } from "lucide-react";
import {
  DOWNLOAD_SUCCESS_EVENT,
  HOME_CELEBRATION_EVENT,
  HOME_CELEBRATION_END_EVENT,
} from "../../utils/downloadCelebration";
import { getDiwaliSeasonState } from "../../utils/diwaliSeason";
import { FIREWORKS_DURATION_MS, startFireworks } from "./fireworksEngine";
import "./celebration.css";

function FireworksOverlay({ celebration, onComplete }) {
  const canvasRef = useRef(null);
  const welcome = celebration.kind === "welcome";

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop = () => {};
    let timer;
    const finish = () => onComplete(celebration.id);
    const configure = () => {
      stop();
      window.clearTimeout(timer);
      if (motionQuery.matches) {
        timer = window.setTimeout(finish, 1800);
        return;
      }
      stop = startFireworks(canvasRef.current, {
        variant: celebration.kind,
        onComplete: finish,
      });
      // Also remove the overlay if canvas is unavailable or rAF is suspended.
      timer = window.setTimeout(finish, FIREWORKS_DURATION_MS[celebration.kind] + 100);
    };
    configure();
    motionQuery.addEventListener?.("change", configure);
    return () => {
      stop();
      window.clearTimeout(timer);
      motionQuery.removeEventListener?.("change", configure);
    };
  }, [celebration, onComplete]);

  return createPortal(
    <div
      className={`mlm-fireworks mlm-fireworks--${celebration.kind}`}
      data-celebration={celebration.kind}
    >
      <div className="mlm-fireworks__sky" aria-hidden="true" />
      <canvas ref={canvasRef} className="mlm-fireworks__canvas" aria-hidden="true" />
      <div className="mlm-fireworks__message" role="status" aria-live="polite" aria-atomic="true">
        <span className="mlm-fireworks__badge" aria-hidden="true">
          {welcome ? <Sparkles size={20} /> : <Check size={21} strokeWidth={3} />}
        </span>
        <div>
          <p className="mlm-fireworks__title" lang={welcome ? "hi" : "en"}>
            {welcome ? "शुभ दीपावली!" : "Download complete!"}
          </p>
          <p className="mlm-fireworks__subtitle" lang={welcome ? "hi" : "en"}>
            {welcome ? "MLM LIVE की ओर से ढेरों शुभकामनाएं" : "Your design is ready. Let's celebrate!"}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CelebrationEffects() {
  const [celebration, setCelebration] = useState(null);
  const sequenceRef = useRef(0);
  const welcomeShownRef = useRef(false);
  const activeKindRef = useRef(null);
  const completeRef = useRef((id) => {
    setCelebration((current) => {
      if (current?.id !== id) return current;
      activeKindRef.current = null;
      return null;
    });
  });

  useEffect(() => {
    const show = (kind) => {
      if (document.visibilityState === "hidden") return;
      activeKindRef.current = kind;
      setCelebration({ kind, id: ++sequenceRef.current });
    };
    const onDownload = () => show("download");
    const onWelcome = () => {
      const season = getDiwaliSeasonState(Date.now(), import.meta.env.VITE_DIWALI_MODE || "auto");
      if (!season.enabled || welcomeShownRef.current || document.visibilityState === "hidden") return;
      // A download always takes priority. Welcome plays once per app load,
      // even if the kept-alive Home is remounted after switching companies.
      welcomeShownRef.current = true;
      if (activeKindRef.current !== "download") show("welcome");
    };
    const endWelcome = () => {
      if (activeKindRef.current !== "welcome") return;
      activeKindRef.current = null;
      setCelebration(null);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      activeKindRef.current = null;
      setCelebration(null);
    };
    window.addEventListener(DOWNLOAD_SUCCESS_EVENT, onDownload);
    window.addEventListener(HOME_CELEBRATION_EVENT, onWelcome);
    window.addEventListener(HOME_CELEBRATION_END_EVENT, endWelcome);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(DOWNLOAD_SUCCESS_EVENT, onDownload);
      window.removeEventListener(HOME_CELEBRATION_EVENT, onWelcome);
      window.removeEventListener(HOME_CELEBRATION_END_EVENT, endWelcome);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return celebration ? (
    <FireworksOverlay key={celebration.id} celebration={celebration} onComplete={completeRef.current} />
  ) : null;
}
