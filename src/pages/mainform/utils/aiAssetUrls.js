// Heavy AI assets must never fall back to the app/Vercel origin.
export const ORT_ASSET_VERSION = "1.21.0";
export const DEFAULT_MODNET_BASE = "https://models.mlmposter.com/modnet/";
export const DEFAULT_ORT_BASE = `https://models.mlmposter.com/ort/${ORT_ASSET_VERSION}/`;

export function requireRemoteAiUrl(value, appOrigin = globalThis.location?.origin) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" || url.username || url.password ||
    url.origin === appOrigin || url.hostname === "app.mlmlive.in" ||
    /(^|\.)vercel\.app$/i.test(url.hostname)
  ) {
    throw new Error("AI assets must use the external HTTPS model CDN.");
  }
  return url;
}

export function resolveModnetModelUrl(base = DEFAULT_MODNET_BASE, version = "", revision = 0) {
  const url = requireRemoteAiUrl(String(base || DEFAULT_MODNET_BASE).trim());
  // Older production env values contain a complete model URL. Accept both
  // forms, including the old model.onnx spelling, without appending it twice.
  url.pathname = url.pathname.replace(/\/(?:model|modnet)\.onnx\/?$/i, "/");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/modnet.onnx`;
  if (version) url.searchParams.set("v", version);
  if (revision > 0) url.searchParams.set("retry", String(revision));
  return url.href;
}

export function getOrtWasmUrl(backend = "wasm", base) {
  if (backend !== "wasm" && backend !== "webgpu") throw new Error("Unsupported AI backend.");
  const env = import.meta.env || {};
  const url = requireRemoteAiUrl(String(base || env.VITE_ORT_ASSET_BASE_URL || DEFAULT_ORT_BASE).trim());
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/ort-wasm-simd-threaded${backend === "webgpu" ? ".jsep" : ""}.wasm`;
  return url.href;
}

export function getOrtLoaderUrl(backend = "wasm") {
  const env = import.meta.env || {};
  const base = env.BASE_URL || "/";
  const name = `ort-wasm-simd-threaded${backend === "webgpu" ? ".jsep" : ""}.mjs`;
  // Only these small JS loaders remain same-origin for Android/WebView
  // compatibility. Their WASM bytes are supplied explicitly from R2.
  return new URL(`${base}ort/${ORT_ASSET_VERSION}/${name}`, globalThis.location.href).href;
}
