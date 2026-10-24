/**
 * Client-only background removal shared by every MLM LIVE photo flow.
 *
 * BiRefNet is always attempted first on a capable device, including phones.
 * The first request waits for its cached/shared model preparation. MODNet is
 * loaded only when WebGPU is unavailable or BiRefNet fails/returns a bad mask.
 */

export const REMOVE_BG_QUALITY = Object.freeze({
  engine: "birefnet-first-with-modnet-fallback",
  primaryEngine: "birefnet-lite-512-fp16",
  fallbackEngine: "modnet",
  continuousAlpha: true,
  lowQualityFallback: false,
  originalPhotoFallback: false,
  fallbackOnlyWhenUnsupported: false,
});

let birefNetPromise = null;
let modNetPromise = null;
let preloadPromise = null;
let selectedEnginePromise = null;
let primaryPreparationFailure = null;
let activeProgress = null;
let processingTail = Promise.resolve();

function abortError() {
  return new DOMException("Background removal cancelled", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function emitProgress(stage, percentage) {
  if (!activeProgress) return;
  activeProgress(stage, Math.max(0, Math.min(100, Math.round(percentage))));
}

async function loadBirefNetEngine() {
  if (!birefNetPromise) {
    birefNetPromise = import("./birefnetWorkerClient.js").catch((error) => {
      birefNetPromise = null;
      throw error;
    });
  }
  return birefNetPromise;
}

async function loadModNetEngine() {
  if (!modNetPromise) {
    modNetPromise = import("./modnetWorkerClient.js").catch((error) => {
      modNetPromise = null;
      throw error;
    });
  }
  return modNetPromise;
}

async function selectBestEngine() {
  if (!selectedEnginePromise) {
    selectedEnginePromise = (async () => {
      // Capability, rather than the mobile user-agent, determines eligibility.
      // A supported phone uses the same BiRefNet-first policy as desktop.
      try {
        const { getBirefNetCapability } = await loadBirefNetEngine();
        const capability = await getBirefNetCapability();
        if (capability.supported) return "birefnet";
      } catch {
        // Import/capability failure means this browser cannot use the quality
        // engine, so it is safe to choose the local fallback before download.
      }
      return "modnet";
    })();
  }
  return selectedEnginePromise;
}


function reportNativeFailure(error, engine) {
  try {
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({
        type: "REMOVE_BG_ERROR",
        engine,
        message: error?.message || String(error),
      }),
    );
  } catch {
    // Diagnostics must never hide the original processing error.
  }
}

/** App startup and every crop control reuse this one model/session warmup. */
export async function preloadBgModel(onProgress) {
  if (typeof window === "undefined") return "unavailable";
  // Forward to the active action even when a silent preload began earlier.
  // Never route this callback back into itself through emitProgress().
  const report = typeof onProgress === "function"
    ? (stage, percentage) => onProgress(stage, Math.max(0, Math.min(100, Math.round(percentage))))
    : (stage, percentage) => emitProgress(stage, percentage);

  if (!preloadPromise) {
    preloadPromise = (async () => {
      const selected = await selectBestEngine();
      if (selected === "birefnet") {
        const { preloadBirefNet } = await loadBirefNetEngine();
        try {
          await preloadBirefNet(report);
        } catch (error) {
          if (error?.name === "AbortError") throw error;
          primaryPreparationFailure = error;
          error.removeBgPreparationFailed = true;
          if (error?.removeBgUnsupported) selectedEnginePromise = Promise.resolve("modnet");
          const { preloadModNet } = await loadModNetEngine();
          await preloadModNet(report);
          return "modnet";
        }
      } else {
        const { preloadModNet } = await loadModNetEngine();
        await preloadModNet(report);
      }
      return selected;
    })().catch(error => {
      preloadPromise = null;
      // The explicit remove action owns retry/fallback and error UI.
      throw error;
    });
  }
  return preloadPromise;
}

function raceWithAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function queueProcessing(task, signal) {
  const scheduled = processingTail.then(async () => {
    throwIfAborted(signal);
    return task();
  });
  processingTail = scheduled.catch(() => {});
  return raceWithAbort(scheduled, signal);
}

async function runBirefNet(file, signal) {
  if (primaryPreparationFailure) throw primaryPreparationFailure;
  const { removeBackgroundWithBirefNet } = await loadBirefNetEngine();
  throwIfAborted(signal);
  let result;
  try { result = await removeBackgroundWithBirefNet(
    file,
    (stage, percentage) => emitProgress(stage, percentage),
    signal,
  ); } catch (error) { throw primaryPreparationFailure || error; }
  if (!(result instanceof Blob) || result.size === 0) {
    throw new Error("BiRefNet returned an empty image.");
  }
  return result;
}

async function runModNet(file, signal) {
  const { preloadModNet, removeBackgroundWithModNet } = await loadModNetEngine();
  await preloadModNet((stage, percentage) => emitProgress(stage, percentage));
  throwIfAborted(signal);
  const result = await removeBackgroundWithModNet(
    file,
    (stage, percentage) => emitProgress(stage, percentage),
    signal,
  );
  if (!(result instanceof Blob) || result.size === 0) {
    throw new Error("Portrait fallback returned an empty image.");
  }
  return result;
}

function tagValidationError(message, engine) {
  const error = new Error(message);
  error.removeBgEngine = engine;
  error.removeBgInvalidMask = true;
  error.removeBgRetryable = false;
  return error;
}

async function decodeResultBlob(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        drawTo: (ctx) => ctx.drawImage(bitmap, 0, 0),
        close: () => bitmap.close?.(),
      };
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    if (typeof image.decode === "function") await image.decode();
    else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Processed image could not be decoded."));
      });
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      drawTo: (ctx) => ctx.drawImage(image, 0, 0),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function validateTransparentResult(blob, engine, signal) {
  throwIfAborted(signal);
  const decoded = await decodeResultBlob(blob);
  try {
    const width = decoded.width;
    const height = decoded.height;
    if (!(width > 0) || !(height > 0)) {
      throw tagValidationError("Processed image size is invalid.", engine);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return blob;
    decoded.drawTo(ctx);
    const rgba = ctx.getImageData(0, 0, width, height).data;

    const total = width * height;
    let nonZero = 0;
    let strong = 0;
    let alphaSum = 0;
    let transparent = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let i = 0, pixel = 0; i < rgba.length; i += 4, pixel += 1) {
      const alpha = rgba[i + 3];
      alphaSum += alpha;
      if (alpha <= 8) transparent += 1;
      if (alpha > 0) {
        nonZero += 1;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (alpha >= 64) strong += 1;
    }

    if (total > 0 && transparent / total < 0.005) {
      throw tagValidationError(`${engine} did not remove the background.`, engine);
    }
    const nonZeroRatio = total > 0 ? nonZero / total : 0;
    const strongRatio = total > 0 ? strong / total : 0;
    const meanAlpha = total > 0 ? alphaSum / (255 * total) : 0;
    const bboxArea =
      maxX >= minX && maxY >= minY
        ? (maxX - minX + 1) * (maxY - minY + 1)
        : 0;
    const bboxRatio = total > 0 ? bboxArea / total : 0;

    // Protect against the exact failure seen in production: a nearly invisible
    // silhouette on a fully transparent canvas.
    if (nonZeroRatio < 0.003 || strongRatio < 0.0015 || meanAlpha < 0.015) {
      throw tagValidationError(
        `${engine} produced a near-blank transparent result.`,
        engine,
      );
    }

    // If almost the whole frame is transparent-but-weak and the visible box is
    // tiny, the user effectively receives a blank image.
    if (bboxRatio < 0.02 && meanAlpha < 0.05) {
      throw tagValidationError(
        `${engine} produced too little visible foreground.`,
        engine,
      );
    }

    return blob;
  } finally {
    decoded.close?.();
  }
}

export function isRetryableRemoveBgError(error) {
  if (error?.removeBgPreparationFailed) return false;
  let current = error;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current.removeBgRetryable === true) return true;
    current = current.cause;
  }
  return false;
}

async function retrySameEngine(engine) {
  preloadPromise = null;
  if (engine === "birefnet") {
    const { resetBirefNetEngine } = await loadBirefNetEngine();
    // Keep the cached large file. A transient session failure should not force
    // a second giant network download.
    await resetBirefNetEngine({ freshAssets: false });
    return;
  }
  const { resetModNetEngine } = await loadModNetEngine();
  resetModNetEngine({ freshAssets: false });
}

async function runEngineWithValidation(engine, file, signal) {
  const runner = engine === "birefnet" ? runBirefNet : runModNet;
  const blob = await runner(file, signal);
  return validateTransparentResult(blob, engine, signal);
}

async function runEngineWithRetry(engine, file, signal) {
  try {
    return await runEngineWithValidation(engine, file, signal);
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) throw abortError();
    if (!isRetryableRemoveBgError(error)) {
      throw Object.assign(error, { removeBgEngine: engine });
    }

    console.warn(`[removeBg] ${engine} retry:`, error);
    emitProgress(
      engine === "birefnet"
        ? "High-quality AI clean retry कर रहा है…"
        : "Fast portrait AI clean retry कर रहा है…",
      7,
    );
    await retrySameEngine(engine);
    const retried = await runEngineWithValidation(engine, file, signal);
    emitProgress("Clean transparent photo तैयार है", 100);
    return retried;
  }
}

async function removeWithPreferredEngine(file, signal) {
  const preferredEngine = await selectBestEngine();
  throwIfAborted(signal);

  if (preferredEngine === "birefnet") {
    try {
      // The runner awaits the same session/model promise as preloadBgModel().
      // MODNet readiness never decides which engine handles the first photo.
      return { blob: await runEngineWithRetry("birefnet", file, signal), engine: "birefnet" };
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw abortError();
      console.warn("[removeBg] BiRefNet failed; falling back to MODNet for this photo.", error);
      const { resetBirefNetEngine } = await loadBirefNetEngine();
      if (!error?.removeBgInvalidMask) resetBirefNetEngine();
      if (error?.removeBgUnsupported === true) selectedEnginePromise = Promise.resolve("modnet");
      preloadPromise = null;
      emitProgress("BiRefNet पूरा नहीं हुआ. Portrait fallback तैयार हो रहा है…", 6);
    }
  } else {
    emitProgress("इस device पर WebGPU उपलब्ध नहीं है. Portrait fallback तैयार हो रहा है…", 6);
  }
  throwIfAborted(signal);
  return { blob: await runEngineWithRetry("modnet", file, signal), engine: "modnet" };
}

/**
 * Remove a portrait background entirely on the user's device.
 * No photo bytes are uploaded to the model host.
 */
export async function removeBg(file, onProgress, signal) {
  if (!(file instanceof Blob) || file.size === 0) {
    throw new Error("Please select a valid image.");
  }
  throwIfAborted(signal);
  onProgress?.("Portrait AI तैयार हो रहा है…", 2);

  return queueProcessing(async () => {
    throwIfAborted(signal);
    activeProgress = onProgress || null;
    let engine = "birefnet";
    try {
      const { blob, engine: usedEngine } = await removeWithPreferredEngine(file, signal);
      engine = usedEngine;
      emitProgress(
        engine === "birefnet"
          ? "High-quality transparent photo तैयार है"
          : "Fast clean transparent photo तैयार है",
        100,
      );
      return blob;
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw abortError();
      console.error("[removeBg] Portrait removal failed:", error);
      reportNativeFailure(error, error?.removeBgEngine || engine);
      throw new Error(
        "Background remove पूरा नहीं हुआ. Internet on रखकर photo दोबारा try करें — background वाली photo save नहीं की गई है.",
        { cause: error },
      );
    } finally {
      activeProgress = null;
    }
  }, signal);
}

/** Rebuild sessions after an explicit repair; keep the persisted BiRefNet model. */
export function refreshRemoveBgKeys() {
  primaryPreparationFailure = null;
  preloadPromise = null;
  selectedEnginePromise = null;
  if (birefNetPromise) {
    void birefNetPromise
      .then(({ resetBirefNetEngine }) => resetBirefNetEngine({ freshAssets: true }))
      .catch(() => {
        birefNetPromise = null;
      });
  }
  if (modNetPromise) {
    void modNetPromise
      .then(({ resetModNetEngine }) => resetModNetEngine({ freshAssets: true }))
      .catch(() => {
        modNetPromise = null;
      });
  }
}
