import { useEffect, useRef, useState } from "react";

export default function SingleLineScrollLabel({ label, className = "" }) {
  const viewportRef = useRef(null);
  const textRef = useRef(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    let active = true;
    const measure = () => {
      if (!active || !viewportRef.current || !textRef.current) return;
      setOverflow(Math.max(0, textRef.current.scrollWidth - viewportRef.current.clientWidth));
    };
    measure();
    document.fonts?.ready?.then(measure);
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => { active = false; window.removeEventListener("resize", measure); };
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewportRef.current);
    observer.observe(textRef.current);
    return () => { active = false; observer.disconnect(); };
  }, [label]);

  return (
    <div
      ref={viewportRef}
      title={label}
      className={`w-full overflow-hidden whitespace-nowrap motion-reduce:overflow-x-auto ${className}`}
    >
      <span
        ref={textRef}
        className={`block w-max min-w-full whitespace-nowrap text-center ${overflow > 1 ? "home-card-label-pan" : ""}`}
        style={{ "--home-card-label-overflow": `${overflow}px` }}
      >
        {label}
      </span>
    </div>
  );
}
