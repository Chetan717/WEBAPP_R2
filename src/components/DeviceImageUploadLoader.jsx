import { useEffect, useRef, useState } from "react";

const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|heic|heif)$/i;

export default function DeviceImageUploadLoader() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const runRef = useRef(0);

  useEffect(() => {
    let interval = null;
    let deadline = null;
    let hideTimer = null;
    const clearTimers = () => {
      window.clearInterval(interval);
      window.clearTimeout(deadline);
      window.clearTimeout(hideTimer);
    };
    const finish = () => {
      const run = runRef.current;
      clearTimers();
      setProgress(100);
      hideTimer = window.setTimeout(() => {
        if (run !== runRef.current) return;
        setVisible(false);
        setProgress(0);
      }, 180);
    };
    const onFileChange = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
      const imageFile = Array.from(input.files || []).find(
        (file) => file.type.startsWith("image/") || IMAGE_EXTENSION.test(file.name),
      );
      if (!imageFile) return;
      runRef.current += 1;
      clearTimers();
      setProgress(8);
      setVisible(true);
      interval = window.setInterval(() => {
        setProgress((value) => Math.min(94, value + Math.max(1, Math.round((95 - value) / 6))));
      }, 90);
      // The cropper owns the one actual decode and signals readiness. Do not
      // decode the full camera photo again here just to animate a loader.
      // Other image pickers still get a bounded loader instead of a stuck UI.
      deadline = window.setTimeout(finish, 1800);
    };
    document.addEventListener("change", onFileChange, true);
    document.addEventListener("mlmlive:crop-image-ready", finish);
    return () => {
      runRef.current += 1;
      clearTimers();
      document.removeEventListener("change", onFileChange, true);
      document.removeEventListener("mlmlive:crop-image-ready", finish);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100200] flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Photo loading from device"
    >
      <div className="w-full max-w-[330px] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="bg-[linear-gradient(135deg,#2F80EA_0%,#236FDE_48%,#1454C5_100%)] px-5 py-3 text-white">
          <p className="text-[15px] font-extrabold">Preparing Photo</p>
          <p className="mt-0.5 text-[10px] font-medium text-white/80">Opening the photo editor</p>
        </div>
        <div className="p-5 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#2F80EA]/20 border-t-[#2F80EA]" />
          <p className="text-[16px] font-extrabold text-foreground">Loading photo from your device…</p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">Please wait while the photo editor is being prepared</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#2F80EA_0%,#236FDE_55%,#1454C5_100%)] transition-[width] duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] font-bold text-accent">{progress}%</p>
        </div>
      </div>
    </div>
  );
}
