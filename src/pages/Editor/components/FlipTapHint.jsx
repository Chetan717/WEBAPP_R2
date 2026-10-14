import React from "react";
import "./FlipTapHint.css";

/** Purely visual onboarding cue. pointer-events:none lets Konva receive taps. */
export default function FlipTapHint({ target, position, delayMs = 0 }) {
  if (!position) return null;
  return (
    <div
      className="mlmlive-flip-tap-hint"
      data-flip-hint={target}
      aria-hidden="true"
      style={{
        left: `${(position.x / 320) * 100}%`,
        top: `${(position.y / 320) * 100}%`,
        "--flip-hint-delay": `${delayMs}ms`,
      }}
    >
      <span className="mlmlive-flip-tap-hint__ring" />
      <span className="mlmlive-flip-tap-hint__hand">
        {/* Self-contained pointer-hand SVG; independent of lucide-react icon versions. */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
          aria-hidden="true"
        >
          <path d="M9.5 12.5V6a1.75 1.75 0 0 1 3.5 0v7" />
          <path d="M13 11a1.75 1.75 0 0 1 3.5 0v2" />
          <path d="M16.5 12.5a1.75 1.75 0 0 1 3.5 0V16c0 3.6-2.5 6-6 6h-1.4c-1.9 0-3.2-.7-4.3-2l-3.1-3.6a1.7 1.7 0 0 1 2.6-2.2l1.7 1.9" />
          <path d="M5.5 8H3.7M6.5 4.8 5.2 3.6M10 2.5V1" />
        </svg>
      </span>
      <span className="mlmlive-flip-tap-hint__label">Tap to flip</span>
    </div>
  );
}
