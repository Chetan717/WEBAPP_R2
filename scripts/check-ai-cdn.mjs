import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../r2-setup/manifest.json", import.meta.url), "utf8"));
const base = String(process.env.VITE_ORT_ASSET_BASE_URL || "https://models.mlmposter.com/ort/1.21.0/").replace(/\/+$/, "") + "/";
let failed = false;
for (const item of manifest.assets) {
  const url = item.key.startsWith("ort/")
    ? new URL(item.key.split("/").at(-1), base).href
    : new URL(item.key, manifest.baseUrl).href;
  try {
    const response = await fetch(url, {
      method: "HEAD", headers: { Origin: "https://app.mlmlive.in" },
      signal: AbortSignal.timeout(15000),
    });
    const errors = [];
    const allowed = response.headers.get("access-control-allow-origin");
    if (!response.ok) errors.push(`HTTP ${response.status}`);
    if (allowed !== "*" && allowed !== "https://app.mlmlive.in") errors.push("CORS header missing/wrong");
    if (Number(response.headers.get("content-length")) !== item.size) errors.push("file size differs from package");
    if (!response.headers.get("cache-control")?.includes("max-age=")) errors.push("Cache-Control missing");
    if (item.contentType === "application/wasm" && !response.headers.get("content-type")?.startsWith("application/wasm")) errors.push("WASM MIME should be application/wasm");
    console.log(errors.length ? "FAIL" : "PASS", item.key, errors.join("; "));
    if (errors.length) failed = true;
  } catch (error) {
    failed = true;
    console.log("FAIL", item.key, error.message);
  }
}
process.exitCode = failed ? 1 : 0;
