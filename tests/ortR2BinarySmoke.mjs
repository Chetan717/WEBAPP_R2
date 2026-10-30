// Verifies real inference with the exact binary/loader pairs shipped for R2.
// The WebGPU/JSEP variant is exercised through its WASM execution provider;
// this does not claim to test physical WebGPU hardware or a production CDN.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backend = process.argv[2] || "wasm";
assert.ok(backend === "wasm" || backend === "webgpu");
const suffix = backend === "webgpu" ? ".jsep" : "";
const module = backend === "webgpu"
  ? await import("onnxruntime-web/webgpu")
  : await import("onnxruntime-web/wasm");
const ort = module.default || module;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  wasm: `https://models.mlmposter.com/ort/1.21.0/ort-wasm-simd-threaded${suffix}.wasm`,
  mjs: new URL(`../public/ort/1.21.0/ort-wasm-simd-threaded${suffix}.mjs`, import.meta.url).href,
};
ort.env.wasm.wasmBinary = new Uint8Array(await readFile(new URL(`../r2-upload/ort/1.21.0/ort-wasm-simd-threaded${suffix}.wasm`, import.meta.url)));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`Unexpected runtime download: ${url}`); };
try {
  const session = await ort.InferenceSession.create(
    new Uint8Array(await readFile(new URL("../r2-upload/modnet/modnet.onnx", import.meta.url))),
    { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
  );
  const input = new ort.Tensor("float32", new Float32Array(3 * 64 * 64), [1, 3, 64, 64]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const matte = output[session.outputNames[0]];
  assert.equal(matte.data.length, 64 * 64);
  assert.ok(matte.data.every(Number.isFinite));
  console.log(JSON.stringify({ backend, actualInference: true, outputPixels: matte.data.length, runtimeNetworkRequests: 0 }));
  matte.dispose?.();
  input.dispose?.();
  await session.release();
} finally {
  globalThis.fetch = originalFetch;
}
