import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let serial = 0;
async function using(check) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const timers = new Map();
  const idle = new Map();
  const fixtureKey = `__bgStartup${++serial}`;
  let calls = 0;
  globalThis[fixtureKey] = () => { calls += 1; };
  let id = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout(callback, delay) { timers.set(++id, { callback, delay }); return id; },
    clearTimeout(key) { timers.delete(key); },
    requestIdleCallback(callback) { idle.set(++id, callback); return id; },
    cancelIdleCallback(key) { idle.delete(key); },
  } });
  const fixture = `data:text/javascript;base64,${Buffer.from(`export const preloadBgModel=globalThis.${fixtureKey};`).toString("base64")}`;
  const source = readFileSync(new URL("../src/utils/bgModelWarmup.js", import.meta.url), "utf8")
    .replace('import("../pages/mainform/utils/removeBg.js")', `import(${JSON.stringify(fixture)})`);
  const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#startup-${serial}`);
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
  try { await check({ api, timers, idle, flush, calls: () => calls }); }
  finally {
    delete globalThis[fixtureKey];
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete globalThis.window;
  }
}

test("startup schedules model preparation after initial paint and an idle slot", async () => {
  await using(async ({ api, timers, idle, flush, calls }) => {
    api.scheduleBgModelWarmup();
    assert.equal(calls(), 0);
    const [{ callback, delay }] = timers.values();
    assert.equal(delay, 750);
    callback();
    assert.equal(calls(), 0);
    const [runIdle] = idle.values();
    runIdle();
    await flush();
    assert.equal(calls(), 1);
  });
});

test("StrictMode setup/cleanup does not start two startup warmups", async () => {
  await using(async ({ api, timers, idle, flush, calls }) => {
    const firstCleanup = api.scheduleBgModelWarmup();
    firstCleanup();
    api.scheduleBgModelWarmup();
    assert.equal(timers.size, 1);
    const [{ callback }] = timers.values();
    callback();
    const [runIdle] = idle.values();
    runIdle();
    await flush();
    assert.equal(calls(), 1);
  });
});

test("unmount cancels a pending idle warmup", async () => {
  await using(async ({ api, timers, idle, flush, calls }) => {
    const cleanup = api.scheduleBgModelWarmup();
    const [{ callback }] = timers.values();
    callback();
    cleanup();
    assert.equal(idle.size, 0);
    await flush();
    assert.equal(calls(), 0);
  });
});
