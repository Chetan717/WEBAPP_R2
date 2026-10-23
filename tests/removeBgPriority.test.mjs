import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let serial = 0;
const dataModule = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const originalSource = readFileSync(new URL("../src/pages/mainform/utils/removeBg.js", import.meta.url), "utf8");

async function runtime(options = {}) {
  const key = `__bgPriorityTest${++serial}`;
  const calls = [];
  let primaryRuns = 0;
  let session = null;
  const fixture = {
    async capability() { calls.push("capability"); return { supported: options.supported !== false }; },
    async prepare(report) {
      if (!session) {
        calls.push("primary-session");
        session = options.prepare ? options.prepare(report) : Promise.resolve();
      }
      await session;
    },
    async primary(file, report, signal) {
      calls.push("birefnet"); primaryRuns += 1;
      await fixture.prepare(report);
      if (options.abortPrimary) throw new DOMException("Cancelled", "AbortError");
      if (options.failPrimary || primaryRuns <= (options.retryableFailures || 0)) {
        const error = new Error("Primary failed");
        error.removeBgRetryable = Boolean(options.retryableFailures);
        error.removeBgUnsupported = Boolean(options.unsupportedPrimary);
        throw error;
      }
      await options.onPrimary?.(file, signal);
      report?.("BiRefNet inference", 58);
      return new Blob([options.primaryMask || "valid"]);
    },
    async preloadFallback() { calls.push("modnet-preload"); },
    async fallback() {
      calls.push("modnet");
      if (options.failFallback) throw new Error("Fallback failed");
      return new Blob([options.fallbackMask || "valid"]);
    },
    resetPrimary() { calls.push("primary-reset"); session = null; },
    resetFallback() { calls.push("fallback-reset"); },
  };
  globalThis[key] = fixture;
  const primary = dataModule(`const f=globalThis.${key}; export const getBirefNetCapability=f.capability; export const preloadBirefNet=f.prepare; export const removeBackgroundWithBirefNet=f.primary; export const resetBirefNetEngine=f.resetPrimary;`);
  const fallback = dataModule(`const f=globalThis.${key}; export const preloadModNet=f.preloadFallback; export const removeBackgroundWithModNet=f.fallback; export const resetModNetEngine=f.resetFallback;`);
  const source = originalSource.replace('import("./birefnetBg.js")', `import(${JSON.stringify(primary)})`).replace('import("./modnetBg.js")', `import(${JSON.stringify(fallback)})`);
  const descriptors = Object.fromEntries(["window", "document", "navigator", "createImageBitmap"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: {} },
    navigator: { configurable: true, value: { userAgent: "Android Mobile", userAgentData: { mobile: true } } },
    createImageBitmap: { configurable: true, value: async blob => ({ width: 10, height: 10, mask: await blob.text(), close() {} }) },
    document: { configurable: true, value: { createElement() {
      let bitmap;
      return { getContext() { return { drawImage(image) { bitmap = image; }, getImageData() {
        const data = new Uint8ClampedArray(400);
        for (let pixel = 0; pixel < 100; pixel += 1) data[pixel * 4 + 3] = bitmap.mask === "blank" ? 0 : bitmap.mask === "opaque" || pixel < 50 ? 255 : 0;
        return { data };
      } }; } };
    } } },
  });
  const api = await import(dataModule(source));
  return { api, calls, cleanup() {
    delete globalThis[key];
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  } };
}
const photo = () => new Blob(["input photo"], { type: "image/png" });
async function using(options, callback) {
  const instance = await runtime(options);
  try { await callback(instance); } finally { instance.cleanup(); }
}

test("supported mobile uses BiRefNet for the very first removal without loading MODNet", async () => {
  await using({}, async ({ api, calls }) => {
    const result = await api.removeBg(photo());
    assert.equal(await result.text(), "valid");
    assert.equal(calls.filter(value => value === "birefnet").length, 1);
    assert.ok(!calls.some(value => value.startsWith("modnet")));
  });
});

test("first removal waits for the shared BiRefNet preload instead of choosing the ready fallback", async () => {
  let ready;
  await using({ prepare: () => new Promise(resolve => { ready = resolve; }) }, async ({ api, calls }) => {
    const warming = api.preloadBgModel();
    while (!ready) await new Promise(resolve => setImmediate(resolve));
    const pending = api.removeBg(photo());
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(!calls.includes("modnet"));
    ready();
    assert.equal(await warming, "birefnet");
    await pending;
    assert.equal(calls.filter(value => value === "primary-session").length, 1);
  });
});

test("unsupported WebGPU skips BiRefNet download and uses MODNet in the same action", async () => {
  await using({ supported: false }, async ({ api, calls }) => {
    await api.preloadBgModel();
    await api.removeBg(photo());
    assert.ok(calls.includes("modnet"));
    assert.ok(!calls.includes("primary-session"));
    assert.ok(!calls.includes("birefnet"));
  });
});

test("BiRefNet inference failure falls back to MODNet for the same photo", async () => {
  await using({ failPrimary: true }, async ({ api, calls }) => {
    const result = await api.removeBg(photo());
    assert.equal(await result.text(), "valid");
    assert.ok(calls.indexOf("birefnet") < calls.indexOf("modnet"));
  });
});

test("a confirmed incompatible BiRefNet provider stays on MODNet until runtime refresh", async () => {
  await using({ failPrimary: true, unsupportedPrimary: true }, async ({ api, calls }) => {
    await api.removeBg(photo());
    await api.removeBg(photo());
    assert.equal(calls.filter(value => value === "birefnet").length, 1);
    assert.equal(calls.filter(value => value === "modnet").length, 2);
  });
});

test("Cancel during a pending primary preload rejects immediately without fallback", async () => {
  let ready;
  await using({ prepare: () => new Promise(resolve => { ready = resolve; }) }, async ({ api, calls }) => {
    const warming = api.preloadBgModel();
    while (!ready) await new Promise(resolve => setImmediate(resolve));
    const controller = new AbortController();
    const processing = api.removeBg(photo(), null, controller.signal);
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(processing, { name: "AbortError" });
    assert.ok(!calls.includes("modnet"));
    ready();
    await warming;
    // Drain the serialized work before restoring the browser doubles.
    await api.removeBg(photo());
    assert.ok(!calls.includes("modnet"));
  });
});

test("a failed silent BiRefNet preload cannot gate or disable the fallback", async () => {
  await using({ prepare: () => Promise.reject(new Error("Download failed")) }, async ({ api, calls }) => {
    await assert.rejects(api.preloadBgModel(), /Download failed/);
    await api.removeBg(photo());
    assert.ok(calls.includes("modnet"));
  });
});

for (const primaryMask of ["blank", "opaque"]) {
  test(`${primaryMask} BiRefNet output is rejected and replaced by a valid MODNet cutout`, async () => {
    await using({ primaryMask }, async ({ api, calls }) => {
      assert.equal(await (await api.removeBg(photo())).text(), "valid");
      assert.ok(calls.includes("modnet"));
    });
  });
}

test("a transient startup failure retries BiRefNet once without loading MODNet", async () => {
  await using({ retryableFailures: 1 }, async ({ api, calls }) => {
    await api.removeBg(photo());
    assert.equal(calls.filter(value => value === "birefnet").length, 2);
    assert.equal(calls.filter(value => value === "primary-reset").length, 1);
    assert.ok(!calls.includes("modnet"));
  });
});

test("an exhausted BiRefNet startup retry falls back once", async () => {
  await using({ retryableFailures: 2 }, async ({ api, calls }) => {
    await api.removeBg(photo());
    assert.equal(calls.filter(value => value === "birefnet").length, 2);
    assert.equal(calls.filter(value => value === "modnet").length, 1);
  });
});

test("Cancel stops the action and never triggers MODNet", async () => {
  await using({ abortPrimary: true }, async ({ api, calls }) => {
    await assert.rejects(api.removeBg(photo()), { name: "AbortError" });
    assert.ok(!calls.includes("modnet"));
  });
});

test("both engine failures reject rather than accepting the original photo", async () => {
  await using({ failPrimary: true, failFallback: true }, async ({ api }) => {
    await assert.rejects(api.removeBg(photo()), /Background remove/);
  });
});

test("inference actions are serialized and the next photo still attempts BiRefNet first", async () => {
  let active = 0, maximum = 0;
  await using({ onPrimary: async () => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve)); active -= 1;
  } }, async ({ api, calls }) => {
    await Promise.all([api.removeBg(photo()), api.removeBg(photo())]);
    assert.equal(maximum, 1);
    assert.equal(calls.filter(value => value === "birefnet").length, 2);
    assert.ok(!calls.includes("modnet"));
  });
});
