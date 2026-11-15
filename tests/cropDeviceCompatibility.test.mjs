import test from "node:test";
import assert from "node:assert/strict";
import { getCropPixelRatio, getCropDecodeSize, observeCropWorkspace, loadCropImage } from "../src/utils/cropDeviceCompatibility.js";

function browserMock(t, { width = 800, height = 1000, rejectBlob = false, rejectAll = false, stall = false, noCanvas = false } = {}) {
  const names = ["window", "document", "Image", "FileReader", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame"];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const urls = [], revoked = [], images = [], canvases = [], draws = [], readers = [];
  const listeners = new Map();
  let nextId = 0;
  globalThis.window = {
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  globalThis.ResizeObserver = undefined;
  globalThis.requestAnimationFrame = callback => { listeners.set("frame", callback); return 1; };
  globalThis.cancelAnimationFrame = () => listeners.delete("frame");
  globalThis.document = { createElement(name) {
    assert.equal(name, "canvas");
    const canvas = { width: 0, height: 0, getContext() { return noCanvas ? null : { drawImage(...args) { draws.push(args); } }; } };
    canvases.push(canvas); return canvas;
  } };
  globalThis.Image = class {
    constructor() { images.push(this); this.naturalWidth = width; this.naturalHeight = height; this.complete = false; }
    set src(value) {
      this.source = value;
      if (!value || stall) return;
      queueMicrotask(() => {
        if (this.source !== value) return;
        if (rejectAll || (rejectBlob && value.startsWith("blob:"))) this.onerror?.();
        else this.onload?.();
      });
    }
    get src() { return this.source; }
  };
  globalThis.FileReader = class {
    constructor() { readers.push(this); }
    readAsDataURL() { this.result = "data:image/png;base64,AA=="; queueMicrotask(() => this.onload?.()); }
    abort() { this.onabort?.(); }
  };
  URL.createObjectURL = () => { const url = `blob:photo-${++nextId}`; urls.push(url); return url; };
  URL.revokeObjectURL = url => revoked.push(url);
  t.after(() => {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  });
  return { urls, revoked, images, canvases, draws, readers, listeners };
}

test("high-DPR phones use a bounded preview buffer", () => {
  assert.equal(getCropPixelRatio(4), 2);
  assert.equal(getCropPixelRatio(1.5), 1.5);
  for (const value of [0, NaN, Infinity, -1]) assert.equal(getCropPixelRatio(value), 1);
});

test("48MP and panoramic inputs retain aspect ratio within preview limits", () => {
  assert.deepEqual(getCropDecodeSize(8000, 6000), { width: 2048, height: 1536 });
  assert.deepEqual(getCropDecodeSize(600, 800), { width: 600, height: 800 });
  for (const [w, h] of [[6000, 8000], [12000, 300], [300, 12000], [9000, 9000]]) {
    const size = getCropDecodeSize(w, h);
    assert.ok(size.width <= 2048 && size.height <= 2048);
    assert.ok(size.width * size.height <= 2048 * 1536 + 4096);
    assert.ok(Math.abs(size.width / size.height - w / h) <= 0.2);
  }
});

test("old WebViews without ResizeObserver still measure and update the crop", t => {
  const { listeners } = browserMock(t);
  let measured = 0;
  const cleanup = observeCropWorkspace({}, () => measured++);
  listeners.get("frame")(); listeners.get("resize")(); listeners.get("orientationchange")();
  assert.equal(measured, 3);
  cleanup(); assert.equal(listeners.size, 0);
});

test("supported ResizeObserver and viewport listeners are disconnected", t => {
  const { listeners } = browserMock(t);
  let observed, disconnected = false;
  globalThis.ResizeObserver = class { observe(value) { observed = value; } disconnect() { disconnected = true; } };
  const element = {};
  const cleanup = observeCropWorkspace(element, () => {});
  assert.equal(observed, element);
  cleanup(); assert.equal(disconnected, true); assert.equal(listeners.size, 0);
});

test("local photo loads once and its URL lives until the crop is disposed", async t => {
  const env = browserMock(t);
  const loaded = await loadCropImage(new Blob(["photo"], { type: "image/jpeg" }));
  assert.equal(env.images.length, 1); assert.equal(env.readers.length, 0);
  assert.equal(env.images[0].crossOrigin, undefined);
  assert.deepEqual(env.revoked, []);
  loaded.dispose(); loaded.dispose();
  assert.deepEqual(env.revoked, env.urls);
  assert.equal(env.images[0].src, "");
});

test("WebView blob decoder failure retries the same photo once as a data URL", async t => {
  const env = browserMock(t, { rejectBlob: true });
  const loaded = await loadCropImage(new Blob(["photo"]));
  assert.equal(env.images.length, 2); assert.equal(env.readers.length, 1);
  assert.ok(loaded.image.src.startsWith("data:"));
  assert.deepEqual(env.revoked, env.urls);
  loaded.dispose();
});

test("unreadable photo rejects clearly instead of leaving a ready black canvas", async t => {
  const env = browserMock(t, { rejectAll: true });
  await assert.rejects(loadCropImage(new Blob(["corrupt"])), /JPG, PNG or WebP/);
  assert.equal(env.images.length, 2);
  assert.deepEqual(env.revoked, env.urls);
});

test("large photo is downscaled once and its original decoder is released", async t => {
  const env = browserMock(t, { width: 8000, height: 6000 });
  const loaded = await loadCropImage(new Blob(["large photo"]));
  assert.equal(loaded.image, env.canvases[0]);
  assert.equal(loaded.image.width, 2048); assert.equal(loaded.image.height, 1536);
  assert.equal(env.draws.length, 1);
  assert.deepEqual(env.draws[0].slice(1), [0, 0, 2048, 1536]);
  assert.equal(env.images[0].src, "");
  assert.deepEqual(env.revoked, env.urls);
  loaded.dispose(); assert.equal(env.canvases[0].width, 1);
});

test("memory-limited canvas failure releases resources and offers a smaller photo", async t => {
  const env = browserMock(t, { width: 8000, height: 6000, noCanvas: true });
  await assert.rejects(loadCropImage(new Blob(["large photo"])), /smaller photo/);
  assert.deepEqual(env.revoked, env.urls);
  assert.equal(env.canvases[0].width, 1);
  assert.equal(env.images[0].src, "");
});

test("cancelling while a device decoder stalls releases the URL and skips fallback", async t => {
  const env = browserMock(t, { stall: true });
  const controller = new AbortController();
  const pending = loadCropImage(new Blob(["photo"]), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.deepEqual(env.revoked, env.urls);
  assert.equal(env.readers.length, 0);
  assert.equal(env.images[0].src, "");
});

test("previously saved remote photos retain export-safe CORS loading", async t => {
  const env = browserMock(t);
  const loaded = await loadCropImage("https://example.org/photo.png");
  assert.equal(env.images[0].crossOrigin, "anonymous");
  assert.equal(env.urls.length, 0);
  loaded.dispose();
});
