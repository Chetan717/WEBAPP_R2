import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { EVERYDAY_MOMENT_ENTRIES, isEverydayMomentType } from '../src/utils/everydayMoments.js';
import { isDirectEditorTemplate } from '../src/utils/editorNavigation.js';
import { buildHomeTemplateSections, getHomeTemplateSearchText } from '../src/pages/Homepage/Component/homeTemplatePresentation.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');
const additionalTypes = ['ATTITUDE', 'SPORTS', 'GOOD_THOUGHTS', 'MOTIVATION', 'PROVERS'];

test('five General SelectTypes are Everyday Moments only and navigate directly to Editor', () => {
  for (const type of additionalTypes) {
    assert.equal(isEverydayMomentType(type), true, type);
    assert.equal(isDirectEditorTemplate(type), true, type);
    assert.match(getHomeTemplateSearchText(type), /everyday moments/i);
  }
  assert.equal(isEverydayMomentType('Motivational'), false);
  assert.equal(isDirectEditorTemplate('Motivational'), true);
  assert.notEqual(additionalTypes[3], 'Motivational');
});

test('new entries live in existing Everyday Moments section and not an additional home section', () => {
  const types = EVERYDAY_MOMENT_ENTRIES.map((e) => e.type);
  const sections = buildHomeTemplateSections(types.map((type) => ({ type, templates: [{ id: type }] })));
  assert.deepEqual(sections.map((s) => s.id), ['everyday-moments']);
  const sectionTypes = sections[0].entries.map((e) => e.type);
  for (const type of additionalTypes) assert.ok(sectionTypes.includes(type));
});

test('home loader and both direct Editor paths include all new General type keys', () => {
  const loader = read('src/pages/Homepage/Component/Services/GeneralTemplateService.jsx');
  const home = read('src/pages/Homepage/Component/ListOfGenaraltemp.jsx');
  const editor = read('src/pages/Editor/MainEditor.jsx');
  const mode = read('src/pages/Editor/GenralEditPage.jsx');
  const homePage = read('src/pages/Home.jsx');
  const categoryRailList = homePage.match(/const HOME_UI_TEMPLATE_TYPES = \[([\s\S]*?)\];/)?.[1] || '';
  for (const type of additionalTypes) {
    for (const [name, src] of [['loader',loader], ['home',home],['editor',editor], ['general editor',mode]]) {
      assert.ok(src.includes(`"${type}"`), `${name}: ${type}`);
    }
    assert.ok(!categoryRailList.includes(`"${type}"`), `not separate home category: ${type}`);
  }
  // No reclassification of existing Greeting_Wishes subtypes / Firestore data.
  assert.ok(home.includes('const GENERAL_SELECT_TYPES'));
});
