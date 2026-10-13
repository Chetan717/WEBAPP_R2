import { useEffect, useMemo, useState } from "react";

export const normalizeImageSources = (sources) => {
  const input = Array.isArray(sources) ? sources : [sources];
  const unique = [];
  const seen = new Set();

  for (const value of input) {
    if (typeof value !== "string") continue;
    const source = value.trim();
    if (
      !source ||
      /^(null|undefined|\[object Object\])$/i.test(source) ||
      seen.has(source)
    ) {
      continue;
    }
    seen.add(source);
    unique.push(source);
  }

  return unique;
};

function isRemoteHttpUrl(source) {
  return /^https?:\/\//i.test(source || "");
}

function loadImageElement(source, { anonymous = false } = {}) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    if (anonymous) image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image failed to load: ${source}`));
    image.src = source;
  });
}

async function loadCorsSafeRemoteImage(source, signal) {
  // Fetching the remote profile image as a Blob avoids stale no-CORS image
  // cache entries and guarantees the image handed to Konva is canvas-safe.
  const response = await fetch(source, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "reload",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status}): ${source}`);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error(`Image fetch returned an empty file: ${source}`);

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    return { image, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Load the first usable image source for a Konva/canvas image.
 *
 * For remote Firebase/R2 images we first fetch as a CORS-approved Blob. This
 * fixes the common case where the URL opens in a browser tab but fails inside
 * canvas because an older cached response had no Access-Control-Allow-Origin.
 */
export default function useResilientCanvasImage(sources, maxRetriesPerSource = 1) {
  const normalizedSources = useMemo(
    () => normalizeImageSources(sources),
    [Array.isArray(sources) ? sources.join("\u0001") : String(sources || "")],
  );
  const sourceKey = useMemo(
    () => normalizedSources.join("\u0001"),
    [normalizedSources],
  );
  const [loadedImage, setLoadedImage] = useState(null);
  const [status, setStatus] = useState(
    normalizedSources.length > 0 ? "loading" : "idle",
  );

  useEffect(() => {
    let cancelled = false;
    let activeObjectUrl = null;
    const controller = new AbortController();

    if (normalizedSources.length === 0 || typeof window === "undefined") {
      setLoadedImage(null);
      setStatus("idle");
      return undefined;
    }

    setLoadedImage(null);
    setStatus("loading");

    const run = async () => {
      for (const source of normalizedSources) {
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetriesPerSource; attempt += 1) {
          if (cancelled) return;
          try {
            let result;
            if (isRemoteHttpUrl(source)) {
              try {
                result = await loadCorsSafeRemoteImage(source, controller.signal);
              } catch (fetchError) {
                lastError = fetchError;

                // Mobile Chrome/WebView can keep an old opaque/no-CORS cache
                // entry even after R2/Firebase CORS is fixed. When direct CORS
                // fetch fails, use our same-origin Vercel image proxy. The
                // proxy is restricted to mlmprofiles assets only and returns a
                // normal image response that is always safe for Konva/canvas.
                try {
                  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(source)}`;
                  result = await loadCorsSafeRemoteImage(proxyUrl, controller.signal);
                } catch (proxyError) {
                  lastError = proxyError;
                  // Final compatibility attempt for browsers where anonymous
                  // image loading works even though fetch behaves differently.
                  const image = await loadImageElement(source, { anonymous: true });
                  result = { image, objectUrl: null };
                }
              }
            } else {
              const image = await loadImageElement(source);
              result = { image, objectUrl: null };
            }

            if (cancelled) {
              if (result.objectUrl) URL.revokeObjectURL(result.objectUrl);
              return;
            }

            if (activeObjectUrl && activeObjectUrl !== result.objectUrl) {
              URL.revokeObjectURL(activeObjectUrl);
            }
            activeObjectUrl = result.objectUrl;
            setLoadedImage(result.image);
            setStatus("loaded");
            return;
          } catch (error) {
            if (error?.name === "AbortError") return;
            lastError = error;
            if (attempt < maxRetriesPerSource) {
              setStatus("retrying");
              await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)));
            }
          }
        }

        console.warn("[canvas-image] source failed, trying next candidate:", source, lastError);
        setStatus("loading");
      }

      if (!cancelled) {
        setLoadedImage(null);
        setStatus("failed");
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    };
  }, [maxRetriesPerSource, sourceKey]);

  return [loadedImage, status];
}
