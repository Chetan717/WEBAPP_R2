import { useEffect, useState } from "react";

const SPLASH_GIF =
  "https://cdn.mlmposter.com/video/MLMLIVE_Diwali_Splash_Premium_Animated.gif";

export default function SplashScreen({ onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let doneTimer;

    const timer = setTimeout(() => {
      setVisible(false);
      doneTimer = setTimeout(onDone, 400);
    }, 4500);

    return () => {
      clearTimeout(timer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[99999] overflow-hidden text-white"
      style={{
        backgroundColor: "#071b43",
        backgroundImage: `url("${SPLASH_GIF}")`,
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.4s ease",
      }}
    >
      <div className="absolute bottom-10 left-0 right-0 text-center text-[11px] font-semibold tracking-[0.1em] text-white/55">
        MADE IN INDIA
      </div>
    </div>
  );
}
