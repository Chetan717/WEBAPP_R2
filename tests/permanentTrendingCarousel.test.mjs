import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const carousel = readFileSync(
  join(projectRoot, "src/pages/Homepage/Component/Carosel.jsx"),
  "utf8",
);

test("dynamic company/general trending slides remain available", () => {
  assert.match(carousel, /TTrend_templateService\(selectedCompany\?\.id \|\| ""\)/);
  assert.match(carousel, /const dynamicSlides = slides\.length/);
});
