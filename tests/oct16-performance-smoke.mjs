import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file,root),'utf8');

test('New subtype announcement popup and utility removed', () => {
  const all = read('src/pages/Homepage/Component/AllTemplates.jsx');
  assert.doesNotMatch(all, /newSubtypeNotice|findNewSubtypeAnnouncement|NEW SUBTYPE|New designs are here!/);
});

test('Everyday Moments two-column cards ONLY on Home', () => {
  const home = read('src/pages/Homepage/Component/ListOfGenaraltemp.jsx');
  const all = read('src/pages/Homepage/Component/AllTemplates.jsx');
  const homeSection = home.slice(home.indexOf('{everydayMomentCards.length > 0'),home.indexOf('{designationModalPending &&'));
  assert.match(homeSection,/grid grid-cols-2 gap-3/);
  assert.doesNotMatch(homeSection,/overflow-x-auto/);
  assert.match(all,/hide-scrollbar scroll-gpu flex min-h-\[122px\] snap-x gap-3 overflow-x-auto/);
  assert.match(all,/aspect-square w-\[118px\] shrink-0 snap-start/);
});

test('final cropped transparent photo stays PNG at 800px', () => {
  for (const editor of ['src/pages/Form/ImageEditorCanvas.jsx','src/pages/mainform/components/ImageEditorCanvas.jsx']) {
    const source = read(editor);
    assert.match(source, /const TARGET = 800/);
    assert.match(source,/enableEnhance \? "image\/png" : "image\/webp"/);
    assert.match(source,/encodeCropCanvas\(/);
    assert.doesNotMatch(source,/\}, 180\)/);
  }
});

test('route prefetch uses idle and avoids 2G data saver', () => {
  const app=read('src/App.jsx');
  assert.match(app, /requestIdleCallback/);
  assert.match(app,/connection\?\.saveData/);
  assert.match(app,/import\("\.\/pages\/Homepage\/Component\/HomeSearchPage"\)/);
});

test('encoder preserves type and falls back to original toBlob', async () => {
  const { encodeCropCanvas } = await import('../src/utils/cropCanvasEncoder.js');
  const expected = new Blob(['pixels'], {type: 'image/png'});
  let called;
  const canvas = {toBlob(done,type,quality) { called=[type, quality]; done(expected); }};
  const out = await encodeCropCanvas(canvas,'image/png');
  assert.equal(out,expected);
  assert.deepEqual(called,['image/png',undefined]);
});

test('worker encoder success and error both preserve transparent PNG flow', async () => {
  const original = {
    Worker: globalThis.Worker,
    OffscreenCanvas: globalThis.OffscreenCanvas,
    createImageBitmap: globalThis.createImageBitmap,
  };
  let simulateFailure = false;
  class FakeWorker {
    postMessage({ id, type }) {
      queueMicrotask(() => {
        if (simulateFailure) this.onmessage({ data: { id, error: 'worker encoder error' } });
        else this.onmessage({ data: { id, blob: new Blob(['worker pixels'], { type }) } });
      });
    }
    terminate() {}
  }
  globalThis.Worker = FakeWorker;
  globalThis.OffscreenCanvas = class {};
  globalThis.createImageBitmap = async () => ({ width: 800, height: 800, close() {} });
  try {
    const { encodeCropCanvas } = await import('../src/utils/cropCanvasEncoder.js');
    let fallback = 0;
    const canvas = { toBlob(done, type) { fallback++; done(new Blob(['fallback'], { type })); } };
    const encoded = await encodeCropCanvas(canvas, 'image/png');
    assert.equal(encoded.type, 'image/png');
    assert.equal(fallback, 0);
    simulateFailure = true;
    const restored = await encodeCropCanvas(canvas, 'image/png');
    assert.equal(restored.type, 'image/png');
    assert.equal(fallback, 1);
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }
});

// Real OffscreenCanvas worker speed still needs a mobile Vite Preview test.

