import { useRef, useState, useEffect } from "react";
import { toast } from "@heroui/react";
import { preloadBgModel, removeBg } from "../utils/removeBg";
import { validateUploadFile } from "../../../lib/fileValidation";
import RemoveBgLoadingOverlay from "./RemoveBgLoadingOverlay";

const photoOwners = new WeakMap();

export default function ImageUploadWithBgRemove({
  onImageReady,
  setEditingImage,
  setOnImageDone,
  currentImage,
  onRequestReEdit,
  setOpen,
  open,
  type,
  editingType,
  setEditingType,
  setEnhanceEnabled,
  onProcessingChange,
  skipBackgroundRemoval = false,
  guideTarget,
}) {
  const inputRef = useRef();
  const abortRef = useRef(null);
  const processingRef = useRef(false);
  const processingIdRef = useRef(0);
  const processingStateRef = useRef({
    active: false,
    previewUrl: null,
    progressMessage: "",
    progressPct: 0,
    onCancel: null,
  });
  const [load, setLoad] = useState(false);
  const [progressMsg, setProgressMsg] = useState("Please wait…");
  const [progressPct, setProgressPct] = useState(0);
  const [dots, setDots] = useState("");
  const [processingPreview, setProcessingPreview] = useState(null);

  // Begin the quality model download as soon as the photo/editor control is on
  // screen. There is no short timeout downgrade; removeBg() reuses this exact
  // preload when the user finishes the crop.
  useEffect(() => {
    if (skipBackgroundRemoval) return undefined;
    void preloadBgModel().catch(() => {
      // The processing action owns retry/error UI. Preload stays silent.
    });
    return undefined;
  }, [skipBackgroundRemoval]);

  useEffect(() => {
    if (!load) { setDots(""); return; }
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => clearInterval(id);
  }, [load]);

  function getSelType() {
    try { return JSON.parse(localStorage.getItem("selType")) || {}; }
    catch { return {}; }
  }
  const selll = getSelType();
  const isAchv = selll?.type === "Achievements";

  const publishProcessing = (patch) => {
    const next = { ...processingStateRef.current, ...patch };
    processingStateRef.current = next;
    onProcessingChange?.(next);
  };

  const inputJobRef = useRef(null);
  const [src, setPreviewSrc] = useState(null);
  useEffect(() => {
    const url = currentImage instanceof Blob ? URL.createObjectURL(currentImage) : currentImage;
    setPreviewSrc(url);
    return () => { if (currentImage instanceof Blob && url) URL.revokeObjectURL(url); };
  }, [currentImage]);
  const owns = job => inputJobRef.current === job && photoOwners.get(setEditingImage) === job;
  const cancelRemoveBg = (job = inputJobRef.current) => {
    if (!owns(job)) return;
    job.controller?.abort(); photoOwners.delete(setEditingImage);
    processingRef.current = false; abortRef.current = null;
    setLoad(false); setProcessingPreview(null); setProgressPct(0);
    publishProcessing({ active: false, previewUrl: null, progressMessage: '', progressPct: 0, onCancel: null });
    setEditingImage(null); setOnImageDone(null); setEnhanceEnabled?.(false); setOpen(false);
    toast('Background removal cancelled.');
  };
  const openFinalCrop = (image, canEnhance, job) => {
    if (!owns(job)) return;
    let accepted = false;
    setEnhanceEnabled?.(canEnhance); setEditingImage(image);
    setOnImageDone(() => finalBlob => {
      if (accepted || !owns(job)) return false;
      accepted = true; onImageReady(finalBlob);
      setEnhanceEnabled?.(false); setEditingImage(null);
      return true;
    });
    setOpen(true);
  };
  const removeBackgroundAfterCrop = (croppedBlob, job) => {
    if (!croppedBlob || !owns(job) || job.busy) return false;
    job.busy = true; processingRef.current = true;
    const controller = new AbortController(); job.controller = controller; abortRef.current = controller;
    const previewUrl = URL.createObjectURL(croppedBlob);
    setProcessingPreview(previewUrl); setLoad(true); setProgressMsg('AI आपकी फोटो तैयार कर रहा है…'); setProgressPct(0);
    const publish = (stage, pct) => {
      if (!owns(job) || controller.signal.aborted) return;
      setProgressMsg(stage); setProgressPct(pct);
      publishProcessing({ active: true, previewUrl, progressMessage: stage, progressPct: pct, onCancel: () => cancelRemoveBg(job) });
    };
    publish('AI आपकी फोटो तैयार कर रहा है…', 0);
    // Retain the same crop surface behind the overlay. A source swap starts the
    // final crop without closing/reopening either the form or modal.
    (async () => {
      let result;
      try {
        result = await removeBg(croppedBlob, publish, controller.signal);
      } catch (error) {
        if (owns(job) && !controller.signal.aborted && error?.name !== 'AbortError') {
          toast.danger('Background removal failed. Please tap Done to retry.');
        }
      } finally {
        URL.revokeObjectURL(previewUrl);
        if (owns(job)) {
          job.busy = false; job.controller = null; processingRef.current = false; abortRef.current = null;
          setLoad(false); setProgressMsg('Please wait…'); setProgressPct(0); setProcessingPreview(null);
          publishProcessing({ active: false, previewUrl: null, progressMessage: '', progressPct: 0, onCancel: null });
        }
      }
      if (result && owns(job) && !controller.signal.aborted) {
        openFinalCrop(result, true, job);
        toast('Adjust the final crop, then tap Done.');
      }
    })();
    return false;
  };
  const handleFile = file => {
    if (!file) return;
    const validation = validateUploadFile(file, 'image');
    if (!validation.valid) { toast.danger(validation.error || 'Invalid image file.'); return; }
    photoOwners.get(setEditingImage)?.controller?.abort();
    const job = { busy: false, controller: null };
    photoOwners.set(setEditingImage, job); inputJobRef.current = job;
    if (typeof setEditingType === 'function') setEditingType(type);
    if (skipBackgroundRemoval) { openFinalCrop(file, false, job); return; }
    void preloadBgModel().catch(() => {});
    setEnhanceEnabled?.(false); setEditingImage(file);
    setOnImageDone(() => blob => removeBackgroundAfterCrop(blob, job)); setOpen(true);
  };

  return (
    <div data-guide={guideTarget}>
      {/* Upload box — always visible, non-interactive while loading */}
      {currentImage ? (
        <div
          onClick={() => !load && inputRef.current?.click()}
          className={`relative w-full h-[150px] rounded-2xl border-2 border-accent/40 overflow-hidden shadow-md transition-opacity ${load ? "opacity-40 pointer-events-none" : "cursor-pointer group"}`}
        >
          <img
            src={src}
            alt="Uploaded"
            className="w-full h-full object-contain bg-muted/20"
          />
          {!load && (
            <div className="absolute inset-0 bg-accent/60 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-1.5 rounded-[14px]">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                </svg>
              </div>
              <p className="text-white text-[11px] font-bold">Tap to change</p>
            </div>
          )}
          <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-green-500/80 backdrop-blur-sm">
            <p className="text-[9px] font-bold text-white uppercase tracking-wide">
              Uploaded
            </p>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !load && inputRef.current?.click()}
          className={`h-[150px] rounded-2xl border-2 border-dashed border-border bg-muted/20 transition-all duration-200 flex flex-col items-center justify-center gap-3 ${load ? "opacity-40 pointer-events-none" : "hover:border-accent/60 hover:bg-accent/5 cursor-pointer group"}`}
        >
          <div className="w-14 h-14 rounded-2xl bg-muted/40 border border-border group-hover:bg-accent/10 group-hover:border-accent/30 flex items-center justify-center transition-all duration-200">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground group-hover:text-accent transition-colors"
            >
              <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {isAchv ? "JPG, PNG, WEBP supported" : "Add Photo"}
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files[0];
          if (typeof setEditingType === "function") setEditingType(type);
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {load && !onProcessingChange && (
        <RemoveBgLoadingOverlay
          previewUrl={processingPreview}
          progressMessage={`${progressMsg}${dots}`}
          progressPct={progressPct}
          onCancel={() => cancelRemoveBg()}
        />
      )}
    </div>
  );
}
