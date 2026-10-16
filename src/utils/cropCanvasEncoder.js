/*
 * Lossless final PNG and original-quality initial WebP crop encoder.
 * Keeps large canvas encoding off the UI thread where OffscreenCanvas workers
 * are supported (Chrome/Android). Gracefully falls back to canvas.toBlob on
 * Safari/older Android and worker failures. No resolution/format changes.
 */
let worker = null;
let nextId = 0;
const pending = new Map();

function failWorker(error) {
  for (const [id, item] of pending) {
    clearTimeout(item.timer);
    pending.delete(id);
    item.reject(error);
  }
  worker?.terminate();
  worker = null;
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./cropCanvasEncoder.worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    const item = pending.get(data?.id);
    if (!item) return;
    pending.delete(data.id);
    clearTimeout(item.timer);
    if (data.error || !data.blob) item.reject(new Error(data.error || "Empty crop blob"));
    else item.resolve(data.blob);
  };
  worker.onerror = () => failWorker(new Error("Crop encoder worker failed"));
  return worker;
}

async function tryWorkerEncoding(canvas, type, quality) {
  if (
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined" ||
    typeof createImageBitmap !== "function"
  ) {
    throw new Error("Crop worker not supported");
  }
  const bitmap = await createImageBitmap(canvas);
  const target = getWorker();
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      // A stalled worker must never keep the crop in Saving indefinitely.
      failWorker(new Error("Crop encoder timed out"));
      reject(new Error("Crop encoder timed out"));
    }, 8000);
    pending.set(id, { resolve, reject, timer });
    try {
      target.postMessage({ id, bitmap, type, quality }, [bitmap]);
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      bitmap.close?.();
      reject(error);
    }
  });
}

function originalCanvasEncoding(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

export async function encodeCropCanvas(canvas, type, quality) {
  try {
    return await tryWorkerEncoding(canvas, type, quality);
  } catch {
    return originalCanvasEncoding(canvas, type, quality);
  }
}
