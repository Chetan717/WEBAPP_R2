import CropEditorLayout from "../../../components/CropEditorLayout";
import { CROP_GUTTER, getCropViewportSize, getTopAlignedCropBox, hitCropHandle, resizeCropEdge, drawCropFrame, getCropExportSize } from "../../../utils/cropEditorGeometry";
import { encodeCropCanvas } from "../../../utils/cropCanvasEncoder";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "@heroui/react";
import { buildPhotoEnhanceFilter } from "../../../utils/photoEnhance";
import { isBonanzaFlowType, isRankPromotionType } from "../../../utils/templateTypeConfig";

// ── Helpers ───────────────────────────────────────────────────────
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function containDims(imgW, imgH, boxW, boxH) {
  const ia = imgW / imgH,
    ba = boxW / boxH;
  return ia > ba ? { dw: boxW, dh: boxW / ia } : { dw: boxH * ia, dh: boxH };
}

function getSelType() {
  try {
    return JSON.parse(localStorage.getItem("selType")) || {};
  } catch {
    return {};
  }
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Crop box helpers ──────────────────────────────────────────────
const MIN_BOX_W = 60;

function initBox(cw, ch, ratio) {
  return getTopAlignedCropBox({ x: CROP_GUTTER, y: CROP_GUTTER, w: Math.max(1, cw - CROP_GUTTER * 2), h: Math.max(1, ch - CROP_GUTTER * 2) }, ratio);
}

function initBoxInBounds(bounds, ratio) {
  return getTopAlignedCropBox(bounds, ratio);
}

// corner config: anchor getter + sign of drag direction
const CORNERS = {
  TL: { ax: (b) => b.x + b.w, ay: (b) => b.y + b.h, sx: -1, sy: -1 },
  TR: { ax: (b) => b.x, ay: (b) => b.y + b.h, sx: 1, sy: -1 },
  BL: { ax: (b) => b.x + b.w, ay: (b) => b.y, sx: -1, sy: 1 },
  BR: { ax: (b) => b.x, ay: (b) => b.y, sx: 1, sy: 1 },
};

function hitCorner(px, py, box) {
  return hitCropHandle(px, py, box);
}

function insideBox(px, py, box) {
  return (
    px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h
  );
}

function resizeBox(dragX, dragY, anchor, sx, sy, cw, ch, ratio, bounds) {
  let dw = (dragX - anchor.x) * sx;
  let dh = (dragY - anchor.y) * sy;
  let w, h;
  if (dw > 0 && dh > 0)
    dw / ratio >= dh
      ? ((w = dw), (h = dw / ratio))
      : ((h = dh), (w = dh * ratio));
  else if (dw > 0) {
    w = dw;
    h = dw / ratio;
  } else if (dh > 0) {
    h = dh;
    w = dh * ratio;
  } else {
    w = MIN_BOX_W;
    h = MIN_BOX_W / ratio;
  }
  w = Math.max(w, MIN_BOX_W);
  h = w / ratio;
  let x = sx > 0 ? anchor.x : anchor.x - w;
  let y = sy > 0 ? anchor.y : anchor.y - h;
  x = clamp(x, 0, cw - w);
  y = clamp(y, 0, ch - h);
  w = Math.min(w, cw - x);
  h = Math.min(h, ch - y);
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;
  if (bounds) {
    w = Math.min(w, bounds.w, bounds.h * ratio);
    h = w / ratio;
    x = clamp(x, bounds.x, bounds.x + bounds.w - w);
    y = clamp(y, bounds.y, bounds.y + bounds.h - h);
  }
  return { x, y, w, h };
}

function moveBox(box, dx, dy, cw, ch, bounds) {
  const limit = bounds || { x: 0, y: 0, w: cw, h: ch };
  return {
    ...box,
    x: clamp(box.x + dx, limit.x, limit.x + limit.w - box.w),
    y: clamp(box.y + dy, limit.y, limit.y + limit.h - box.h),
  };
}

// ── Component ─────────────────────────────────────────────────────
export default function ImageEditorCanvas({
  src,
  onDone,
  onCancel,
  setOpen,
  editingType,
  enableEnhance = false,
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [isDoing, setIsDoing] = useState(false);
  const [isImageReady, setIsImageReady] = useState(false);
  const [isViewportReady, setIsViewportReady] = useState(false);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [enhance, setEnhance] = useState(() => (enableEnhance ? 65 : 0));
  const [skinTone, setSkinTone] = useState(0);

  const selll = getSelType();
  const isMeeting =
    selll?.type === "Meeting" || selll?.type === "General_Meeting";
  const isCapping = selll?.type === "Capping";
  const isIncome = selll?.type === "Income";
  const isAnyversary = selll?.type === "Anniversary_Birthday";
  const isClosing = selll?.Subtype === "CLOSING";
  const isWelcome = selll?.Subtype === "WELCOME";
  const isBonanza = isBonanzaFlowType(selll?.type);
  const isAchv = selll?.type === "Achievements";
  const isRank = isRankPromotionType(selll?.type);
  const isTraining = selll?.type === "Training";
  const constrainCropToImage = !isAchv && !isIncome;

  const rankW = isMeeting
    ? 170
    : isCapping
      ? 150
      : isIncome
        ? 105
        : isAnyversary
          ? 145
          : isBonanza
            ? 140
            : isRank
              ? 150
              : isWelcome
                ? 150
                : isClosing
                  ? 150
                  : isTraining
                    ? 150
                    : 130;
  const rankH = isMeeting
    ? 220
    : isCapping
      ? 190
      : isIncome
        ? 195
        : isAnyversary
          ? 220
          : isClosing
            ? 190
            : isWelcome
              ? 205
              : isBonanza
                ? 200
                : isRank
                  ? 190
                  : isTraining
                    ? 190
                    : 150;

  const RATIO =
    editingType === "proof" || editingType === "feature"
      ? 1
      : editingType === "main"
        ? 2
        : rankW / rankH;

  // ── Refs ─────────────────────────────────────────────────────
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const offscreenRef = useRef(null); // cached image layer
  const offDirtyRef = useRef(true); // needs rebuild?
  const canvasSzRef = useRef({ w: 300, h: 340 });
  const appliedSzRef = useRef({ w: 0, h: 0, dpr: 0 }); // last applied canvas dims
  const cropBoxRef = useRef(null); // { x,y,w,h } in canvas px
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const rafRef = useRef(null);
  const progressTimerRef = useRef(null);
  const isDoingRef = useRef(false);
  const zoomRef = useRef(100);
  const rotRef = useRef(0);
  const flipHRef = useRef(false);
  const flipVRef = useRef(false);
  const enhanceRef = useRef(enableEnhance ? 65 : 0);
  const skinToneRef = useRef(0);

  useEffect(() => {
    zoomRef.current = zoom;
    offDirtyRef.current = true;
  }, [zoom]);
  useEffect(() => {
    rotRef.current = rotation;
    offDirtyRef.current = true;
  }, [rotation]);
  useEffect(() => {
    flipHRef.current = flipH;
    offDirtyRef.current = true;
  }, [flipH]);
  useEffect(() => {
    flipVRef.current = flipV;
    offDirtyRef.current = true;
  }, [flipV]);
  useEffect(() => {
    enhanceRef.current = enhance;
    offDirtyRef.current = true;
  }, [enhance]);
  useEffect(() => {
    skinToneRef.current = skinTone;
    offDirtyRef.current = true;
  }, [skinTone]);

  // ── Canvas sizing ─────────────────────────────────────────────
  const [canvasW, setCanvasW] = useState(300);
  const [canvasH, setCanvasH] = useState(340);

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const size = getCropViewportSize(width, height);
      setIsViewportReady(Boolean(size));
      if (!size) return;
      const { w: cw, h: ch } = size;
      if (cw !== canvasSzRef.current.w || ch !== canvasSzRef.current.h) {
        canvasSzRef.current = { w: cw, h: ch };
        cropBoxRef.current = initialCropBox(imgRef.current, cw, ch);
        offDirtyRef.current = true;
        setCanvasW(cw);
        setCanvasH(ch);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [RATIO]);

  // ── Image dim computation ─────────────────────────────────────
  function imgDims(img, cw, ch, rot, z) {
    const rot90 = rot % 180 !== 0;
    const bw = rot90 ? ch : cw,
      bh = rot90 ? cw : ch;
    const { dw, dh } = containDims(img.naturalWidth, img.naturalHeight, Math.max(1, bw - CROP_GUTTER * 2), Math.max(1, bh - CROP_GUTTER * 2));
    return { dw: dw * (z / 100), dh: dh * (z / 100) };
  }

  function getImageBounds(img, cw, ch) {
    if (!img) return null;
    const { dw, dh } = imgDims(
      img,
      cw,
      ch,
      rotRef.current,
      zoomRef.current,
    );
    const left = (cw - dw) / 2;
    const top = (ch - dh) / 2;
    const x = Math.max(CROP_GUTTER, left);
    const y = Math.max(CROP_GUTTER, top);
    return {
      x,
      y,
      w: Math.max(1, Math.min(cw - CROP_GUTTER, left + dw) - x),
      h: Math.max(1, Math.min(ch - CROP_GUTTER, top + dh) - y),
    };
  }

  function getCropBounds(img, cw, ch) {
    return constrainCropToImage ? getImageBounds(img, cw, ch) : null;
  }

  function initialCropBox(img, cw, ch) {
    const bounds = getImageBounds(img, cw, ch);
    return bounds ? initBoxInBounds(bounds, RATIO) : initBox(cw, ch, RATIO);
  }

  // ── Rebuild offscreen (image layer cache) ─────────────────────
  function rebuildOffscreen(img, cw, ch, dpr) {
    const rot = rotRef.current,
      fH = flipHRef.current,
      fV = flipVRef.current,
      z = zoomRef.current;
    const oc = document.createElement("canvas");
    oc.width = cw * dpr;
    oc.height = ch * dpr;
    const ctx = oc.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const { dw, dh } = imgDims(img, cw, ch, rot, z);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(fH ? -1 : 1, fV ? -1 : 1);
    ctx.filter = buildPhotoEnhanceFilter(
      enhanceRef.current,
      skinToneRef.current,
    );
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = "none";
    ctx.restore();
    return oc;
  }

  // ── Draw ─────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas) return;

    const { w: cw, h: ch } = canvasSzRef.current;
    const dpr = window.devicePixelRatio || 1;

    // Apply canvas dimensions only when changed (avoids expensive reset every frame)
    const ap = appliedSzRef.current;
    if (ap.w !== cw || ap.h !== ch || ap.dpr !== dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      appliedSzRef.current = { w: cw, h: ch, dpr };
      offDirtyRef.current = true;
      cropBoxRef.current = initialCropBox(img, cw, ch);
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform fast
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw cached image layer
    if (img) {
      if (offDirtyRef.current || !offscreenRef.current) {
        offscreenRef.current = rebuildOffscreen(img, cw, ch, dpr);
        offDirtyRef.current = false;
      }
      ctx.drawImage(offscreenRef.current, 0, 0);
    }

    // 2. Draw crop overlay
    const box = cropBoxRef.current || initialCropBox(img, cw, ch);
    const { x: fx, y: fy, w: fw, h: fh } = box;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clip everything to the canvas bounds so handles never bleed outside
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();

    // Dim outside
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, cw, fy);
    ctx.fillRect(0, fy + fh, cw, ch - fy - fh);
    ctx.fillRect(0, fy, fx, fh);
    ctx.fillRect(fx + fw, fy, cw - fx - fw, fh);

    drawCropFrame(ctx, box, Boolean(dragRef.current));

    ctx.restore();
  }, [RATIO]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // ── Load image ────────────────────────────────────────────────
  useEffect(() => {
    setIsImageReady(false);
    if (!currentSrc) return;
    imgRef.current = null;
    offscreenRef.current = null;
    offDirtyRef.current = true;
    zoomRef.current = 100;
    setZoom(100);
    rotRef.current = 0;
    setRotation(0);
    flipHRef.current = false;
    setFlipH(false);
    flipVRef.current = false;
    setFlipV(false);
    const defaultEnhance = enableEnhance ? 65 : 0;
    enhanceRef.current = defaultEnhance;
    setEnhance(defaultEnhance);
    skinToneRef.current = 0;
    setSkinTone(0);
    isDoingRef.current = false;
    setIsDoing(false);
    const { w: cw, h: ch } = canvasSzRef.current;
    cropBoxRef.current = initBox(cw, ch, RATIO);

    const img = new Image();
    img.crossOrigin = "anonymous";
    let url = null;

    const doLoad = () => {
      imgRef.current = img;
      setIsImageReady(true);
      const { w: cw, h: ch } = canvasSzRef.current;
      cropBoxRef.current = initialCropBox(img, cw, ch);
      offDirtyRef.current = true;
      scheduleDraw();
    };

    img.onload = doLoad;
    img.onerror = () => {
      setIsImageReady(false);
      toast.danger("Selected photo could not be loaded. Please choose it again.");
    };
    if (currentSrc instanceof Blob) {
      url = URL.createObjectURL(currentSrc);
      img.src = url;
    } else img.src = currentSrc;
    if (img.complete && img.naturalWidth > 0) doLoad();
    return () => {
      img.onload = null;
      img.onerror = null;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSrc]);

  useEffect(() => {
    const defaultEnhance = enableEnhance ? 65 : 0;
    enhanceRef.current = defaultEnhance;
    setEnhance(defaultEnhance);
  }, [enableEnhance, currentSrc]);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  useEffect(
    () => () => {
      clearInterval(progressTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (imgRef.current) scheduleDraw();
  }, [
    rotation,
    flipH,
    flipV,
    zoom,
    enhance,
    skinTone,
    canvasW,
    canvasH,
    scheduleDraw,
  ]);

  // ── Pointer helpers ───────────────────────────────────────────
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { px: cx - rect.left, py: cy - rect.top };
  };

  const onDown = (e) => {
    e.preventDefault();
    if (!isImageReady || !isViewportReady || isDoing) return;
    if (e.touches && e.touches.length >= 2) {
      pinchRef.current = {
        dist: getTouchDist(e.touches),
        zoom0: zoomRef.current,
      };
      dragRef.current = null;
      return;
    }
    pinchRef.current = null;
    const { px, py } = getPos(e);
    const box = cropBoxRef.current;
    const corner = hitCorner(px, py, box);
    if (corner && !CORNERS[corner]) {
      dragRef.current = { mode: "resize-edge", handle: corner, box0: { ...box } };
    } else if (corner) {
      const { ax, ay, sx, sy } = CORNERS[corner];
      dragRef.current = {
        mode: "resize",
        corner,
        anchor: { x: ax(box), y: ay(box) },
        sx,
        sy,
      };
    } else if (insideBox(px, py, box)) {
      dragRef.current = { mode: "move", px, py, box0: { ...box } };
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    }
  };

  const onMove = (e) => {
    e.preventDefault();
    if (e.touches && e.touches.length >= 2 && pinchRef.current) {
      const newDist = getTouchDist(e.touches);
      const newZoom = clamp(
        Math.round((pinchRef.current.zoom0 * newDist) / pinchRef.current.dist),
        100,
        300,
      );
      zoomRef.current = newZoom;
      setZoom(newZoom);
      offDirtyRef.current = true;
      scheduleDraw();
      return;
    }
    if (!dragRef.current) return;
    const { px, py } = getPos(e);
    const { w: cw, h: ch } = canvasSzRef.current;
    const bounds = getCropBounds(imgRef.current, cw, ch) || { x: CROP_GUTTER, y: CROP_GUTTER, w: Math.max(1, cw - CROP_GUTTER * 2), h: Math.max(1, ch - CROP_GUTTER * 2) };
    const d = dragRef.current;
    if (d.mode === "resize-edge") {
      cropBoxRef.current = resizeCropEdge(d.box0, d.handle, px, py, RATIO, bounds);
    } else if (d.mode === "resize") {
      cropBoxRef.current = resizeBox(
        px,
        py,
        d.anchor,
        d.sx,
        d.sy,
        cw,
        ch,
        RATIO,
        bounds,
      );
    } else {
      cropBoxRef.current = moveBox(
        d.box0,
        px - d.px,
        py - d.py,
        cw,
        ch,
        bounds,
      );
    }
    scheduleDraw();
  };

  const onUp = (e) => {
    if (e?.touches?.length > 0) {
      if (e.touches.length < 2) pinchRef.current = null;
      return;
    }
    pinchRef.current = null;
    dragRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    scheduleDraw();
  };

  // ── Export ────────────────────────────────────────────────────
  const handleDone = () => {
    if (isDoingRef.current || !isImageReady || !isViewportReady) return;
    const img = imgRef.current;
    if (!img) {
      toast("Photo is still loading. Please wait a moment.");
      return;
    }
    isDoingRef.current = true;
    setIsDoing(true);
    setEncodeProgress(0);

    // Animate progress 0 → 85 while toBlob encodes
    let p = 0;
    clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      p = Math.min(p + (p < 40 ? 10 : p < 70 ? 4 : 1), 85);
      setEncodeProgress(p);
    }, 150);

    const rot = rotRef.current,
      fH = flipHRef.current,
      fV = flipVRef.current,
      z = zoomRef.current;
    const { w: cw, h: ch } = canvasSzRef.current;
    const box = cropBoxRef.current || initBox(cw, ch, RATIO);

    const { dw, dh } = imgDims(img, cw, ch, rot, z);
    const nativeLongestSide = Math.max(box.w, box.h) * img.naturalWidth / dw;
    const { width: outW, height: outH } = getCropExportSize(RATIO, nativeLongestSide, enableEnhance);
    const scale = outW / box.w;

    const cropCX = box.x + box.w / 2;
    const cropCY = box.y + box.h / 2;
    // Match the centred preview image exactly when exporting.
    const imgCX = outW / 2 + (cw / 2 - cropCX) * scale;
    const imgCY = outH / 2 + (ch / 2 - cropCY) * scale;

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");
    if (!ctx) {
      clearInterval(progressTimerRef.current);
      isDoingRef.current = false;
      setIsDoing(false);
      setEncodeProgress(0);
      toast.danger("Photo editor could not start. Please tap Done again.");
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.save();
    ctx.translate(imgCX, imgCY);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(fH ? -1 : 1, fV ? -1 : 1);
    ctx.filter = buildPhotoEnhanceFilter(
      enhanceRef.current,
      skinToneRef.current,
    );
    ctx.drawImage(
      img,
      (-dw * scale) / 2,
      (-dh * scale) / 2,
      dw * scale,
      dh * scale,
    );
    ctx.filter = "none";
    ctx.restore();

    // The second/final crop contains the transparent remove-bg result. Lossy
    // WebP can bleed light RGB/chroma into transparent edge pixels and recreate
    // a white halo when the cutout is placed on a dark banner. Preserve that
    // edge losslessly as PNG; the initial photo crop can stay compact WebP.
    const exportType = enableEnhance ? "image/png" : "image/webp";
    void encodeCropCanvas(
      out,
      exportType,
      exportType === "image/webp" ? 0.92 : undefined,
    ).then((blob) => {
        clearInterval(progressTimerRef.current);
        if (!blob) {
          // A few Android WebViews occasionally return null from canvas.toBlob.
          // Retry synchronously through a data URL so Done never appears stuck.
          try {
            const dataUrl = out.toDataURL(
              exportType,
              exportType === "image/webp" ? 0.92 : undefined,
            );
            const [header, encoded] = dataUrl.split(",");
            const mime = header.match(/data:([^;]+)/)?.[1] || exportType;
            const binary = atob(encoded);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            blob = new Blob([bytes], { type: mime });
          } catch (error) {
            console.error("[ImageEditorCanvas] Photo encoding failed:", error);
          }
        }

        if (!blob) {
          isDoingRef.current = false;
          setIsDoing(false);
          setEncodeProgress(0);
          toast.danger("Photo could not be saved. Please tap Done again.");
          return;
        }

        // Encoding is complete: apply and close on this same task. Holding the
        // crop screen for another 180ms made Done feel unresponsive on phones.
        setEncodeProgress(100);
        isDoingRef.current = false;
        try {
          const shouldClose = onDone?.(blob) !== false;
          if (shouldClose) setOpen(false);
        } catch (error) {
          console.error("[ImageEditorCanvas] Done callback failed:", error);
          toast.danger("Photo could not be applied. Please try again.");
        } finally {
          setIsDoing(false);
          setEncodeProgress(0);
        }
      }).catch((error) => {
        clearInterval(progressTimerRef.current);
        console.error("[ImageEditorCanvas] Crop encoding failed:", error);
        isDoingRef.current = false;
        setIsDoing(false);
        setEncodeProgress(0);
        toast.danger("Photo could not be saved. Please tap Done again.");
      });
  };

  const onCancelClick = () => {
    setOpen(false);
    onCancel();
  };

  // ── UI ────────────────────────────────────────────────────────
  return (
    <CropEditorLayout
      workspaceRef={containerRef}
      finalCrop={enableEnhance}
      isDoing={isDoing}
      isImageReady={isImageReady && isViewportReady}
      progress={encodeProgress}
      onCancel={onCancelClick}
      onDone={handleDone}
    >
      <canvas
        ref={canvasRef}
        aria-label="Photo crop area"
        style={{ touchAction: "none", display: "block", cursor: "grab" }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
        onTouchCancel={onUp}
      />
    </CropEditorLayout>
  );
}
