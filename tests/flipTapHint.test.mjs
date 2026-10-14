import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getFlipHintPosition } from '../src/pages/Editor/utils/flipHintGeometry.js';
const code = readFileSync(new URL('../src/pages/Editor/GenralEditPage.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/Editor/components/FlipTapHint.css', import.meta.url), 'utf8');
const hint = readFileSync(new URL('../src/pages/Editor/components/FlipTapHint.jsx', import.meta.url), 'utf8');
const mockNode = (r, visible=true, img={}) => ({image:()=>img, visible:()=>visible, getClientRect:()=>r});

test('Konva image rectangles position both hints correctly', () => {
  assert.deepEqual(getFlipHintPosition(mockNode({x:190,y:40,width:118,height:166})),{x:249,y:123});
  assert.deepEqual(getFlipHintPosition(mockNode({x:2,y:220,width:86,height:110})),{x:45,y:270});
});
test('off-stage, hidden, unloaded or invalid images get no hint',()=>{
  assert.equal(getFlipHintPosition(null),null);
  assert.equal(getFlipHintPosition(mockNode({x:0,y:0,width:100,height:100},false)),null);
  assert.equal(getFlipHintPosition(mockNode({x:0,y:0,width:100,height:100},true,null)),null);
  assert.equal(getFlipHintPosition(mockNode({x:330,y:20,width:80,height:120})),null);
  assert.equal(getFlipHintPosition(mockNode({x:0,y:0,width:NaN,height:120})),null);
});
test('hint is HTML outside Konva Stage and outside exports',()=>{
  assert.ok(code.indexOf('<FlipTapHint target="rank"') > code.indexOf('</Stage>'));
  assert.ok(code.indexOf('<FlipTapHint target="profile"') > code.indexOf('</Stage>'));
  assert.match(code,/!previewOnly && !isVideoUnavailable && !!bgImage/);
  assert.match(code,/pointer-events-none/);
  assert.match(css,/pointer-events: none !important/);
});
test('both rank and profile hints dismiss on successful flip',()=>{
  assert.match(code,/type === "profile" \|\| type === "rank"/);
  assert.match(code,/\[type\]: true/);
  assert.match(code,/setFooterImgFlip\(\(f\) => !f\);[\s\S]{0,100}setDismissedFlipHints/);
  assert.match(code,/setDismissedFlipHints\(\{ profile: false, rank: false \}\)/);
});
test('hand visual is animated in theme blue but respects reduced motion',()=>{
  assert.match(hint,/HandPointer/);
  assert.match(hint,/Tap to flip/);
  assert.match(css,/#2f80ea/i);
  assert.match(css,/@keyframes mlmlive-hand-tap/);
  assert.match(css,/@keyframes mlmlive-tap-ripple/);
  assert.match(css,/prefers-reduced-motion: reduce/);
});
