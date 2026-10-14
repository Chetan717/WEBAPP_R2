#!/usr/bin/env node
// Targeted, reversible single-block patch for existing user's source.
// No dependencies. Does not change styling, flip logic, or any other files.
const fs = require("node:fs");
const path = require("node:path");
const targetRoot = process.argv[2];
if (!targetRoot) {
  console.error("USAGE: node patch-once-per-editor.cjs <webapp project root>");
  process.exit(2);
}
const file = path.join(path.resolve(targetRoot), "src", "pages", "Editor", "GenralEditPage.jsx");
if (!fs.existsSync(file)) {
  console.error("STOP: GenralEditPage.jsx not found: " + file);
  process.exit(2);
}
const original = fs.readFileSync(file, "utf8");
if (!original.includes('const [dismissedFlipHints, setDismissedFlipHints]') || !original.includes('<FlipTapHint')) {
  console.error("STOP: FlipTapHint patch not detected. No files changed. Install the original hand hint patch first.");
  process.exit(2);
}
const resetEffect = /[ \t]*useEffect\(\(\) => \{\r?\n[ \t]*\/\/ A newly selected design gets a fresh, unobtrusive tap indication\.\r?\n[ \t]*setDismissedFlipHints\(\{ profile: false, rank: false \}\);\r?\n[ \t]*\}, \[selected\?\.url\]\);\r?\n\r?\n/g;
const matches = [...original.matchAll(resetEffect)];
if (matches.length === 0) {
  // Don't claim a fix on an unknown code version.
  const ambiguous = /setDismissedFlipHints\(\{\s*profile:\s*false,\s*rank:\s*false\s*\}\)/.test(original);
  if (ambiguous) {
    console.error("STOP: Found a different reset pattern. No files changed. Please share this file for a tailored patch.");
    process.exit(2);
  }
  console.log("ALREADY PATCHED: no template-change reset present. No files changed.");
  process.exit(0);
}
if (matches.length !== 1) {
  console.error("STOP: Unexpected reset count " + matches.length + ". No files changed.");
  process.exit(2);
}
const updated = original.replace(resetEffect, "");
if (updated === original || updated.includes('A newly selected design gets a fresh, unobtrusive tap indication.')) {
  console.error("STOP: Reset block not safely removed. No files changed.");
  process.exit(2);
}
const backup = file + ".before-one-time-hint-" + new Date().toISOString().replace(/[:.]/g, "-") + ".bak";
fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
try { fs.writeFileSync(file, updated, "utf8"); }
catch (err) {
  console.error("WRITE FAILED. Backup: " + backup);
  throw err;
}
console.log("SUCCESS: removed one template-change reset effect.");
console.log("Changed file: " + file);
console.log("Backup file: " + backup);
console.log("Profile + Rank hints now stay dismissed until Editor is closed and opened again.");
