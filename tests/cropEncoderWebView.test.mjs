import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCropCanvas } from '../src/utils/cropCanvasEncoder.js';
test('800 pixel crops encode asynchronously without starting an extra worker', async () => {
  const blob = new Blob(['cutout'], { type: 'image/png' });
  const output = await encodeCropCanvas({ width: 800, height: 800, toBlob(cb, type) { assert.equal(type, 'image/png'); cb(blob); } }, 'image/png');
  assert.equal(output, blob);
});
test('a null native encoder result immediately uses the existing data URL fallback', async () => {
  const result = await encodeCropCanvas({ width: 800, height: 600, toBlob(cb) { cb(null); }, toDataURL: () => 'data:image/png;base64,Y3V0b3V0' }, 'image/png');
  assert.equal(await result.text(), 'cutout');
});
test('a missing toBlob callback is bounded and a late callback is ignored', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let callback;
  const result = encodeCropCanvas({ width: 800, height: 600, toBlob(cb) { callback = cb; }, toDataURL: () => 'data:image/png;base64,b2s=' }, 'image/png');
  t.mock.timers.tick(2001);
  assert.equal(await (await result).text(), 'ok'); callback(new Blob(['late']));
});
