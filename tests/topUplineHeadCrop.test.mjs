import assert from "node:assert/strict";
import test from "node:test";
import { getTopUplineHeadCrop } from "../src/pages/Editor/utils/topUplineCrop.js";

test("waist-up portraits retain an upper-centre head and exclude the waist", () => {
  const image = { naturalWidth: 800, naturalHeight: 1200, width: 80, height: 120 };
  const original = { ...image };
  const crop = getTopUplineHeadCrop(image);
  const head = { left: 280, right: 520, top: 40, bottom: 360 };
  assert.ok(crop.x <= head.left && crop.x + crop.width >= head.right);
  assert.ok(crop.y <= head.top && crop.y + crop.height >= head.bottom);
  assert.ok(crop.y + crop.height < 1000, "waist should be outside the face frame");
  assert.equal(crop.width, crop.height, "a square crop must not stretch the face");
  assert.deepEqual(image, original, "the original image must remain unchanged");
});

test("crop stays inside loaded images and anchors at the top across aspect ratios", () => {
  for (const [width, height] of [[600, 600], [1000, 600], [400, 1600], [1, 1]]) {
    const crop = getTopUplineHeadCrop({ width, height });
    assert.equal(crop.y, 0);
    assert.equal(crop.width, crop.height);
    assert.equal(crop.x + crop.width / 2, width / 2);
    assert.ok(crop.width > 0 && crop.height > 0);
    assert.ok(crop.x >= 0 && crop.x + crop.width <= width);
    assert.ok(crop.y + crop.height <= height);
  }
});

test("missing or unloaded images do not produce invalid canvas crop dimensions", () => {
  for (const image of [null, undefined, {}, { width: 0, height: 0 }, { width: Infinity, height: 10 }, { width: 10, height: -1 }]) {
    assert.equal(getTopUplineHeadCrop(image), undefined);
  }
});
