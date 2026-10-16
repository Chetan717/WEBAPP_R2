/* Off-main-thread encode for final transparent crop.
 * Exactly the same canvas dimensions and requested PNG/WebP format.
 * A broken/missing worker is handled by the caller's canvas.toBlob fallback.
 */
self.onmessage = async ({ data }) => {
  const { id, bitmap, type, quality } = data || {};
  try {
    if (!bitmap || typeof OffscreenCanvas === "undefined") {
      throw new Error("OffscreenCanvas not supported in worker");
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Worker canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type, quality });
    self.postMessage({ id, blob });
  } catch (error) {
    bitmap?.close?.();
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
