import { readdir, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";

const root = resolve(process.argv[2] || "dist");
const blocked = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else if (/\.(?:wasm|onnx|onnx_data)$/i.test(item.name)) {
      blocked.push({ path: relative(root, path), bytes: (await stat(path)).size });
    }
  }
}
await walk(root);
if (blocked.length) {
  console.error("Build blocked: heavy AI files must be hosted on R2, never Vercel.", blocked);
  process.exitCode = 1;
} else {
  console.log("R2-only check passed: 0 local WASM/model files in the deployment.");
}
