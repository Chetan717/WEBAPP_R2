import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const model = new Uint8Array(1024);
model[0] = 8;
const binary = () => new Response(model, { headers: { "content-type": "application/octet-stream", "content-length": "1024" } });
const current = "mlmlive-ai-models-v3";
const modelUrl = "https://models.mlmposter.com/birefnet/model_fp16.onnx?v=birefnet-lite-512-fp16-2026-10-09-v1";
let serial = 0;

async function using({ entries = [], fetchResponse = binary, configuredUrl } = {}, check) {
  const originals = Object.fromEntries(["window", "location", "caches", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const stores = new Map();
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name);
    const key = request => typeof request === "string" ? request : request.url;
    return {
      match: async request => data.get(key(request))?.clone(),
      keys: async () => [...data.keys()].map(url => new Request(url)),
      put: async (request, response) => data.set(key(request), response.clone()),
      delete: async request => data.delete(key(request)),
    };
  };
  for (const [name, url, response] of entries) await cache(name).put(url, response);
  const calls = [];
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { location: { href: "https://app.example/" } } },
    caches: { configurable: true, value: { keys: async () => [...stores.keys()], open: async name => cache(name) } },
    fetch: { configurable: true, value: async request => { calls.push(request.url); return fetchResponse(); } },
  });
  // Small deterministic ONNX-shaped bytes exercise cache/transport behavior;
  // real shipped binaries are checked separately by inference/browser smoke.
  const source = readFileSync(new URL("../src/pages/mainform/utils/birefnetBg.js", import.meta.url), "utf8")
    .replace(/from "(\.[^"]+)"/g, (_, spec) => `from "${new URL(spec, new URL("../src/pages/mainform/utils/", import.meta.url)).href}"`)
    .replaceAll("import.meta.env", JSON.stringify({ VITE_BIREFNET_MODEL_URL: configuredUrl }))
    .replace("const MODEL_BYTES = 98_484_532", "const MODEL_BYTES = 1024")
    .replace("bytes.length < 1_000_000", "bytes.length < 32");
  const api = await import(`data:text/javascript;base64,${Buffer.from(source + "\nexport { fetchModel };\n").toString("base64")}#cache-${++serial}`);
  try { await check({ api, calls, cache }); }
  finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("a cold model is downloaded once, persisted completely, then reused", async () => {
  await using({}, async ({ api, calls, cache }) => {
    assert.deepEqual(await api.fetchModel(), model);
    assert.deepEqual(await api.fetchModel(), model);
    assert.equal(calls.length, 1);
    assert.equal((await (await cache(current).match(modelUrl)).arrayBuffer()).byteLength, 1024);
  });
});

for (const [name, url] of [
  [current, "https://models.mlmposter.com/birefnet/model_fp16.onnx"],
  [current, "https://models.mlmposter.com/models/birefnet/model_fp16.onnx?v=birefnet-lite-512-fp16-2026-10-09-v1"],
  ["mlmlive-birefnet-lite-512-fp16-v1", "https://cdn.mlmposter.com/models/birefnet/model_fp16.onnx?mlmlive-cache=v1"],
  ["mlmlive-birefnet-lite-512-fp16-v1", "https://huggingface.co/studioludens/birefnet-lite-512/resolve/main/onnx/model_fp16.onnx?mlmlive-cache=v1"],
]) {
  test(`reuse an existing model without a network call: ${url}`, async () => {
    await using({ entries: [[name, url, binary()]] }, async ({ api, calls, cache }) => {
      assert.deepEqual(await api.fetchModel(), model);
      assert.equal(calls.length, 0);
      assert.ok(await cache(current).match(modelUrl));
    });
  });
}

for (const response of [
  () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
  () => new Response(model.subarray(0, 10), { status: 206 }),
  () => new Response(model.subarray(0, 10)),
]) {
  test(`an invalid/partial cached response is replaced with a complete binary (${response().status}/${response().headers.get("content-type")})`, async () => {
    await using({ entries: [[current, modelUrl, response()]] }, async ({ api, calls }) => {
      assert.deepEqual(await api.fetchModel(), model);
      assert.equal(calls.length, 1);
    });
  });
}

test("HTML returned with HTTP 200 is rejected and never cached", async () => {
  await using({ fetchResponse: () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) }, async ({ api, cache }) => {
    await assert.rejects(api.fetchModel(), /download failed/);
    assert.equal(await cache(current).match(modelUrl), undefined);
  });
});

test("a truncated successful response is never persisted", async () => {
  await using({ fetchResponse: () => new Response(model.subarray(0, 500), { headers: { "content-length": "1024" } }) }, async ({ api, cache }) => {
    await assert.rejects(api.fetchModel(), /incomplete/);
    assert.equal(await cache(current).match(modelUrl), undefined);
  });
});

test("a custom model host is not replaced by a cached public model", async () => {
  await using({ configuredUrl: "https://custom.example/quality.onnx", entries: [[current, modelUrl, binary()]] }, async ({ api, calls }) => {
    await api.fetchModel();
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0]).hostname, "custom.example");
  });
});

test("an already-aborted request does not return a cached result", async () => {
  await using({ entries: [[current, modelUrl, binary()]] }, async ({ api, calls }) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(api.fetchModel(undefined, controller.signal), { name: "AbortError" });
    assert.equal(calls.length, 0);
  });
});
