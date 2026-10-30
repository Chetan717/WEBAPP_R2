import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { resolveModnetModelUrl, getOrtWasmUrl, requireRemoteAiUrl } from "../src/pages/mainform/utils/aiAssetUrls.js";
import { loadOrtWasmBinary, configureR2Runtime } from "../src/pages/mainform/utils/ortR2Runtime.js";
import { r2OrtAssetsPlugin } from "../scripts/r2OrtAssetsPlugin.mjs";

const wasm = new Uint8Array(await readFile(new URL("../r2-upload/ort/1.21.0/ort-wasm-simd-threaded.wasm", import.meta.url)));
const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
const originalLocation = globalThis.location;

test("folder and old full-file env values resolve to the same R2 model", () => {
  for (const base of ["https://models.mlmposter.com/modnet", "https://models.mlmposter.com/modnet/", "https://models.mlmposter.com/modnet/modnet.onnx", "https://models.mlmposter.com/modnet/model.onnx"]) {
    assert.equal(resolveModnetModelUrl(base, "v3"), "https://models.mlmposter.com/modnet/modnet.onnx?v=v3");
  }
  assert.equal(getOrtWasmUrl("webgpu"), "https://models.mlmposter.com/ort/1.21.0/ort-wasm-simd-threaded.jsep.wasm");
});

test("same-origin, Vercel and non-HTTPS AI endpoints are rejected", () => {
  for (const url of ["https://app.mlmlive.in/modnet/modnet.onnx", "https://preview.vercel.app/a.wasm", "http://models.mlmposter.com/a.wasm", "https://user:pass@models.mlmposter.com/a.wasm"]) {
    assert.throws(() => requireRemoteAiUrl(url));
  }
  assert.throws(() => requireRemoteAiUrl("https://example.com/a.wasm", "https://example.com"));
});

test("WASM is fetched once concurrently, reused after reload, and never falls back locally", async () => {
  const stored = new Map();
  let calls = 0;
  const cache = {
    match: async (key) => stored.get(key)?.clone(),
    put: async (key, response) => { stored.set(key, response.clone()); },
    delete: async (key) => stored.delete(key),
  };
  try {
    globalThis.caches = { open: async () => cache };
    globalThis.location = { origin: "https://app.mlmlive.in", href: "https://app.mlmlive.in/" };
    globalThis.fetch = async (url) => {
      assert.equal(new URL(url).hostname, "models.mlmposter.com");
      calls += 1;
      return new Response(wasm, { headers: { "Content-Type": "application/wasm" } });
    };
    const url = getOrtWasmUrl();
    const [first, second] = await Promise.all([loadOrtWasmBinary(url), loadOrtWasmBinary(url)]);
    assert.equal(calls, 1);
    assert.equal(first.length, wasm.length);
    assert.equal(second.length, wasm.length);
    const ort = { env: { wasm: {} } };
    await configureR2Runtime(ort);
    assert.equal(calls, 1, "persistent cache must avoid a later network transfer");
    assert.equal(ort.env.wasm.wasmBinary.length, wasm.length);
    assert.equal(ort.env.wasm.numThreads, 1);
    assert.equal(ort.env.wasm.proxy, false);
    assert.match(ort.env.wasm.wasmPaths.mjs, /^https:\/\/app\.mlmlive\.in\/ort\/1\.21\.0\/.+\.mjs$/);

    stored.clear();
    globalThis.fetch = async (request) => {
      calls += 1;
      assert.equal(new URL(request).hostname, "models.mlmposter.com");
      return new Response("CDN not configured", { status: 404 });
    };
    await assert.rejects(loadOrtWasmBinary(url), /404/);
    await assert.rejects(loadOrtWasmBinary(url), /404/);
    assert.equal(calls, 3, "failed requests may retry R2, never the app origin");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
    globalThis.location = originalLocation;
  }
});

test("truncated cached WASM is discarded before a new CDN fetch", async () => {
  let removed = false;
  try {
    globalThis.caches = { open: async () => ({
      match: async () => new Response(wasm.slice(0, 64)),
      delete: async () => { removed = true; },
      put: async () => {},
    }) };
    globalThis.fetch = async () => new Response(wasm);
    assert.equal((await loadOrtWasmBinary(getOrtWasmUrl())).length, wasm.length);
    assert.equal(removed, true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("Vite rewrites dormant package WASM URLs to R2", () => {
  const plugin = r2OrtAssetsPlugin();
  plugin.configResolved({ env: {} });
  const result = plugin.transform('const a=new URL("ort-wasm-simd-threaded.jsep.wasm",import.meta.url)', "/app/node_modules/onnxruntime-web/dist/ort.webgpu.bundle.min.mjs");
  assert.match(result.code, /https:\/\/models\.mlmposter\.com\/ort\/1\.21\.0\//);
  assert.doesNotMatch(result.code, /import\.meta\.url/);
});

test("deployment guard rejects an accidentally copied heavy binary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mlmlive-ai-guard-"));
  const script = fileURLToPath(new URL("../scripts/assert-no-local-ai-assets.mjs", import.meta.url));
  try {
    await writeFile(join(dir, "index.html"), "app");
    assert.equal(spawnSync(process.execPath, [script, dir]).status, 0);
    await writeFile(join(dir, "accidental.wasm"), "binary");
    assert.equal(spawnSync(process.execPath, [script, dir]).status, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
