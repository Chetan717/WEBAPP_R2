import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bucket = process.argv[2];
const npmCli = process.env.npm_execpath;
if (!bucket || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
  console.error("Usage: npm run upload:ai-assets -- YOUR_MODELS_BUCKET_NAME");
  process.exit(1);
}
if (!npmCli) throw new Error("Run this script through npm run upload:ai-assets -- BUCKET_NAME.");
const manifest = JSON.parse(await readFile(resolve(root, "r2-setup/manifest.json"), "utf8"));
// Check the entire package before any upload starts.
for (const item of manifest.assets) {
  const bytes = await readFile(resolve(root, item.file));
  if (bytes.length !== item.size || createHash("sha256").update(bytes).digest("hex") !== item.sha256) {
    throw new Error(`Asset is incomplete or has changed: ${item.file}`);
  }
}
for (const item of manifest.assets) {
  console.log(`Uploading ${item.key}`);
  const args = [npmCli, "exec", "--yes", "--package=wrangler@4", "--", "wrangler", "r2", "object", "put", `${bucket}/${item.key}`,
    "--file", resolve(root, item.file), "--remote", "--content-type", item.contentType,
    "--cache-control", item.cacheControl];
  // No shell interpolation. Keep Cloudflare credentials in Wrangler's normal
  // login/environment; they are never read or printed by this script.
  // Invoke npm's JS entry through Node so this also works on Windows without
  // running npx.cmd through a shell.
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("Uploaded. Apply/merge r2-setup/cors-dashboard.json, then run npm run check:ai-assets.");
