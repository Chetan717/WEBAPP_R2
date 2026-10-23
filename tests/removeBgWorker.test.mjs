import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let serial = 0;
async function using(check) {
  const previous = Object.fromEntries(["Worker", "OffscreenCanvas", "createImageBitmap"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const workers = [];
  class Worker {
    constructor() { this.messages = []; this.terminated = false; workers.push(this); }
    postMessage(data) { this.messages.push(data); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data }); }
  }
  Object.defineProperties(globalThis, {
    Worker: { configurable: true, value: Worker },
    OffscreenCanvas: { configurable: true, value: function () {} },
    createImageBitmap: { configurable: true, value: function () {} },
  });
  const source = readFileSync(new URL("../src/pages/mainform/utils/birefnetWorkerClient.js", import.meta.url), "utf8")
    .replace('import { getBirefNetCapability as getEngineCapability } from "./birefnetBg.js";', 'const getEngineCapability = async () => ({ supported: true });')
    .replace('new URL("./birefnetWorker.js", import.meta.url)', '"worker-test-url"');
  const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#worker-${++serial}`);
  try { await check({ api, workers }); }
  finally {
    api.resetBirefNetEngine();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("preload and photo processing use the same worker and report their actual progress", async () => {
  await using(async ({ api, workers }) => {
    const events = [];
    const preload = api.preloadBirefNet((stage, pct) => events.push([stage, pct]));
    const process = api.removeBackgroundWithBirefNet(new Blob(["photo"]));
    assert.equal(workers.length, 1);
    const [init, action] = workers[0].messages;
    assert.equal(init.type, "preload");
    assert.equal(action.type, "process");
    workers[0].reply({ id: init.id, type: "progress", stage: "Cached model", percentage: 30 });
    workers[0].reply({ id: init.id, type: "done", value: "birefnet-webgpu" });
    workers[0].reply({ id: action.id, type: "done", value: new Blob(["cutout"]) });
    assert.equal(await preload, "birefnet-webgpu");
    assert.equal(await (await process).text(), "cutout");
    assert.deepEqual(events, [["Cached model", 30]]);
  });
});

test("Cancel releases the worker and all pending work, then a new photo can start", async () => {
  await using(async ({ api, workers }) => {
    const controller = new AbortController();
    const preload = api.preloadBirefNet();
    const process = api.removeBackgroundWithBirefNet(new Blob(["photo"]), undefined, controller.signal);
    const rejected = Promise.all([
      assert.rejects(preload, { name: "AbortError" }),
      assert.rejects(process, { name: "AbortError" }),
    ]);
    controller.abort();
    await rejected;
    assert.equal(workers[0].terminated, true);
    const next = api.removeBackgroundWithBirefNet(new Blob(["next photo"]));
    assert.equal(workers.length, 2);
    workers[1].reply({ id: workers[1].messages[0].id, type: "done", value: new Blob(["next cutout"]) });
    assert.equal(await (await next).text(), "next cutout");
  });
});

test("worker runtime failures retain the tags needed for same-action fallback", async () => {
  await using(async ({ api, workers }) => {
    const pending = api.preloadBirefNet();
    const rejected = assert.rejects(pending, { message: "WebGPU unavailable", removeBgUnsupported: true, removeBgStage: "engine-init" });
    workers[0].reply({ id: workers[0].messages[0].id, type: "error", error: {
      message: "WebGPU unavailable", removeBgUnsupported: true, removeBgStage: "engine-init",
    } });
    await rejected;
  });
});

test("a crashed worker rejects pending work instead of leaving the photo queue stuck", async () => {
  await using(async ({ api, workers }) => {
    const pending = api.preloadBirefNet();
    const rejected = assert.rejects(pending, { message: "GPU process lost", removeBgUnsupported: true });
    let prevented = false;
    workers[0].onerror({ message: "GPU process lost", preventDefault() { prevented = true; } });
    await rejected;
    assert.equal(prevented, true);
    assert.equal(workers[0].terminated, true);
  });
});

test("an unsupported image-worker environment is rejected before model download", async () => {
  await using(async ({ api }) => {
    Object.defineProperty(globalThis, "OffscreenCanvas", { configurable: true, value: undefined });
    assert.deepEqual(await api.getBirefNetCapability(), { supported: false, reason: "image-worker-unavailable" });
  });
});
