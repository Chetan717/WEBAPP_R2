import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAllowedTemplateImageUrl } from '../api/template-image.js';
const read=(p)=>readFileSync(new URL(`../${p}`, import.meta.url),'utf8');

test('CDN fallback accepts public template raster images only', () => {
  assert.equal(isAllowedTemplateImageUrl('https://cdn.mlmposter.com/templates/showcase/sample.webp'), true);
  assert.equal(isAllowedTemplateImageUrl('https://cdn.mlmposter.com/templates/a/sample.png?v=1'), true);
  assert.equal(isAllowedTemplateImageUrl('https://cdn.mlmposter.com/templates/a/sample.svg'), false);
  assert.equal(isAllowedTemplateImageUrl('https://cdn.mlmposter.com/graphics/sample.webp'), false);
  assert.equal(isAllowedTemplateImageUrl('https://cdn.mlmposter.com.evil.example/templates/a.webp'), false);
  assert.equal(isAllowedTemplateImageUrl('http://cdn.mlmposter.com/templates/a.webp'), false);
  assert.equal(isAllowedTemplateImageUrl('https://user:pass@cdn.mlmposter.com/templates/a.webp'), false);
  assert.equal(isAllowedTemplateImageUrl('https://cdn.mlmposter.com:8042/templates/a.webp'), false);
});

test('canvas loader uses anonymous CDN images, bounded retries and safe fallback', () => {
  const code=read('src/hooks/useTemplateCanvasImage.js');
  assert.match(code,/image\.crossOrigin\s*=\s*"anonymous"/);
  assert.match(code,/IMAGE_LOAD_TIMEOUT_MS\s*=\s*10500/);
  assert.match(code,/35000/);
  assert.match(code,/loadCdnProxyFallback/);
  assert.match(code,/setState\(\{ src, status: "failed", image: null \}\)/);
  assert.match(code,/URL\.revokeObjectURL/);
});

test('template strip virtualizes offscreen tiles and preserves click handling', () => {
  const grid=read('src/pages/Editor/components/VirtualTemplateGrid.jsx');
  const list=read('src/pages/Editor/components/ListOfTemplates.jsx');
  assert.match(grid,/items\.slice\(firstIndex, lastIndex\)/);
  assert.match(grid,/requestAnimationFrame/);
  assert.match(list,/VirtualTemplateGrid/);
  assert.match(list,/setSelected\(nextSelected\)/);
});

test('home preloads use canvas compatible CORS and editor idle prefetch',()=>{
 const cache=read('src/pages/Homepage/Component/templateCacheUtils.js');
 const app=read('src/App.jsx');
 assert.match(cache,/img\.crossOrigin\s*=\s*"anonymous"/);
 assert.match(app,/requestIdleCallback/);
 assert.match(app,/import\("\.\/pages\/Editor\/MainEditor"\)/);
 assert.match(app,/connection\?\.saveData/);
});
