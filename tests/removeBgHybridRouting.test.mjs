import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join, resolve } from "node:path";
import { removeBg } from "../src/pages/mainform/utils/removeBg.js";

const projectRoot = resolve(import.meta.dirname, "..");
const read = (relativePath) =>
  readFileSync(join(projectRoot, relativePath), "utf8");

test("remove background routing is client-only with no VPS inference path", () => {
  const removeBg = read("src/pages/mainform/utils/removeBg.js");
  const birefnet = read("src/pages/mainform/utils/birefnetClient.js");

  assert.equal(
    existsSync(join(projectRoot, "src/pages/mainform/utils/removeBgServer.js")),
    false,
  );
  assert.match(removeBg, /removeBackgroundWithBirefNet/);
  assert.match(removeBg, /removeBackgroundWithModNet/);
  assert.doesNotMatch(removeBg, /rmbg\.mlmlive\.in|\/v1\/remove-background/);
  assert.doesNotMatch(birefnet, /rmbg\.mlmlive\.in|\/v1\/remove-background/);
});

test("invalid photo inputs fail before either model is loaded", async () => {
  await assert.rejects(removeBg(new Blob([])), /valid image/);
  await assert.rejects(removeBg("not a photo"), /valid image/);
});
