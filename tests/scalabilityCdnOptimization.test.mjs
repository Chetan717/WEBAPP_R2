import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
test("Home reads compact catalogs before optional full master fallback", async () => {
  const text = await source("src/pages/Homepage/Component/Services/GeneralTemplateService.jsx");
  assert.ok(text.indexOf("const [homeGeneralCatalog, homeCompanyCatalog]") >= 0);
  assert.ok(text.indexOf("const [homeGeneralCatalog, homeCompanyCatalog]") < text.indexOf("? await loadGeneralTemplateIndex()"));
  assert.match(text, /homeGeneralCatalog === null/);
});
test("Concurrent catalog version loads are single flight", async () => {
  const text = await source("src/pages/Homepage/Component/Services/templateCdnService.js");
  assert.match(text, /let versionPending = null/);
  assert.match(text, /if \(versionPending\) return versionPending/);
  assert.match(text, /versionPending = request/);
});
test("Profile R2 redirects only the known legacy hostname and object prefix", async () => {
  const text = await source("src/services/profileR2Storage.js");
  assert.match(text, /R2_PROFILE_BASE_URL/);
  assert.match(text, /source\.pathname\.startsWith\("\/mlmprofiles\/"\)/);
  assert.match(text, /pub-a9fc3713abb3442ba09ff324db4e136f\.r2\.dev/);
});
test("Production defaults point at customer Cloudflare domains", async () => {
  const env = await source(".env.production");
  assert.match(env, /VITE_TEMPLATE_CDN_BASE_URL=https:\/\/cdn\.mlmposter\.com/);
  assert.match(env, /VITE_R2_PROFILE_BASE_URL=https:\/\/profile\.mlmposter\.com/);
  assert.match(env, /VITE_BIREFNET_MODEL_URL=https:\/\/models\.mlmposter\.com\/models\/birefnet\//);
});
