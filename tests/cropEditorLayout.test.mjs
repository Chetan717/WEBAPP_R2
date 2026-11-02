import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import { getCropViewportSize } from "../src/utils/cropEditorGeometry.js";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/CropEditorLayout.jsx", import.meta.url), "utf8");
const { code } = transformSync(source, { loader: "jsx", jsx: "automatic", format: "cjs" });

function renderLayout() {
  const body = { name: "document body" };
  const module = { exports: {} };
  const patchedRequire = (name) => name === "react-dom"
    ? { createPortal: (content, target) => ({ content, target }) }
    : name === "react" ? { useRef: (value) => ({ current: value }) } : require(name);
  new Function("require", "module", "exports", "document", code)(patchedRequire, module, module.exports, { body });
  let done = 0;
  let cancel = 0;
  const portal = module.exports.default({
    workspaceRef: { current: null }, finalCrop: false, isDoing: false,
    isImageReady: true, progress: 0, onDone: () => done++, onCancel: () => cancel++, children: null,
  });
  return { portal, body, counts: () => ({ done, cancel }) };
}

test("crop escapes auto-height and transformed parents into a viewport-sized overlay", () => {
  const { portal, body } = renderLayout();
  assert.equal(portal.target, body);
  assert.equal(portal.content.props.style.position, "fixed");
  assert.equal(portal.content.props.style.inset, 0);
  assert.equal(portal.content.props.style.height, "100dvh");
  assert.match(portal.content.props.style.gridTemplateRows, /minmax\(0,\s*1fr\)/);
  assert.equal(portal.content.props["data-react-aria-top-layer"], "true");
});

test("crop gestures do not bubble into a parent modal or trigger Done/Cancel", () => {
  const { portal, counts } = renderLayout();
  let stopped = 0;
  for (const handler of ["onClick", "onPointerDown", "onPointerUp", "onTouchStart", "onTouchEnd", "onKeyDown"]) {
    portal.content.props[handler]({ stopPropagation: () => stopped++ });
  }
  assert.equal(stopped, 6);
  assert.deepEqual(counts(), { done: 0, cancel: 0 });
});

test("file-picker click-through cannot close or save the crop; fresh button presses work", () => {
  const { portal, counts } = renderLayout();
  const [header, , footer] = portal.content.props.children;
  const cancel = header.props.children[0];
  const done = footer.props.children;
  done.props.onClick({ detail: 1 });
  cancel.props.onClick({ detail: 1 });
  assert.deepEqual(counts(), { done: 0, cancel: 0 });
  done.props.onPointerDown();
  done.props.onClick({ detail: 1 });
  done.props.onClick({ detail: 1 });
  assert.deepEqual(counts(), { done: 1, cancel: 0 });
  cancel.props.onPointerDown();
  cancel.props.onPointerCancel();
  cancel.props.onClick({ detail: 1 });
  assert.deepEqual(counts(), { done: 1, cancel: 0 });
  done.props.onClick({ detail: 0 });
  cancel.props.onClick({ detail: 0 });
  assert.deepEqual(counts(), { done: 2, cancel: 1 });
});

for (const path of ["../src/pages/Form/ImageEditorCanvas.jsx", "../src/pages/mainform/components/ImageEditorCanvas.jsx"]) {
  test(`${path}: a collapsed ResizeObserver measurement cannot reduce the photo or enable Done`, () => {
    const controller = readFileSync(new URL(path, import.meta.url), "utf8");
    const start = controller.indexOf("    const measure = () => {");
    const end = controller.indexOf("\n    };", start) + "\n    };".length;
    assert.ok(start >= 0 && end > start);
    let rect = { width: 360, height: 592 };
    let ready = false;
    const canvasSzRef = { current: { w: 300, h: 340 } };
    const cropBoxRef = { current: null };
    const env = {
      containerRef: { current: { getBoundingClientRect: () => rect } },
      getCropViewportSize, canvasSzRef, cropBoxRef, offDirtyRef: { current: false },
      imgRef: { current: {} }, RATIO: 1,
      setCanvasW() {}, setCanvasH() {}, setIsViewportReady: (value) => { ready = value; },
      initialCropBox: (_image, w, h) => ({ x: 20, y: 20, w: w - 40, h: h - 40 }),
    };
    const names = Object.keys(env);
    const measure = new Function(...names, controller.slice(start, end) + "\nreturn measure;")(...names.map(name => env[name]));
    measure();
    assert.equal(ready, true);
    const validBox = { ...cropBoxRef.current };
    for (const height of [1, 0, 20, 99]) {
      rect = { width: 360, height };
      measure();
      assert.equal(ready, false);
      assert.deepEqual(canvasSzRef.current, { w: 360, h: 592 });
      assert.deepEqual(cropBoxRef.current, validBox);
    }
    rect = { width: 740, height: 210 };
    measure();
    assert.equal(ready, true);
    assert.deepEqual(canvasSzRef.current, { w: 480, h: 210 });
  });
}
