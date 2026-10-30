import { getOrtLoaderUrl, getOrtWasmUrl, requireRemoteAiUrl } from "./aiAssetUrls.js";

const CACHE_NAME = "mlmlive-ort-r2-1.21.0-v1";
const pending = new Map();

function validWasm(bytes, url) {
  const expectedSize = new URL(url).pathname.endsWith(".jsep.wasm") ? 23914392 : 12666427;
  return bytes.byteLength === expectedSize && bytes[0] === 0 && bytes[1] === 97 &&
    bytes[2] === 115 && bytes[3] === 109 && bytes[4] === 1;
}

async function openCache() {
  try { return await globalThis.caches?.open(CACHE_NAME); }
  catch { return null; }
}

export async function loadOrtWasmBinary(url) {
  const key = requireRemoteAiUrl(url).href;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const cache = await openCache();
    try {
      const hit = await cache?.match(key);
      if (hit) {
        const bytes = new Uint8Array(await hit.arrayBuffer());
        if (validWasm(bytes, key)) return bytes;
        await cache.delete(key);
      }
    } catch { /* HTTP cache still works when Cache Storage is unavailable. */ }

    // A CORS-approved byte fetch avoids cross-origin module/worker imports
    // and instantiateStreaming MIME differences in older Android WebViews.
    const response = await fetch(key, {
      mode: "cors", credentials: "omit", cache: "force-cache",
    });
    if (response.status !== 200) throw new Error(`AI runtime CDN returned ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!validWasm(bytes, key)) throw new Error("AI runtime CDN did not return the complete ONNX Runtime 1.21.0 WASM binary.");
    if (cache) {
      // Persist only validated, complete responses. Runtime version is in the
      // object path, so normal app deploys never invalidate these large files.
      try {
        await cache.put(key, new Response(bytes, { headers: {
          "Content-Type": "application/wasm",
          "Cache-Control": "public, max-age=31536000, immutable",
        } }));
      } catch { /* Best effort on private/low-storage devices. */ }
    }
    return bytes;
  })();
  pending.set(key, task);
  try { return await task; }
  finally { pending.delete(key); }
}

export async function configureR2Runtime(ort, backend = "wasm") {
  const wasmUrl = getOrtWasmUrl(backend);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: getOrtLoaderUrl(backend) };
  // ONNX Runtime 1.21 accepts an explicit binary. Its Emscripten loader then
  // performs no WASM download of its own and cannot fall back to Vercel.
  ort.env.wasm.wasmBinary = await loadOrtWasmBinary(wasmUrl);
  return ort;
}
