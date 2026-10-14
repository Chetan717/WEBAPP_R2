import fs from 'node:fs';
import path from 'node:path';

// Run from WebApp project root after copying both downloaded JSON files.
const root = process.cwd();
const catalogs = [
  ['topuplineframes.json', 'TopUplineFrames'],
  ['footerframes.json', 'Footers'],
];
let errors = 0;
for (const [file, expectedType] of catalogs) {
  try {
    const fullPath = path.join(root, 'src', 'data', file);
    const docs = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!Array.isArray(docs) || !docs.length) throw new Error('JSON is empty; run one-time exporter first.');
    let links = 0;
    let firebase = 0;
    for (const [i, doc] of docs.entries()) {
      if (doc.GraphicsType !== expectedType || doc.Active !== true) throw new Error(`doc[${i}] has incorrect GraphicsType or Active`);
      if (!Array.isArray(doc.GraphicsLinks)) throw new Error(`doc[${i}].GraphicsLinks must be an array`);
      for (const [j, link] of doc.GraphicsLinks.entries()) {
        if (!link || typeof link.value !== 'string' || !link.value.trim()) throw new Error(`doc[${i}].GraphicsLinks[${j}] missing value URL`);
        links++;
        if (link.value.includes('firebasestorage.googleapis.com')) firebase++;
      }
    }
    if (links === 0) throw new Error('No usable frame URLs found');
    console.log(`PASS ${expectedType}: ${docs.length} active docs, ${links} image URLs (${firebase} still Firebase Storage)`);
  } catch (error) {
    errors++;
    console.error(`FAIL ${file}: ${error.message}`);
  }
}
if (errors) {
  console.error('STOP: Do not deploy MainEditor with empty or invalid frame JSON.');
  process.exitCode = 1;
} else {
  console.log('PASS: local JSON catalogs are ready. No Firestore runtime reads required by MainEditor.');
}
