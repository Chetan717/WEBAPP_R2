import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAllowedTemplateImageUrl } from "../api/template-image.js";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const frameUrls = [
  "https://cdn.mlmposter.com/topuplineframe/1sttp.webp",
  "https://cdn.mlmposter.com/topuplineframe/2ndtp.webp",
  "https://cdn.mlmposter.com/topuplineframe/3rdtp.webp",
  "https://cdn.mlmposter.com/topuplineframe/4thtp.webp",
  "https://cdn.mlmposter.com/footers/1791459461834_ittwds.webp",
  "https://cdn.mlmposter.com/footers/1791458983814_513d44.webp",
];

test("all locally configured editor frame URLs use allowed public paths", () => {
  const top = JSON.parse(source("src/data/topuplineframes.json"));
  const foot = JSON.parse(source("src/data/footerframes.json"));
  const values = [...top,...foot].flatMap((frame) => frame.GraphicsLinks.map((link)=>link.value));
  assert.deepEqual(values, frameUrls);
  for (const url of values) assert.ok(isAllowedTemplateImageUrl(url), url);
});

test("fallback proxy cannot reach private assets or other hosts", () => {
  for (const url of [
    "https://cdn.mlmposter.com/mlmprofiles/u/photo.webp",
    "https://profile.mlmposter.com/topuplineframe/x.webp",
    "https://cdn.mlmposter.com/graphics/x.webp",
    "http://cdn.mlmposter.com/footers/a.webp",
    "https://cdn.mlmposter.com/footers/a.svg",
    "https://cdn.mlmposter.com.evil.test/footers/a.webp",
    "https://user:pass@cdn.mlmposter.com/footers/a.webp",
    "https://cdn.mlmposter.com:8443/footers/a.webp",
  ]) assert.equal(isAllowedTemplateImageUrl(url),false,url);
});

test("both selected frames use resilient canvas loader rather than thumbnail img", () => {
  const editor = source("src/pages/Editor/GenralEditPage.jsx");
  assert.match(editor,/\[Imagefooter\]\s*=\s*useTemplateCanvasImage\(selectedFooterFrame\?\.value\s*\|\|\s*""\)/);
  assert.match(editor,/\[ImagetopFrame\]\s*=\s*useTemplateCanvasImage\(selectedTopFrame\?\.value\s*\|\|\s*""\)/);
  const hook=source("src/hooks/useTemplateCanvasImage.js");
  assert.match(hook,/"\/topuplineframe\/"/);
  assert.match(hook,/"\/footers\/"/);
  assert.match(hook,/loadCdnProxyFallback/);
});

test("selection callbacks still update parent frame state",()=>{
  const main=source("src/pages/Editor/MainEditor.jsx");
  assert.match(main,/onFrameSelect=\{\(frame\)\s*=>\s*setSelectedTopFrame\(frame\)\}/);
  assert.match(main,/onFrameSelectFooter=\{\(frame\)\s*=>\s*setSelectedFooterFrame\(frame\)\}/);
});
