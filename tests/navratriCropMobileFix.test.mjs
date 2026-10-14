import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { isDirectEditorTemplate, getEditorBackTarget } from '../src/utils/editorNavigation.js';

const root = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('Navratri Special bypasses form like Good Morning, without changing form flows', () => {
  assert.equal(isDirectEditorTemplate('Navratri_Special'), true);
  assert.equal(isDirectEditorTemplate('Good_Morning'), true);
  assert.equal(isDirectEditorTemplate('Meeting'), false);
  assert.equal(isDirectEditorTemplate('Bonanza'), false);
  assert.equal(getEditorBackTarget({ id: 'n1', type: 'Navratri_Special' }, null), '/');
  const home = read('src/pages/Homepage/Component/ListOfGenaraltemp.jsx');
  assert.match(home, /GENERAL_SELECT_TYPES = new Set\(\[[\s\S]*?"Navratri_Special"/);
  const all = read('src/pages/Homepage/Component/AllTemplates.jsx');
  assert.match(all, /isDirectEditorTemplate\(template\.type\)/);
  const editor = read('src/pages/Editor/GenralEditPage.jsx');
  assert.match(editor, /"Navratri_Special"/);
});

for (const file of [
  'src/pages/Form/ImageEditorCanvas.jsx',
  'src/pages/mainform/components/ImageEditorCanvas.jsx',
]) {
  test(`${file}: thin line only, with safe mobile gutters and invisible resize hits`, () => {
    const source = read(file);
    assert.match(source, /Math\.min\(width - 48,/);
    assert.match(source, /HANDLE_HIT = 36/);
    assert.match(source, /ctx\.lineWidth = 1;\s*ctx\.strokeRect\(fx, fy, fw, fh\)/);
    assert.doesNotMatch(source, /HANDLE_VIS/);
    assert.doesNotMatch(source, /ctx\.fillRect\(\s*cx -/);
    assert.doesNotMatch(source, /bracketThickness|Corner L-brackets|Corner lines/);
    assert.match(source, /ctx\.strokeStyle = "rgba\(255,255,255,0\.70\)"/);
    assert.match(source, /margin = 0\.92/);
    assert.match(source, /touchAction: "none"/);
  });
}
