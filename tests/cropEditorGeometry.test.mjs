import assert from "node:assert/strict";
import test from "node:test";
import {
  getTopAlignedCropBox,
  getCropViewportSize,
  getCropExportSize,
  hitCropHandle,
  resizeCropEdge,
} from "../src/utils/cropEditorGeometry.js";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test("initial and final crop start at the image top across image shapes and banner ratios", () => {
  for (const bounds of [
    { x: 20, y: 70, w: 360, h: 360 },
    { x: 95, y: 20, w: 180, h: 510 },
    { x: 20, y: 140, w: 360, h: 160 },
  ]) {
    for (const ratio of [1, 2, 175 / 230, 150 / 190, 145 / 220]) {
      const box = getTopAlignedCropBox(bounds, ratio);
      near(box.y, bounds.y);
      near(box.w / box.h, ratio);
      near(box.x + box.w / 2, bounds.x + bounds.w / 2);
      assert.ok(box.x >= bounds.x - 1e-7);
      assert.ok(box.x + box.w <= bounds.x + bounds.w + 1e-7);
      assert.ok(box.y + box.h <= bounds.y + bounds.h + 1e-7);
      assert.ok(Math.abs(box.w - bounds.w) < 1e-7 || Math.abs(box.h - bounds.h) < 1e-7);
    }
  }
});

test("crop viewport fits narrow phones, landscape screens and desktop panels", () => {
  for (const [width, height] of [[320, 420], [390, 630], [844, 210], [1280, 900]]) {
    const size = getCropViewportSize(width, height);
    assert.ok(size.w > 0 && size.w <= width);
    assert.ok(size.h > 0 && size.h <= height);
  }
});

test("zero and collapsed layout measurements never become a tiny crop canvas", () => {
  for (const [width, height] of [[0, 0], [360, 1], [1, 600], [360, 40], [NaN, 600], [360, Infinity]]) {
    assert.equal(getCropViewportSize(width, height), null);
  }
  assert.deepEqual(getCropViewportSize(360, 592), { w: 360, h: 592 });
});

test("all eight visible handles have working touch targets", () => {
  const box = { x: 20, y: 20, w: 240, h: 320 };
  for (const [name, x, y] of [
    ["TL", 20, 20], ["TR", 260, 20], ["BL", 20, 340], ["BR", 260, 340],
    ["T", 140, 20], ["B", 140, 340], ["L", 20, 180], ["R", 260, 180],
  ]) assert.equal(hitCropHandle(x + 3, y + 3, box), name);
  assert.equal(hitCropHandle(140, 180, box), null);
});

test("side handle resizing preserves ratio, the opposite edge and image bounds", () => {
  const bounds = { x: 20, y: 20, w: 360, h: 560 };
  const box = { x: 100, y: 130, w: 180, h: 240 };
  for (const handle of ["T", "B", "L", "R"]) {
    for (const pointer of [-1000, 30, 180, 390, 1000]) {
      const result = resizeCropEdge(box, handle, pointer, pointer, 0.75, bounds);
      near(result.w / result.h, 0.75);
      assert.ok(result.w > 0 && result.h > 0);
      assert.ok(result.x >= bounds.x - 1e-7 && result.y >= bounds.y - 1e-7);
      assert.ok(result.x + result.w <= bounds.x + bounds.w + 1e-7);
      assert.ok(result.y + result.h <= bounds.y + bounds.h + 1e-7);
      if (handle === "T") near(result.y + result.h, box.y + box.h);
      if (handle === "B") near(result.y, box.y);
      if (handle === "L") near(result.x + result.w, box.x + box.w);
      if (handle === "R") near(result.x, box.x);
    }
  }
});

test("initial AI input keeps its existing size; final crop retains higher source detail", () => {
  assert.deepEqual(getCropExportSize(1, 2400, false), { width: 800, height: 800 });
  assert.deepEqual(getCropExportSize(0.75, 2400, false), { width: 600, height: 800 });
  assert.deepEqual(getCropExportSize(0.75, 2400, true), { width: 1800, height: 2400 });
  assert.deepEqual(getCropExportSize(2, 1800, true), { width: 1800, height: 900 });
  assert.deepEqual(getCropExportSize(1, 500, true), { width: 800, height: 800 });
});
