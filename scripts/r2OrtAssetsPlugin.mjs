// Vite otherwise emits ONNX Runtime's built-in fallback WASM URLs even when
// wasmBinary is set. Point those dormant URLs at R2 as a second safety layer.
export function r2OrtAssetsPlugin() {
  let base = "https://models.mlmposter.com/ort/1.21.0/";
  return {
    name: "mlmlive-r2-only-ort-assets",
    enforce: "pre",
    configResolved(config) {
      base = String(config.env.VITE_ORT_ASSET_BASE_URL || base).replace(/\/+$/, "") + "/";
      const url = new URL(base);
      if (url.protocol !== "https:" || /(^|\.)vercel\.app$/.test(url.hostname) || url.hostname === "app.mlmlive.in") {
        throw new Error("VITE_ORT_ASSET_BASE_URL must point at the external model CDN.");
      }
    },
    transform(code, id) {
      if (!id.replaceAll("\\", "/").includes("/onnxruntime-web/dist/")) return null;
      const updated = code.replace(
        /new URL\((["'])(ort-wasm-simd-threaded(?:\.jsep)?\.wasm)\1,\s*import\.meta\.url\)/g,
        (_match, _quote, name) => `new URL(${JSON.stringify(base + name)})`,
      );
      return updated === code ? null : { code: updated, map: null };
    },
  };
}
