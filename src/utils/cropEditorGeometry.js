export const CROP_GUTTER = 20;
export const CROP_HANDLE_HIT = 36;
export const CROP_THEME_BLUE = "#2F80EA";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getCropViewportSize(width, height) {
  // Ignore transient/collapsed measurements instead of feeding a 1px canvas
  // back into ResizeObserver and enabling Done for an unusable crop.
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 100 || height < 100) {
    return null;
  }
  return {
    w: Math.max(1, Math.floor(Math.min(width, 480))),
    h: Math.max(1, Math.floor(Math.min(height, 640))),
  };
}

export function getTopAlignedCropBox(bounds, ratio) {
  const w = Math.min(bounds.w, bounds.h * ratio);
  return { x: bounds.x + (bounds.w - w) / 2, y: bounds.y, w, h: w / ratio };
}

function handlePositions(box) {
  const { x, y, w, h } = box;
  return {
    TL: [x, y], TR: [x + w, y], BL: [x, y + h], BR: [x + w, y + h],
    T: [x + w / 2, y], B: [x + w / 2, y + h],
    L: [x, y + h / 2], R: [x + w, y + h / 2],
  };
}

export function hitCropHandle(px, py, box) {
  if (!box) return null;
  const half = CROP_HANDLE_HIT / 2;
  let hit = null;
  let nearest = Infinity;
  for (const [name, [x, y]] of Object.entries(handlePositions(box))) {
    const distance = Math.hypot(px - x, py - y);
    if (Math.abs(px - x) <= half && Math.abs(py - y) <= half && distance < nearest) {
      hit = name;
      nearest = distance;
    }
  }
  return hit;
}

// Side handles keep the opposite edge fixed and preserve the banner's ratio.
export function resizeCropEdge(box, handle, px, py, ratio, bounds) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (handle === "T" || handle === "B") {
    const anchorY = handle === "T" ? box.y + box.h : box.y;
    const maxH = Math.min(
      handle === "T" ? anchorY - bounds.y : bounds.y + bounds.h - anchorY,
      (2 * Math.min(cx - bounds.x, bounds.x + bounds.w - cx)) / ratio,
    );
    const h = clamp(handle === "T" ? anchorY - py : py - anchorY, Math.min(60 / ratio, maxH), maxH);
    const w = h * ratio;
    return { x: cx - w / 2, y: handle === "T" ? anchorY - h : anchorY, w, h };
  }
  const anchorX = handle === "L" ? box.x + box.w : box.x;
  const maxW = Math.min(
    handle === "L" ? anchorX - bounds.x : bounds.x + bounds.w - anchorX,
    2 * Math.min(cy - bounds.y, bounds.y + bounds.h - cy) * ratio,
  );
  const w = clamp(handle === "L" ? anchorX - px : px - anchorX, Math.min(60, maxW), maxW);
  const h = w / ratio;
  return { x: handle === "L" ? anchorX - w : anchorX, y: cy - h / 2, w, h };
}

export function getCropExportSize(ratio, nativeLongestSide, finalCrop) {
  // Keep the initial 800px AI input unchanged. Final PNG keeps all available
  // source detail instead of reducing a larger cutout back to 800px.
  const target = finalCrop ? Math.max(800, Math.round(nativeLongestSide)) : 800;
  return {
    width: ratio >= 1 ? target : Math.max(1, Math.round(target * ratio)),
    height: ratio >= 1 ? Math.max(1, Math.round(target / ratio)) : target,
  };
}

function roundedRect(context, x, y, w, h, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

// Preview decoration only: this function is never used by the export canvas.
export function drawCropFrame(context, box, showGrid = false) {
  const { x, y, w, h } = box;
  context.save();
  if (showGrid) {
    context.strokeStyle = "rgba(255,255,255,0.26)";
    context.lineWidth = 0.7;
    for (let i = 1; i < 3; i++) {
      context.beginPath();
      context.moveTo(x + w * i / 3, y);
      context.lineTo(x + w * i / 3, y + h);
      context.moveTo(x, y + h * i / 3);
      context.lineTo(x + w, y + h * i / 3);
      context.stroke();
    }
  }
  context.strokeStyle = CROP_THEME_BLUE;
  context.lineWidth = 2;
  context.strokeRect(x, y, w, h);
  context.fillStyle = "#ffffff";
  context.lineWidth = 1.5;
  for (const [name, [hx, hy]] of Object.entries(handlePositions(box))) {
    if (name.length === 2) {
      context.beginPath();
      context.arc(hx, hy, 7, 0, Math.PI * 2);
    } else {
      const horizontal = name === "T" || name === "B";
      const hw = horizontal ? 22 : 7;
      const hh = horizontal ? 7 : 22;
      roundedRect(context, hx - hw / 2, hy - hh / 2, hw, hh, 3.5);
    }
    context.fill();
    context.stroke();
  }
  context.restore();
}
