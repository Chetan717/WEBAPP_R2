import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let serial = 0;
async function capability({ f16 = true, gpu = true, memory = 8, cores = 8, adapter = true } = {}) {
  const previous = Object.fromEntries(["window", "navigator"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    userAgent: "Android Mobile", deviceMemory: memory, hardwareConcurrency: cores,
    gpu: gpu ? { requestAdapter: async () => adapter ? { features: new Set(f16 ? ["shader-f16"] : []), limits: { maxStorageBuffersPerShaderStage: 8 } } : null } : undefined,
  } });
  try {
    const source = readFileSync(new URL("../src/pages/mainform/utils/birefnetBg.js", import.meta.url), "utf8").replace(/from "(\.[^"]+)"/g, (_, spec) => `from "${new URL(spec, new URL("../src/pages/mainform/utils/", import.meta.url)).href}"`)
    .replaceAll("import.meta.env", "{}");
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#capability-${++serial}`);
    return await module.getBirefNetCapability();
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("a capable mobile WebGPU/FP16 device is eligible for BiRefNet", async () => {
  assert.equal((await capability()).supported, true);
});
test("WebGPU without FP16 is rejected before downloading the FP16 model", async () => {
  assert.deepEqual(await capability({ f16: false }), { supported: false, reason: "webgpu-fp16-unavailable" });
});
test("a device without WebGPU can use the MODNet fallback", async () => {
  assert.deepEqual(await capability({ gpu: false }), { supported: false, reason: "webgpu-unavailable" });
});
test("low-memory devices keep the existing safe fallback policy", async () => {
  assert.deepEqual(await capability({ memory: 2 }), { supported: false, reason: "low-device-memory" });
});
test("an unavailable WebGPU adapter is treated as unsupported", async () => {
  assert.deepEqual(await capability({ adapter: false }), { supported: false, reason: "webgpu-adapter-unavailable" });
});
test("a capable GPU is not rejected merely because the browser exposes two CPU cores", async () => {
  assert.equal((await capability({ cores: 2 })).supported, true);
});
