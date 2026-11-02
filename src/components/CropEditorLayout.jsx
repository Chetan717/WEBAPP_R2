import { createPortal } from "react-dom";
import { useRef } from "react";

export default function CropEditorLayout({
  workspaceRef,
  finalCrop,
  isDoing,
  isImageReady,
  progress,
  onCancel,
  onDone,
  children,
}) {
  const pressedAction = useRef(null);
  const armAction = (action) => { pressedAction.current = action; };
  const armLegacyAction = (action) => {
    if (typeof window === "undefined" || !("PointerEvent" in window)) armAction(action);
  };
  const activateAction = (action, event) => {
    // Ignore file-picker click-through; keyboard/assistive activation still works.
    if ((event?.detail || 0) > 0 && pressedAction.current !== action) return;
    pressedAction.current = null;
    if (action === "done") {
      if (!isDoing && isImageReady) onDone();
    } else onCancel();
  };
  const stopPropagation = (event) => event.stopPropagation();
  const content = (
    <div
      data-image-editor-open="true"
      data-react-aria-top-layer="true"
      className="mlmlive-crop-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={finalCrop ? "Final Crop" : "Crop Photo"}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onTouchStart={stopPropagation}
      onTouchEnd={stopPropagation}
      onKeyDown={stopPropagation}
      style={{ position: "fixed", inset: 0, zIndex: 2147483000, display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", width: "100%", height: "100dvh", minHeight: 0, overflow: "hidden", overscrollBehavior: "none", background: "#000000", color: "#ffffff", userSelect: "none", fontFamily: "'Figtree', sans-serif" }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, minHeight: 64, padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
        <button type="button" onPointerDown={() => armAction("cancel")} onMouseDown={() => armLegacyAction("cancel")} onTouchStart={() => armLegacyAction("cancel")} onPointerCancel={() => { pressedAction.current = null; }} onClick={(event) => activateAction("cancel", event)} aria-label="Cancel crop" style={{ width: 44, height: 44, background: "transparent", border: 0, borderRadius: 12, color: "#ffffff", cursor: "pointer", display: "grid", placeItems: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{finalCrop ? "Final Crop" : "Crop Photo"}</h2>
      </header>
      <div ref={workspaceRef} style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#000000" }}>
        {children}
      </div>
      <footer style={{ flexShrink: 0, width: "100%", padding: "16px 20px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderTop: "1px solid rgba(255,255,255,0.12)", background: "#000000" }}>
        <button type="button" onPointerDown={() => armAction("done")} onMouseDown={() => armLegacyAction("done")} onTouchStart={() => armLegacyAction("done")} onPointerCancel={() => { pressedAction.current = null; }} onClick={(event) => activateAction("done", event)} disabled={isDoing || !isImageReady} aria-busy={isDoing} style={{ width: "100%", maxWidth: 440, minHeight: 52, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 9, border: 0, borderRadius: 16, background: "linear-gradient(135deg,#2F80EA 0%,#236FDE 48%,#1454C5 100%)", color: "#ffffff", fontSize: 16, fontWeight: 700, cursor: isDoing || !isImageReady ? "default" : "pointer", opacity: isDoing || !isImageReady ? 0.55 : 1, touchAction: "manipulation" }}>
          {isDoing && <span aria-hidden="true" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#ffffff", borderRadius: "50%", animation: "crop-editor-spin .75s linear infinite" }} />}
          {isDoing ? `Saving ${progress}%` : "Done"}
        </button>
      </footer>
      <style>{".mlmlive-crop-overlay{height:100vh}@keyframes crop-editor-spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
  // Inline profile pages and transformed Modal parents must not determine the
  // crop's height or clip it. The top-layer marker also keeps parent modals
  // from treating crop interactions/focus as outside-dismiss events.
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

