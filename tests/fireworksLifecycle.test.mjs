import assert from "node:assert/strict";
import test from "node:test";
import { startFireworks, FIREWORKS_DURATION_MS } from "../src/components/celebration/fireworksEngine.js";

function fakeBrowser(t) {
  let now = 100;
  let nextId = 0;
  const queued = new Map();
  const listeners = new Map();
  const original = Object.fromEntries(["window", "performance", "requestAnimationFrame", "cancelAnimationFrame"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 3,
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
  globalThis.requestAnimationFrame = (handler) => { queued.set(++nextId, handler); return nextId; };
  globalThis.cancelAnimationFrame = (id) => queued.delete(id);
  t.after(() => {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let strokes = 0;
  const context = new Proxy({}, {
    get(_, key) {
      if (key === "createLinearGradient") return () => ({ addColorStop() {} });
      if (key === "stroke") return () => { strokes++; };
      return () => {};
    },
    set() { return true; },
  });
  const canvas = { getContext: () => context };
  return {
    canvas, queued, listeners,
    get strokes() { return strokes; },
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 34);
        const callbacks = [...queued.values()];
        queued.clear();
        callbacks.forEach((handler) => handler(now));
      }
    },
  };
}

test("rockets burst, resize and release their frames/listeners when complete", (t) => {
  const browser = fakeBrowser(t);
  let completions = 0;
  startFireworks(browser.canvas, { variant: "welcome", onComplete: () => { completions++; } });
  assert.equal(browser.canvas.width, 585); // DPR capped for mobile.
  browser.advance(1800);
  assert.ok(browser.strokes > 100, "exploded rockets draw radial sparks");
  window.innerWidth = 844;
  window.innerHeight = 390;
  browser.listeners.get("resize")();
  assert.equal(browser.canvas.width, 1266);
  browser.advance(FIREWORKS_DURATION_MS.welcome);
  assert.equal(completions, 1);
  assert.equal(browser.queued.size, 0);
  assert.equal(browser.listeners.size, 0);
});

test("early cancellation is idempotent and never fires a stale completion", (t) => {
  const browser = fakeBrowser(t);
  let completions = 0;
  const stop = startFireworks(browser.canvas, { onComplete: () => { completions++; } });
  browser.advance(1000);
  stop();
  stop();
  browser.advance(6000);
  assert.equal(completions, 0);
  assert.equal(browser.queued.size, 0);
  assert.equal(browser.listeners.size, 0);
});

test("a device without canvas does not start an animation", () => {
  const stop = startFireworks({ getContext: () => null });
  assert.equal(typeof stop, "function");
  stop();
});
