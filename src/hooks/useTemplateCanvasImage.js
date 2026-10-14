import { useEffect, useMemo, useState } from "react";

// Avoid asking for dozens of full-resolution backgrounds on every template scroll.
// Keep at most three decoded backgrounds in memory for quick back/forward taps.
const MAX_DECODED = 3;
const decodedImages = new Map();
const RETRY_DELAYS = [0, 450];

function rememberDecoded(url, image) {
  if (decodedImages.has(url)) decodedImages.delete(url);
  decodedImages.set(url, image);
  while (decodedImages.size > MAX_DECODED) decodedImages.delete(decodedImages.keys().next().value);
}

export function isRemoteTemplateUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

// Some WebViews never emit onerror for a blocked/aborted CDN image. A bounded
// load ensures the Retry UI (or verified CDN fallback) can still be reached.
const IMAGE_LOAD_TIMEOUT_MS = 10500;

function makeImage(src, { cors = true, signal } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let complete = false;
    const timer = setTimeout(() => {
      image.src = "";
      done(new Error("Template image timed out"));
    }, IMAGE_LOAD_TIMEOUT_MS);
    const done = (error) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(image);
    };
    const onAbort = () => {
      image.src = "";
      done(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (cors && isRemoteTemplateUrl(src)) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => done(null);
    image.onerror = () => done(new Error("Template image could not load"));
    if (signal?.aborted) return onAbort();
    image.src = src;
  });
}

async function loadBlobFallback(url, signal) {
  // The blob route is only used after normal anonymous Image() failed.
  // It remains CORS-enforced: never render an opaque image onto export canvas.
  const response = await fetch(url, {
    mode: "cors",
    credentials: "omit",
    cache: "reload",
    signal,
  });
  if (!response.ok) throw new Error(`Template CDN returned HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.size || !blob.type.startsWith("image/")) {
    throw new Error("Template CDN returned invalid image data");
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await makeImage(objectUrl, { cors: false, signal });
    // A blob backed <img> is decoded; revoke once the image has loaded.
    // Revoke after it is no longer in active use (cleanup handles this).
    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** Only publicly served template and editor-frame images can use the emergency
 * same-origin fallback. User/profile assets remain on their separate image flow. */
export function isCdnTemplateImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "cdn.mlmposter.com" &&
      ["/templates/", "/topuplineframe/", "/footers/"].some((prefix) => url.pathname.startsWith(prefix)) &&
      /\.(webp|png|jpe?g|avif|gif)$/i.test(url.pathname);
  } catch { return false; }
}

async function loadCdnProxyFallback(source, signal) {
  const proxy = `/api/template-image?url=${encodeURIComponent(source)}`;
  const response = await fetch(proxy, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`Canvas image fallback returned ${response.status}`);
  const blob = await response.blob();
  if (!blob.size || !/^image\/(?:webp|png|jpeg|avif|gif)/i.test(blob.type)) {
    throw new Error("Canvas image fallback did not return a supported image");
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await makeImage(objectUrl, { cors: false, signal });
    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** Returns [image, status, retry]. No auth, no Firestore or image URL rewriting. */
export default function useTemplateCanvasImage(source) {
  const src = useMemo(() => (typeof source === "string" ? source.trim() : ""), [source]);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState({ src: "", status: "idle", image: null });

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let timeout = null;
    let objectUrl = null;
    // End a stuck CDN/fallback fetch rather than leave the canvas spinner forever.
    // The user can then retry without leaving the editor.
    const watchdog = setTimeout(() => {
      if (!signal.aborted) {
        controller.abort();
        setState((current) => current.src === src
          ? { src, status: "failed", image: null }
          : current);
      }
    }, 35000);
    if (!src) {
      setState({ src, status: "idle", image: null });
      return () => { clearTimeout(watchdog); controller.abort(); };
    }
    const cached = decodedImages.get(src);
    if (cached && retryToken === 0) {
      clearTimeout(watchdog);
      rememberDecoded(src, cached);
      setState({ src, status: "loaded", image: cached });
      return () => controller.abort();
    }
    setState({ src, status: "loading", image: null });

    const run = async () => {
      for (let attempt = 0; attempt < RETRY_DELAYS.length && !signal.aborted; attempt += 1) {
        if (RETRY_DELAYS[attempt]) {
          setState({ src, status: "retrying", image: null });
          await new Promise((resolve) => {
            timeout = setTimeout(resolve, RETRY_DELAYS[attempt]);
            signal.addEventListener("abort", resolve, { once: true });
          });
        }
        if (signal.aborted) break;
        try {
          const image = await makeImage(src, { cors: true, signal });
          if (signal.aborted) return;
          clearTimeout(watchdog);
          rememberDecoded(src, image);
          setState({ src, status: "loaded", image });
          return;
        } catch (error) {
          if (signal.aborted) return;
          // Browser tab display is not proof of canvas CORS permission.
          // If CDN requests fail twice, first try a fresh CORS fetch, then a
          // strictly whitelisted same-origin server fallback as a last resort.
          if (attempt === RETRY_DELAYS.length - 1 && isRemoteTemplateUrl(src)) {
            const fallbackLoaders = [() => loadBlobFallback(src, signal)];
            if (isCdnTemplateImageUrl(src)) {
              fallbackLoaders.push(() => loadCdnProxyFallback(src, signal));
            }
            for (const loadFallback of fallbackLoaders) {
              if (signal.aborted) return;
              try {
                const result = await loadFallback();
                if (signal.aborted) { URL.revokeObjectURL(result.objectUrl); return; }
                objectUrl = result.objectUrl;
                clearTimeout(watchdog);
                // Do not retain an object-URL-backed image after its Blob URL
                // is revoked at unmount. Direct CDN images remain LRU cached.
                setState({ src, status: "loaded", image: result.image });
                return;
              } catch (fallbackError) {
                if (signal.aborted) return;
                console.warn("[MLMLIVE] Canvas image load fallback failed:", fallbackError);
              }
            }
          }
        }
      }
      if (!signal.aborted) {
        clearTimeout(watchdog);
        setState({ src, status: "failed", image: null });
      }
    };
    void run();
    return () => {
      clearTimeout(watchdog);
      controller.abort();
      if (timeout) clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, retryToken]);
  // Render no stale previous template while current image request is in flight.
  const currentState = state.src === src ? state : { src, status: src ? "loading" : "idle", image: null };
  return [currentState.image, currentState.status, () => setRetryToken((n) => n + 1)];
}
