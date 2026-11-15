// Shared by the profile and banner croppers. Avoid assuming a particular
// Android WebView version or allocating display buffers at a phone's full DPR.
export function getCropPixelRatio(value = globalThis.devicePixelRatio) {
  return Number.isFinite(value) ? Math.max(1, Math.min(2, value)) : 1;
}

export function releaseCropCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
}

export function observeCropWorkspace(element, measure) {
  let observer = null;
  if (element && typeof ResizeObserver === "function") {
    observer = new ResizeObserver(measure);
    observer.observe(element);
  }
  // Resize/orientation events also recover from the file picker changing the
  // visible viewport. Older WebViews need these without ResizeObserver.
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
  window.visualViewport?.addEventListener("resize", measure);
  const frame = requestAnimationFrame(measure);
  return () => {
    observer?.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", measure);
    window.removeEventListener("orientationchange", measure);
    window.visualViewport?.removeEventListener("resize", measure);
  };
}

export function getCropDecodeSize(width, height) {
  const scale = Math.min(1, 2048 / Math.max(width, height), Math.sqrt((2048 * 1536) / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function abortError() {
  return new DOMException("Photo loading cancelled", "AbortError");
}

function loadImageElement(url, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const image = new Image();
    // Local blob/data previews need no CORS mode. Remote saved photos still do
    // so that the eventual crop canvas can be exported.
    if (/^https?:/i.test(url)) image.crossOrigin = "anonymous";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ""; reject(error); }
      else resolve(image);
    };
    const onAbort = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error("Photo loading timed out. Please select a JPG, PNG or WebP photo again.")), 15000);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? null : new Error("Photo has no readable pixels."));
    image.onerror = () => finish(new Error("This photo could not be opened. Please select a JPG, PNG or WebP photo."));
    signal?.addEventListener("abort", onAbort, { once: true });
    image.src = url;
    if (image.complete && image.naturalWidth > 0) finish();
  });
}

function readDataUrl(blob, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const reader = new FileReader();
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const onAbort = () => { reader.abort(); cleanup(); reject(abortError()); };
    reader.onload = () => { const result = reader.result; cleanup(); resolve(result); };
    reader.onerror = () => { const error = reader.error; cleanup(); reject(error || new Error("Photo could not be read.")); };
    reader.onabort = () => { cleanup(); reject(abortError()); };
    signal?.addEventListener("abort", onAbort, { once: true });
    reader.readAsDataURL(blob);
  });
}

export async function loadCropImage(source, signal) {
  const blob = source instanceof Blob ? source : null;
  let ownedUrl = blob ? URL.createObjectURL(blob) : null;
  let image = null;
  let canvas = null;
  const dispose = () => {
    if (image) image.src = "";
    if (ownedUrl) { URL.revokeObjectURL(ownedUrl); ownedUrl = null; }
    releaseCropCanvas(canvas);
  };
  try {
    try {
      image = await loadImageElement(ownedUrl || source, signal);
    } catch (error) {
      if (!blob || error?.name === "AbortError" || signal?.aborted) throw error;
      // Certain embedded browsers reject local blob URLs. A single data-URL
      // retry opens the same bytes without uploading the photo anywhere.
      URL.revokeObjectURL(ownedUrl);
      ownedUrl = null;
      image = await loadImageElement(await readDataUrl(blob, signal), signal);
    }
    if (signal?.aborted) throw abortError();
    const size = getCropDecodeSize(image.naturalWidth, image.naturalHeight);
    if (size.width === image.naturalWidth && size.height === image.naturalHeight) {
      return { image, dispose };
    }
    // The first export is already 800px. Keep ample crop detail while freeing
    // the original multi-megapixel decoder before AI and repeated redraws.
    canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo preview is unavailable on this device. Please try a smaller photo.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);
    image.src = "";
    image = null;
    if (ownedUrl) { URL.revokeObjectURL(ownedUrl); ownedUrl = null; }
    return { image: canvas, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
