import { toast } from "@heroui/react";
import CropEditorLayout from "../../components/CropEditorLayout";
import { CROP_GUTTER, getCropViewportSize, getTopAlignedCropBox, hitCropHandle, resizeCropEdge, drawCropFrame, getCropExportSize } from "../../utils/cropEditorGeometry";
import { encodeCropCanvas } from "../../utils/cropCanvasEncoder";

import { useState, useRef, useCallback, useEffect } from "react";
import { buildPhotoEnhanceFilter } from "../../utils/photoEnhance";

// ── Helpers ───────────────────────────────────────────────────────
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function containDims(imgW, imgH, boxW, boxH) {
  const ia = imgW / imgH;
  const ba = boxW / boxH;

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

const CORNERS = {
  TL: {
    ax: (box) => box.x + box.w,
    ay: (box) => box.y + box.h,
    sx: -1,
    sy: -1,
  },
  TR: {
    ax: (box) => box.x,
    ay: (box) => box.y + box.h,
    sx: 1,
    sy: -1,
  },
  BL: {
    ax: (box) => box.x + box.w,
    ay: (box) => box.y,
    sx: -1,
    sy: 1,
  },
  BR: {
    ax: (box) => box.x,
    ay: (box) => box.y,
    sx: 1,
    sy: 1,
  },
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
  let w;
  let h;

  if (dw > 0 && dh > 0) {
    if (dw / ratio >= dh) {
      w = dw;
      h = dw / ratio;
    } else {
      h = dh;
      w = dh * ratio;
    }
  } else if (dw > 0) {
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

  if (w / h > ratio) {
    w = h * ratio;
  } else {
    h = w / ratio;
  }

  if (bounds) {
    w = Math.min(w, bounds.w, bounds.h * ratio);
    h = w / ratio;

    x = clamp(x, bounds.x, bounds.x + bounds.w - w);

    y = clamp(y, bounds.y, bounds.y + bounds.h - h);
  }

  return { x, y, w, h };
}

function moveBox(box, dx, dy, cw, ch, bounds) {
  const limit = bounds || {
    x: 0,
    y: 0,
    w: cw,
    h: ch,
  };

  return {
    ...box,
    x: clamp(box.x + dx, limit.x, limit.x + limit.w - box.w),
    y: clamp(box.y + dy, limit.y, limit.y + limit.h - box.h),
  };
}

// ── Component ─────────────────────────────────────────────────────
export function ImageEditorCanvas({
  src,
  onDone,
  onCancel,
  editingType,
  constrainToImage = true,
  enableEnhance = false,
}) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [enhance, setEnhance] = useState(() => (enableEnhance ? 65 : 0));
  const [skinTone, setSkinTone] = useState(0);
  const [isDoing, setIsDoing] = useState(false);
  const [isImageReady, setIsImageReady] = useState(false);
  const [isViewportReady, setIsViewportReady] = useState(false);
  const [encodeProgress, setEncodeProgress] = useState(0);


  const rankW = 175;

  const rankH = 230;

  // Width ÷ Height based crop ratio
  const RATIO =
    editingType === "proof" || editingType === "feature"
      ? 1
      : editingType === "main"
        ? 2
        : rankW / rankH;

  const [canvasW, setCanvasW] = useState(300);
  const [canvasH, setCanvasH] = useState(Math.round(300 / RATIO));

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const offscreenRef = useRef(null);
  const offDirtyRef = useRef(true);

  const canvasSzRef = useRef({
    w: 300,
    h: Math.round(300 / RATIO),
  });

  const appliedSzRef = useRef({
    w: 0,
    h: 0,
    dpr: 0,
  });

  const cropBoxRef = useRef(initBox(300, Math.round(300 / RATIO), RATIO));

  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const rafRef = useRef(null);
  const progressTimerRef = useRef(null);
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

  // ── Responsive canvas sizing ───────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;

      const { width, height } = containerRef.current.getBoundingClientRect();
      const size = getCropViewportSize(width, height);
      setIsViewportReady(Boolean(size));
      if (!size) return;
      const { w: cw, h: ch } = size;

      if (cw !== canvasSzRef.current.w || ch !== canvasSzRef.current.h) {
        canvasSzRef.current = {
          w: cw,
          h: ch,
        };

        cropBoxRef.current = initialCropBox(imgRef.current, cw, ch);

        offDirtyRef.current = true;
        setCanvasW(cw);
        setCanvasH(ch);
      }
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [RATIO]);

  // ── Image dimension computation ───────────────────────────────
  function imgDims(img, cw, ch, rot, zoomValue) {
    const rot90 = rot % 180 !== 0;
    const boxWidth = rot90 ? ch : cw;
    const boxHeight = rot90 ? cw : ch;

    const { dw, dh } = containDims(
      img.naturalWidth,
      img.naturalHeight,
      Math.max(1, boxWidth - CROP_GUTTER * 2),
      Math.max(1, boxHeight - CROP_GUTTER * 2),
    );

    return {
      dw: dw * (zoomValue / 100),
      dh: dh * (zoomValue / 100),
    };
  }

  function getImageBounds(img, cw, ch) {
    if (!img) {
      return null;
    }

    const { dw, dh } = imgDims(img, cw, ch, rotRef.current, zoomRef.current);

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
    return constrainToImage ? getImageBounds(img, cw, ch) : null;
  }

  function initialCropBox(img, cw, ch) {
    const bounds = getImageBounds(img, cw, ch);

    return bounds ? initBoxInBounds(bounds, RATIO) : initBox(cw, ch, RATIO);
  }

  // ── Rebuild offscreen image cache ─────────────────────────────
  function rebuildOffscreen(img, cw, ch, dpr) {
    const rot = rotRef.current;
    const fH = flipHRef.current;
    const fV = flipVRef.current;
    const currentZoom = zoomRef.current;

    const offscreenCanvas = document.createElement("canvas");

    offscreenCanvas.width = cw * dpr;
    offscreenCanvas.height = ch * dpr;

    const ctx = offscreenCanvas.getContext("2d");

    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const { dw, dh } = imgDims(img, cw, ch, rot, currentZoom);

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

    return offscreenCanvas;
  }

  // ── Draw ───────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;

    if (!canvas) return;

    const { w: cw, h: ch } = canvasSzRef.current;

    const dpr = window.devicePixelRatio || 1;
    const appliedSize = appliedSzRef.current;

    if (
      appliedSize.w !== cw ||
      appliedSize.h !== ch ||
      appliedSize.dpr !== dpr
    ) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;

      appliedSzRef.current = {
        w: cw,
        h: ch,
        dpr,
      };

      offDirtyRef.current = true;

      cropBoxRef.current = initialCropBox(img, cw, ch);
    }

    const ctx = canvas.getContext("2d");

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (img) {
      if (offDirtyRef.current || !offscreenRef.current) {
        offscreenRef.current = rebuildOffscreen(img, cw, ch, dpr);

        offDirtyRef.current = false;
      }

      ctx.drawImage(offscreenRef.current, 0, 0);
    }

    const box = cropBoxRef.current || initialCropBox(img, cw, ch);

    const { x: fx, y: fy, w: fw, h: fh } = box;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.clip();

    // Dim outside crop area
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, cw, fy);
    ctx.fillRect(0, fy + fh, cw, ch - fy - fh);
    ctx.fillRect(0, fy, fx, fh);
    ctx.fillRect(fx + fw, fy, cw - fx - fw, fh);

    drawCropFrame(ctx, box, Boolean(dragRef.current));

    ctx.restore();
  }, [RATIO]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }, [draw]);

  // ── Load image ─────────────────────────────────────────────────
  useEffect(() => {
    setIsImageReady(false);
    if (!src) return;

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

    setIsDoing(false);

    const { w: cw, h: ch } = canvasSzRef.current;

    cropBoxRef.current = initBox(cw, ch, RATIO);

    const img = new Image();
    img.crossOrigin = "anonymous";

    let objectUrl = null;

    const handleImageLoad = () => {
      imgRef.current = img;
      setIsImageReady(true);

      const { w, h } = canvasSzRef.current;

      cropBoxRef.current = initialCropBox(img, w, h);

      offDirtyRef.current = true;
      scheduleDraw();

    };

    img.onload = handleImageLoad;
    img.onerror = () => {
      setIsImageReady(false);
      toast.danger("Selected photo could not be loaded. Please choose it again.");
    };

    if (src instanceof Blob) {
      objectUrl = URL.createObjectURL(src);
      img.src = objectUrl;
    } else {
      img.src = src;
    }

    if (img.complete && img.naturalWidth > 0) {
      handleImageLoad();
    }

    return () => {
      img.onload = null;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, RATIO, scheduleDraw]);

  useEffect(() => {
    const defaultEnhance = enableEnhance ? 65 : 0;
    enhanceRef.current = defaultEnhance;
    setEnhance(defaultEnhance);
  }, [enableEnhance, src]);

  useEffect(() => {
    if (imgRef.current) {
      scheduleDraw();
    }
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

  // ── Pointer helpers ─────────────────────────────────────────────
  const getPosition = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();

    const clientX = event.touches ? event.touches[0].clientX : event.clientX;

    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    return {
      px: clientX - rect.left,
      py: clientY - rect.top,
    };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    if (!isImageReady || !isViewportReady || isDoing) return;

    if (event.touches && event.touches.length >= 2) {
      pinchRef.current = {
        dist: getTouchDist(event.touches),
        zoom0: zoomRef.current,
      };

      dragRef.current = null;
      return;
    }

    pinchRef.current = null;

    const { px, py } = getPosition(event);

    const box = cropBoxRef.current;
    const corner = hitCorner(px, py, box);

    if (corner && !CORNERS[corner]) {
      dragRef.current = { mode: "resize-edge", handle: corner, box0: { ...box } };
    } else if (corner) {
      const { ax, ay, sx, sy } = CORNERS[corner];

      dragRef.current = {
        mode: "resize",
        corner,
        anchor: {
          x: ax(box),
          y: ay(box),
        },
        sx,
        sy,
      };
    } else if (insideBox(px, py, box)) {
      dragRef.current = {
        mode: "move",
        px,
        py,
        box0: { ...box },
      };

      if (canvasRef.current) {
        canvasRef.current.style.cursor = "grabbing";
      }
    }
  };

  const handlePointerMove = (event) => {
    event.preventDefault();

    if (event.touches && event.touches.length >= 2 && pinchRef.current) {
      const newDistance = getTouchDist(event.touches);

      const newZoom = clamp(
        Math.round(
          (pinchRef.current.zoom0 * newDistance) / pinchRef.current.dist,
        ),
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

    const { px, py } = getPosition(event);

    const { w: cw, h: ch } = canvasSzRef.current;

    const bounds = getCropBounds(imgRef.current, cw, ch) || { x: CROP_GUTTER, y: CROP_GUTTER, w: Math.max(1, cw - CROP_GUTTER * 2), h: Math.max(1, ch - CROP_GUTTER * 2) };

    const drag = dragRef.current;

    if (drag.mode === "resize-edge") {
      cropBoxRef.current = resizeCropEdge(drag.box0, drag.handle, px, py, RATIO, bounds);
    } else if (drag.mode === "resize") {
      cropBoxRef.current = resizeBox(
        px,
        py,
        drag.anchor,
        drag.sx,
        drag.sy,
        cw,
        ch,
        RATIO,
        bounds,
      );
    } else {
      cropBoxRef.current = moveBox(
        drag.box0,
        px - drag.px,
        py - drag.py,
        cw,
        ch,
        bounds,
      );
    }

    scheduleDraw();
  };

  const handlePointerUp = (event) => {
    if (event?.touches?.length > 0) {
      if (event.touches.length < 2) {
        pinchRef.current = null;
      }

      return;
    }

    pinchRef.current = null;
    dragRef.current = null;

    if (canvasRef.current) {
      canvasRef.current.style.cursor = "grab";
    }
    scheduleDraw();
  };

  // ── Export ─────────────────────────────────────────────────────
  const handleDone = () => {
    if (isDoing || !isImageReady || !isViewportReady) return;

    const img = imgRef.current;
    if (!img) return;

    setIsDoing(true);
    setEncodeProgress(0);

    let progress = 0;

    clearInterval(progressTimerRef.current);

    progressTimerRef.current = setInterval(() => {
      progress = Math.min(
        progress + (progress < 40 ? 10 : progress < 70 ? 4 : 1),
        85,
      );

      setEncodeProgress(progress);
    }, 150);

    const rot = rotRef.current;
    const fH = flipHRef.current;
    const fV = flipVRef.current;
    const currentZoom = zoomRef.current;

    const { w: cw, h: ch } = canvasSzRef.current;

    const box = cropBoxRef.current;

    const { dw, dh } = imgDims(img, cw, ch, rot, currentZoom);
    const nativeLongestSide = Math.max(box.w, box.h) * img.naturalWidth / dw;
    const { width: outputWidth, height: outputHeight } = getCropExportSize(RATIO, nativeLongestSide, enableEnhance);
    const scale = outputWidth / box.w;

    const cropCenterX = box.x + box.w / 2;

    const cropCenterY = box.y + box.h / 2;

    const imageCenterX = outputWidth / 2 + (cw / 2 - cropCenterX) * scale;

    const imageCenterY = outputHeight / 2 + (ch / 2 - cropCenterY) * scale;

    const outputCanvas = document.createElement("canvas");

    outputCanvas.width = outputWidth;

    outputCanvas.height = outputHeight;

    const ctx = outputCanvas.getContext("2d");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.save();

    ctx.translate(imageCenterX, imageCenterY);

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

    // A transparent cutout must stay lossless. Lossy WebP colour compression
    // can recreate a pale fringe even though the alpha channel is valid.
    const exportType = enableEnhance ? "image/png" : "image/webp";
    void encodeCropCanvas(
      outputCanvas,
      exportType,
      exportType === "image/webp" ? 0.92 : undefined,
    ).then((blob) => {
        clearInterval(progressTimerRef.current);

        if (!blob) {
          setIsDoing(false);
          setEncodeProgress(0);
          toast.danger("Photo could not be saved. Please try again.");
          return;
        }
        // Avoid a second unnecessary delay after canvas encoding completes.
        setEncodeProgress(100);
        try {
          onDone(blob);
        } finally {
          setIsDoing(false);
          setEncodeProgress(0);
        }
      }).catch((error) => {
        clearInterval(progressTimerRef.current);
        console.error("[MLMProfileImageEditor] Crop encoding failed:", error);
        setIsDoing(false);
        setEncodeProgress(0);
        toast.danger("Photo could not be saved. Please try again.");
      });
  };

  return (
    <CropEditorLayout
      workspaceRef={containerRef}
      finalCrop={enableEnhance}
      isDoing={isDoing}
      isImageReady={isImageReady && isViewportReady}
      progress={encodeProgress}
      onCancel={onCancel}
      onDone={handleDone}
    >
      <canvas
        ref={canvasRef}
        aria-label="Photo crop area"
        style={{ touchAction: "none", display: "block", cursor: "grab" }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
      />
    </CropEditorLayout>
  );
}
