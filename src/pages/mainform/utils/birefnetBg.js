/**
 * High-quality on-device background removal with BiRefNet Lite 512 FP16.
 *
 * The model is downloaded from the public R2 bucket once, cached by the
 * browser, and then executed with ONNX Runtime WebGPU inside a worker. We do not
 * run the old MODNet portrait connectivity cleanup on BiRefNet output because
 * that cleanup can erase fine hair, ears and soft shoulder edges.
 */

const MODEL_SIZE = 512;
const MODEL_CACHE_NAME = "mlmlive-ai-models-v3";
const MODEL_CACHE_VERSION = "birefnet-lite-512-fp16-2026-10-09-v1";
const MODEL_BYTES = 98_484_532;
const DEFAULT_MODEL_URL =
  "https://models.mlmposter.com/birefnet/model_fp16.onnx";
const MAX_OUTPUT_SIDE = 3072;
const MAX_OUTPUT_PIXELS = 6_500_000;

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

let runtimePromise = null;
let sessionPromise = null;
let capabilityPromise = null;
let forceFreshModelFetch = false;
let modelRevision = 0;
const preparationListeners = new Set();

export const BIREFNET_QUALITY_SETTINGS = Object.freeze({
  inputSize: MODEL_SIZE,
  maxOutputSide: MAX_OUTPUT_SIDE,
  maxOutputPixels: MAX_OUTPUT_PIXELS,
  model: "birefnet-lite-512-fp16",
  backend: "webgpu",
});

function abortError() {
  return new DOMException("Background removal cancelled", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function tagEngineError(error, stage, { retryable = false, unsupported = false } = {}) {
  if (error?.name === "AbortError") return error;
  const tagged = error instanceof Error ? error : new Error(String(error));
  tagged.removeBgStage ||= stage;
  if (typeof tagged.removeBgRetryable !== "boolean") {
    tagged.removeBgRetryable = retryable;
  }
  if (typeof tagged.removeBgUnsupported !== "boolean") {
    tagged.removeBgUnsupported = unsupported;
  }
  return tagged;
}

export function getBirefNetModelUrl() {
  const configured = String(import.meta.env.VITE_BIREFNET_MODEL_URL || "").trim();
  const base = configured || DEFAULT_MODEL_URL;
  const url = new URL(base, globalThis.location?.href || globalThis.window?.location?.href);
  // Repair the known old deployment value as well as the checked-in default.
  // Vercel environment variables can override .env.production at build time.
  if (url.hostname === "models.mlmposter.com" && url.pathname === "/models/birefnet/model_fp16.onnx") {
    url.pathname = "/birefnet/model_fp16.onnx";
  }
  // The revision only changes after an explicit retry. Normal loads keep a
  // stable URL so both HTTP cache and Cache Storage can reuse the 94 MB model.
  url.searchParams.set("v", MODEL_CACHE_VERSION);
  if (modelRevision > 0) url.searchParams.set("retry", String(modelRevision));
  return url.href;
}

/**
 * Check only capabilities that are required for the quality engine. A weak or
 * WebGPU-less device is routed to the bundled MODNet fallback before the large
 * BiRefNet model is downloaded.
 */
export async function getBirefNetCapability() {
  if (capabilityPromise) return capabilityPromise;
  capabilityPromise = (async () => {
    if (typeof navigator === "undefined") {
      return { supported: false, reason: "browser-unavailable" };
    }
    const scope = typeof window === "undefined" ? globalThis : window;
    if (!scope.isSecureContext && globalThis.location?.hostname !== "localhost") {
      return { supported: false, reason: "secure-context-required" };
    }
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== "function") {
      return { supported: false, reason: "webgpu-unavailable" };
    }

    // Avoid spending ~94 MB and then OOMing on very small-memory Android
    // devices. deviceMemory is intentionally treated as a hint only because it
    // is not available in every browser.
    const deviceMemory = Number(navigator.deviceMemory || 0);
    if (deviceMemory > 0 && deviceMemory < 4) {
      return { supported: false, reason: "low-device-memory" };
    }
    const cores = Number(navigator.hardwareConcurrency || 0);
    if (cores > 0 && cores < 4) {
      return { supported: false, reason: "low-cpu-tier" };
    }

    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return { supported: false, reason: "webgpu-adapter-unavailable" };
      // This model has FP16 weights. A WebGPU adapter without shader-f16
      // cannot execute it safely; avoid a wasted ~98 MB download there.
      if (!adapter.features?.has?.("shader-f16")) {
        return { supported: false, reason: "webgpu-fp16-unavailable" };
      }
      const storageBuffers = Number(adapter.limits?.maxStorageBuffersPerShaderStage || 0);
      if (storageBuffers > 0 && storageBuffers < 7) {
        return { supported: false, reason: "webgpu-storage-buffer-limit" };
      }
      return { supported: true, reason: "webgpu-ready" };
    } catch (error) {
      return { supported: false, reason: "webgpu-adapter-error", error };
    }
  })();
  return capabilityPromise;
}

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("onnxruntime-web/webgpu")
      .then((module) => {
        const ort = module.default || module;
        // WebGPU also requires the JSEP WASM runtime. An inferred URL under
        // Vite's dependency cache can return the SPA HTML instead of WASM.
        // Pin the matching 1.21.0 pair to real, same-origin public assets.
        const base = new URL(`${import.meta.env.BASE_URL}modnet/`, globalThis.location.href);
        const version = "ort-1.21.0-jsep-v1";
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.wasm.initTimeout = 30_000;
        ort.env.wasm.wasmPaths = {
          wasm: `${base}ort-wasm-simd-threaded.jsep.wasm?v=${version}`,
          mjs: `${base}ort-wasm-simd-threaded.jsep.mjs?v=${version}`,
        };
        ort.env.logLevel = "warning";
        return ort;
      })
      .catch((error) => {
        runtimePromise = null;
        throw tagEngineError(error, "runtime-import", { unsupported: true });
      });
  }
  return runtimePromise;
}

async function readResponseWithProgress(response, onProgress, signal) {
  const expectedSize = response.headers.get("content-encoding") ? 0 : Number(response.headers.get("content-length")) || 0;
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.("BiRefNet AI model ready…", 40);
    return bytes;
  }

  const reader = response.body.getReader();
  // One allocation for the usual 98 MB response. Keeping every streamed chunk
  // and then joining it doubles peak model memory on phones.
  const buffer = expectedSize > 0 ? new Uint8Array(expectedSize) : null;
  const chunks = buffer ? null : [];
  let received = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (buffer) {
        if (received + value.length > buffer.length) throw new Error("BiRefNet model response size is invalid.");
        buffer.set(value, received);
      } else chunks.push(value);
      received += value.length;
      const ratio = expectedSize > 0 ? Math.min(1, received / expectedSize) : 0;
      onProgress?.("High-quality AI model तैयार हो रहा है…", 4 + ratio * 34);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (buffer) {
    if (received !== buffer.length) throw new Error("BiRefNet model download is incomplete.");
    return buffer;
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function isReusableModelUrl(candidate, modelUrl) {
  const key = new URL(candidate);
  const target = new URL(modelUrl);
  for (const name of ["v", "retry", "mlmlive-cache"]) {
    key.searchParams.delete(name);
    target.searchParams.delete(name);
  }
  if (key.href === target.href) return true;
  // Only this known, identical model can cross the old CDN/cache namespaces.
  // A custom object or URL token must never be replaced by a different model.
  const mirrors = ["models.mlmposter.com", "cdn.mlmposter.com", "cdn.mlmlive.in"];
  const knownPath = path => /^\/(?:models\/)?birefnet\/model_fp16\.onnx$/.test(path);
  return mirrors.includes(target.hostname) && knownPath(target.pathname) && !target.search &&
    !key.search && ((mirrors.includes(key.hostname) && knownPath(key.pathname)) ||
      (key.hostname === "huggingface.co" &&
        /^\/studioludens\/birefnet-lite-512\/resolve\/[^/]+\/onnx\/model_fp16\.onnx$/.test(key.pathname)));
}

function validModelResponse(response) {
  return response?.status === 200 && !/text\/html|application\/json/i.test(response.headers.get("content-type") || "");
}

function validateModelBytes(bytes, modelUrl) {
  const url = new URL(modelUrl);
  const knownModel = ["models.mlmposter.com", "cdn.mlmposter.com", "cdn.mlmlive.in"].includes(url.hostname) &&
    /^\/(?:models\/)?birefnet\/model_fp16\.onnx$/.test(url.pathname);
  if ((knownModel && bytes.length !== MODEL_BYTES) || bytes.length < 1_000_000 || bytes[0] !== 8) {
    throw tagEngineError(new Error("BiRefNet model is incomplete or is not an ONNX binary."), "model-download");
  }
  return bytes;
}

async function persistModel(request, bytes) {
  try {
    if (!("caches" in globalThis)) return;
    const cache = await caches.open(MODEL_CACHE_NAME);
    await cache.put(request, new Response(bytes, { headers: {
      "content-type": "application/octet-stream", "content-length": String(bytes.length),
    } }));
  } catch {
    // Private mode/quota eviction still permits the in-memory session to work.
  }
}

async function fetchModel(onProgress, signal) {
  throwIfAborted(signal);
  const modelUrl = getBirefNetModelUrl();
  const request = new Request(modelUrl, { mode: "cors", credentials: "omit" });

  if (!forceFreshModelFetch && "caches" in globalThis) {
    try {
      const names = [MODEL_CACHE_NAME, ...(await caches.keys()).filter(name =>
        name !== MODEL_CACHE_NAME && /^mlmlive-(?:ai-models-|birefnet-)/.test(name))];
      for (const name of names) {
        const cache = await caches.open(name);
        const keys = [request, ...(await cache.keys()).filter(key => key.url !== request.url && isReusableModelUrl(key.url, modelUrl))];
        for (const key of keys) {
          const cached = await cache.match(key);
          if (!cached) continue;
          try {
            if (!validModelResponse(cached)) throw new Error("Invalid cached model response.");
            onProgress?.("Cached high-quality AI model मिल गया…", 30);
            const bytes = validateModelBytes(await readResponseWithProgress(cached, onProgress, signal), modelUrl);
            if (name !== MODEL_CACHE_NAME || key.url !== request.url) await persistModel(request, bytes);
            return bytes;
          } catch (error) {
            if (error?.name === "AbortError") throw error;
            // A previous partial/HTML response must not poison future sessions.
            await cache.delete(key);
          }
        }
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // Cache Storage can be disabled/private-mode limited. HTTP cache still
      // provides a second persistence layer, so continue normally.
    }
  }

  let response;
  // Bound a stalled connection, not the entire 98 MB download. Slow downloads
  // continue for as long as bytes keep arriving.
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  let timer;
  const touch = () => { clearTimeout(timer); timer = setTimeout(cancel, 30_000); };
  touch();
  try {
    response = await fetch(request, {
      cache: forceFreshModelFetch ? "reload" : "force-cache",
      signal: controller.signal,
    });
    if (!validModelResponse(response)) {
      throw tagEngineError(
        new Error(`BiRefNet model download failed (${response.status}, ${response.headers.get("content-type") || "unknown content"}).`),
        "model-download", { retryable: response.status === 408 || response.status === 429 || response.status >= 500 },
      );
    }
    const bytes = validateModelBytes(await readResponseWithProgress(response, (stage, percentage) => {
      touch();
      onProgress?.(stage, percentage);
    }, controller.signal), modelUrl);
    clearTimeout(timer);
    await persistModel(request, bytes);
    return bytes;
  } catch (error) {
    if (!signal?.aborted && controller.signal.aborted) {
      error = new Error("BiRefNet model connection stopped responding.");
    }
    throw tagEngineError(error, "model-download", { retryable: true });
  } finally {
    forceFreshModelFetch = false;
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

async function getSession(onProgress, signal) {
  if (onProgress) preparationListeners.add(onProgress);
  const report = (stage, percentage) => {
    for (const listener of preparationListeners) listener(stage, percentage);
  };
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const capability = await getBirefNetCapability();
      if (!capability.supported) {
        throw tagEngineError(
          new Error(`BiRefNet WebGPU unavailable (${capability.reason}).`),
          "capability",
          { unsupported: true },
        );
      }

      const [ort, model] = await Promise.all([
        loadRuntime(),
        fetchModel(report, signal),
      ]);
      throwIfAborted(signal);
      report("High-quality portrait AI शुरू हो रहा है…", 43);
      try {
        return await ort.InferenceSession.create(model, {
          executionProviders: ["webgpu"],
          graphOptimizationLevel: "all",
          executionMode: "sequential",
        });
      } catch (error) {
        // WebGPU provider/adaptor failures are treated as genuine device
        // incompatibility. Network/download failures are tagged elsewhere and
        // are retried on the same quality engine instead of silently downgrading.
        const message = String(error?.message || error || "").toLowerCase();
        const unsupported =
          message.includes("webgpu") ||
          message.includes("adapter") ||
          message.includes("not supported") ||
          message.includes("unsupported") ||
          message.includes("out of memory") ||
          message.includes("oom");
        throw tagEngineError(error, "engine-init", {
          retryable: !unsupported,
          unsupported,
        });
      }
    })().catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  try {
    return await sessionPromise;
  } finally {
    if (onProgress) preparationListeners.delete(onProgress);
  }
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.(),
      };
    } catch {
      // Continue with HTMLImageElement for older Android/WebView decoders.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    if (typeof image.decode === "function") await image.decode();
    else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Selected image could not be read."));
      });
    }
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function getBirefNetOutputSize(width, height) {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1, scale: 1 };
  const sideScale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(width, height));
  const pixelScale = Math.min(1, Math.sqrt(MAX_OUTPUT_PIXELS / (width * height)));
  const scale = Math.min(sideScale, pixelScale);
  return {
    // floor keeps the final raster strictly under the pixel-memory cap; using
    // round() can add one pixel on both axes and exceed the limit.
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createPreprocessedInput(source) {
  const canvas = createCanvas(MODEL_SIZE, MODEL_SIZE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const pixels = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;

  const planeSize = MODEL_SIZE * MODEL_SIZE;
  const data = new Float32Array(planeSize * 3);
  for (let i = 0; i < planeSize; i += 1) {
    const pixel = i * 4;
    data[i] = (pixels[pixel] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    data[i + planeSize] =
      (pixels[pixel + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    data[i + planeSize * 2] =
      (pixels[pixel + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  return data;
}

function halfToFloat32(value) {
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  }
  if (exponent === 31) {
    return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  }
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

export function sigmoidLogits(output) {
  const raw = output?.data || output;
  const isFloat16 = output?.type === "float16" && raw instanceof Uint16Array;
  const result = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    const logit = isFloat16 ? halfToFloat32(raw[i]) : Number(raw[i]);
    // Stable sigmoid avoids overflow on confident foreground/background logits.
    const alpha =
      logit >= 0
        ? 1 / (1 + Math.exp(-logit))
        : Math.exp(logit) / (1 + Math.exp(logit));
    // Only snap values that are already effectively opaque/transparent. This
    // removes tiny haze while preserving soft hair and shoulder boundaries.
    result[i] = alpha <= 0.004 ? 0 : alpha >= 0.996 ? 1 : alpha;
  }
  return result;
}

function resizeMatteToAlpha(matte, width, height) {
  const sourceCanvas = createCanvas(MODEL_SIZE, MODEL_SIZE);
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = sourceCtx.createImageData(MODEL_SIZE, MODEL_SIZE);
  for (let i = 0; i < matte.length; i += 1) {
    const value = Math.round(Math.max(0, Math.min(1, matte[i])) * 255);
    const offset = i * 4;
    imageData.data[offset] = value;
    imageData.data[offset + 1] = value;
    imageData.data[offset + 2] = value;
    imageData.data[offset + 3] = 255;
  }
  sourceCtx.putImageData(imageData, 0, 0);

  const targetCanvas = createCanvas(width, height);
  const targetCtx = targetCanvas.getContext("2d", { willReadFrequently: true });
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = "high";
  targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
  const resized = targetCtx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i += 1) {
    alpha[i] = resized[i * 4];
  }
  return alpha;
}

function canvasToPngBlob(canvas) {
  if (typeof canvas.convertToBlob === "function") return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error("Transparent PNG could not be created."));
      },
      "image/png",
      1,
    );
  });
}

async function compositeTransparentPng(decoded, matte, onProgress, signal) {
  throwIfAborted(signal);
  const { width, height } = getBirefNetOutputSize(decoded.width, decoded.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded.source, 0, 0, width, height);
  onProgress?.("Hair और edges preserve हो रहे हैं…", 88);

  const alpha = resizeMatteToAlpha(matte, width, height);
  const rgba = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < alpha.length; i += 1) {
    rgba.data[i * 4 + 3] = alpha[i];
  }
  ctx.clearRect(0, 0, width, height);
  ctx.putImageData(rgba, 0, 0);
  throwIfAborted(signal);
  return canvasToPngBlob(canvas);
}

export async function preloadBirefNet(onProgress, signal) {
  const capability = await getBirefNetCapability();
  if (!capability.supported) {
    throw tagEngineError(
      new Error(`BiRefNet unavailable (${capability.reason}).`),
      "capability",
      { unsupported: true },
    );
  }
  await getSession(onProgress, signal);
  return "birefnet-webgpu";
}

export async function removeBackgroundWithBirefNet(file, onProgress, signal) {
  throwIfAborted(signal);
  const [ort, session] = await Promise.all([
    loadRuntime(),
    getSession(onProgress, signal),
  ]);
  throwIfAborted(signal);

  const decoded = await decodeImage(file);
  let input;
  let outputs;
  try {
    onProgress?.("Photo high-quality AI के लिए prepare हो रही है…", 48);
    const inputData = createPreprocessedInput(decoded.source);
    throwIfAborted(signal);
    input = new ort.Tensor("float32", inputData, [1, 3, MODEL_SIZE, MODEL_SIZE]);
    onProgress?.("BiRefNet background identify कर रहा है…", 58);

    try {
      const inputName = session.inputNames?.[0] || "input_image";
      outputs = await session.run({ [inputName]: input });
    } catch (error) {
      throw tagEngineError(error, "inference", { retryable: false });
    }
    throwIfAborted(signal);

    const output = outputs.logits || outputs.output_image || outputs[session.outputNames[0]];
    if (!output?.data?.length) {
      throw tagEngineError(new Error("BiRefNet returned an empty matte."), "inference");
    }
    onProgress?.("Soft matte refine हो रहा है…", 78);
    const matte = sigmoidLogits(output);
    const result = await compositeTransparentPng(decoded, matte, onProgress, signal);
    onProgress?.("Clean transparent photo तैयार है", 100);
    return result;
  } finally {
    input?.dispose?.();
    for (const output of new Set(Object.values(outputs || {}))) output?.dispose?.();
    decoded.close?.();
  }
}

export async function resetBirefNetEngine({ freshAssets = false } = {}) {
  const previous = sessionPromise;
  sessionPromise = null;
  capabilityPromise = null;
  if (previous) void previous.then(session => session.release()).catch(() => {});
  if (freshAssets) {
    forceFreshModelFetch = true;
    modelRevision += 1;
    if ("caches" in globalThis) {
      try {
        await caches.delete(MODEL_CACHE_NAME);
      } catch {
        // Best effort only.
      }
    }
  }
}
