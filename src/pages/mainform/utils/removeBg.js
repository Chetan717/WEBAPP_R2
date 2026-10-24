/**
 * Client-only background removal shared by every MLM LIVE photo flow.
 *
 * Smart routing strategy:
 *   - Always warm the fast/local MODNet path first so the very first removal
 *     starts quickly and does not leave the user waiting on a giant download.
 *   - Warm BiRefNet Lite 512 FP16 quietly in the background on capable devices.
 *   - Use BiRefNet only when it is actually ready.
 *   - If BiRefNet fails or returns a near-blank transparent image, fall back
 *     automatically to MODNet in the same user action.
 */

export const REMOVE_BG_QUALITY = Object.freeze({
  engine: "smart-auto-modnet-first-birefnet-when-ready",
  primaryFastPath: "modnet",
  qualityUpgradePath: "birefnet-lite-512-fp16",
  continuousAlpha: true,
  lowQualityFallback: false,
  originalPhotoFallback: false,
  fallbackOnlyWhenUnsupported: false,
});

let birefNetPromise = null;
let modNetPromise = null;
let preloadPromise = null;
let selectedEnginePromise = null;
let silentQualityWarmupPromise = null;
let birefNetReady = false;
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
    birefNetPromise = import("./birefnetBg.js").catch((error) => {
      birefNetPromise = null;
      throw error;
    });
  }
  return birefNetPromise;
}

async function loadModNetEngine() {
  if (!modNetPromise) {
    modNetPromise = import("./modnetBg.js").catch((error) => {
      modNetPromise = null;
      throw error;
    });
  }
  return modNetPromise;
}

async function selectBestEngine() {
  if (!selectedEnginePromise) {
    selectedEnginePromise = (async () => {
      // Mobile browsers are the stability-sensitive path. Loading a ~98 MB
      // WebGPU model there causes long waits, memory pressure and provider
      // crashes on many Android devices. Use the tuned MODNet path directly
      // on phones/tablets; desktop can still upgrade to BiRefNet when ready.
      if (isMobileLikeDevice()) return "modnet";

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


function isMobileLikeDevice() {
  if (typeof navigator === "undefined") return false;
  if (navigator.userAgentData && typeof navigator.userAgentData.mobile === "boolean") {
    return navigator.userAgentData.mobile;
  }
  const ua = String(navigator.userAgent || "");
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
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

async function warmBirefNetInBackground() {
  if (typeof window === "undefined") return "unavailable";
  if (silentQualityWarmupPromise) return silentQualityWarmupPromise;

  silentQualityWarmupPromise = (async () => {
    try {
      const selected = await selectBestEngine();
      if (selected !== "birefnet") return "modnet";
      const { preloadBirefNet } = await loadBirefNetEngine();
      await preloadBirefNet();
      birefNetReady = true;
      return "birefnet";
    } catch (error) {
      birefNetReady = false;
      if (error?.removeBgUnsupported === true) {
        selectedEnginePromise = Promise.resolve("modnet");
      }
      // Keep the app usable. Fast local processing remains available.
      console.warn("[removeBg] Background BiRefNet warmup skipped:", error);
      return "modnet";
    }
  })().catch((error) => {
    silentQualityWarmupPromise = null;
    birefNetReady = false;
    console.warn("[removeBg] Silent BiRefNet warmup failed:", error);
    return "modnet";
  });

  return silentQualityWarmupPromise;
}

/** Start loading the minimum reliable engine as early as possible. */
export async function preloadBgModel(onProgress) {
  if (typeof window === "undefined") return "unavailable";

  // IMPORTANT: never assign activeProgress to a wrapper that calls
  // emitProgress(). Doing that creates emitProgress -> activeProgress ->
  // emitProgress recursion and eventually "Maximum call stack size exceeded".
  const report =
    typeof onProgress === "function"
      ? (stage, percentage) =>
          onProgress(stage, Math.max(0, Math.min(100, Math.round(percentage))))
      : (stage, percentage) => emitProgress(stage, percentage);

  // Fast, bundled path is prepared first so first-use remove-bg stays quick.
  if (!preloadPromise) {
    preloadPromise = (async () => {
      const { preloadModNet } = await loadModNetEngine();
      await preloadModNet(report);
      return "modnet-ready";
    })().catch((error) => {
      preloadPromise = null;
      throw error;
    });
  }

  // Quality path warms silently in parallel for later requests on capable
  // devices. It must never block the user's first successful removal.
  void warmBirefNetInBackground();

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
  const { removeBackgroundWithBirefNet } = await loadBirefNetEngine();
  throwIfAborted(signal);
  const result = await removeBackgroundWithBirefNet(
    file,
    (stage, percentage) => emitProgress(stage, percentage),
    signal,
  );
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
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let i = 0, pixel = 0; i < rgba.length; i += 4, pixel += 1) {
      const alpha = rgba[i + 3];
      alphaSum += alpha;
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
    birefNetReady = false;
    await warmBirefNetInBackground();
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

async function removeWithSmartEngine(file, signal) {
  const preferredEngine = await selectBestEngine();

  // If the quality engine is already fully ready, use it. Otherwise do not
  // block this action; run the fast local path immediately.
  if (preferredEngine === "birefnet" && birefNetReady) {
    try {
      return {
        blob: await runEngineWithRetry("birefnet", file, signal),
        engine: "birefnet",
      };
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw abortError();
      console.warn("[removeBg] BiRefNet failed or looked blank; falling back to MODNet.", error);
      emitProgress("Fast portrait AI par switch हो रहा है…", 14);
      const fallbackBlob = await runEngineWithRetry("modnet", file, signal);
      return { blob: fallbackBlob, engine: "modnet" };
    }
  }

  if (preferredEngine === "birefnet" && !birefNetReady) {
    emitProgress(
      "Fast portrait AI तुरंत चल रहा है… High-quality model background में ready हो रहा है…",
      10,
    );
    void warmBirefNetInBackground();
  }

  const blob = await runEngineWithRetry("modnet", file, signal);
  return { blob, engine: "modnet" };
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
    let engine = "modnet";
    try {
      // Ensure at least the fast local engine is fully ready before we start.
      await preloadBgModel();
      const { blob, engine: usedEngine } = await removeWithSmartEngine(file, signal);
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
      reportNativeFailure(error, engine);
      throw new Error(
        "Background remove पूरा नहीं हुआ. Internet on रखकर photo दोबारा try करें — background वाली photo save नहीं की गई है.",
        { cause: error },
      );
    } finally {
      activeProgress = null;
    }
  }, signal);
}

/** Force a fresh model download only after the user explicitly retries repair. */
export function refreshRemoveBgKeys() {
  preloadPromise = null;
  selectedEnginePromise = null;
  silentQualityWarmupPromise = null;
  birefNetReady = false;
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
