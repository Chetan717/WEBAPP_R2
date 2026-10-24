import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

let serial = 0;
async function urls(environment) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.mlmlive.in/mlmprofile" } } });
  const load = async (name, exports = "") => {
    const source = readFileSync(new URL(`../src/pages/mainform/utils/${name}.js`, import.meta.url), "utf8").replace(/from "(\.[^"]+)"/g, (_, spec) => `from "${new URL(spec, new URL("../src/pages/mainform/utils/", import.meta.url)).href}"`)
    .replaceAll("import.meta.env", JSON.stringify({ BASE_URL: "/", ...environment }));
    return import(`data:text/javascript;base64,${Buffer.from(source + exports).toString("base64")}#${++serial}`);
  };
  try {
    const quality = await load("birefnetBg");
    const fallback = await load("modnetBg", "\nexport { remoteModelUrl };\n");
    return { quality: new URL(quality.getBirefNetModelUrl()), fallback: fallback.remoteModelUrl() };
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete globalThis.window;
  }
}

test("correct production model URLs retain stable version keys without the extra models directory", async () => {
  const result = await urls({ VITE_BIREFNET_MODEL_URL: "https://models.mlmposter.com/birefnet/model_fp16.onnx", VITE_MODNET_ASSET_BASE_URL: "https://models.mlmposter.com/modnet/" });
  assert.equal(result.quality.pathname, "/birefnet/model_fp16.onnx");
  assert.ok(result.quality.searchParams.get("v"));
  assert.equal(new URL(result.fallback).pathname, "/modnet/modnet.onnx");
  assert.ok(new URL(result.fallback).searchParams.get("v"));
});

test("old Vercel environment values are repaired for both known model paths", async () => {
  const result = await urls({ VITE_BIREFNET_MODEL_URL: "https://models.mlmposter.com/models/birefnet/model_fp16.onnx", VITE_MODNET_ASSET_BASE_URL: "https://models.mlmposter.com/models/modnet/" });
  assert.equal(result.quality.pathname, "/birefnet/model_fp16.onnx");
  assert.equal(new URL(result.fallback).pathname, "/modnet/modnet.onnx");
});

test("custom model hosts and object paths are preserved", async () => {
  const result = await urls({ VITE_BIREFNET_MODEL_URL: "https://custom.example/models/quality.onnx?token=public", VITE_MODNET_ASSET_BASE_URL: "https://custom.example/models/portrait" });
  assert.equal(result.quality.pathname, "/models/quality.onnx");
  assert.equal(result.quality.searchParams.get("token"), "public");
  assert.equal(new URL(result.fallback).pathname, "/models/portrait/modnet.onnx");
});

test("default BiRefNet URL is correct and MODNet keeps same-origin fallback when no remote is configured", async () => {
  const result = await urls({});
  assert.equal(result.quality.origin + result.quality.pathname, "https://models.mlmposter.com/birefnet/model_fp16.onnx");
  assert.equal(result.fallback, "");
});
