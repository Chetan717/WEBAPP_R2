const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/pages/Editor/MainEditor.jsx'), 'utf8');
const exp = fs.readFileSync(path.join(root,'src/utils/exportEditorFrameData.js'),'utf8');
for (const file of ['topuplineframes.json','footerframes.json']) {
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'src/data',file),'utf8')),[]);
}
assert.ok(main.includes('import topUplineFrameData from "../../data/topuplineframes.json"'));
assert.ok(main.includes('import footerFrameData from "../../data/footerframes.json"'));
for(const forbidden of ['getDocs(', 'collection(db, COLLECTIONS.MLMGRAPHICS)', 'firebase/firestore', 'Loading editor tools…']) assert.ok(!main.includes(forbidden), forbidden);
for(const remaining of ['<GeneralEditPage','<TopuplineSelect','<FooterSelect','selectedTopFrame','selectedFooterFrame','groupByGraphicsType']) assert.ok(main.includes(remaining),remaining);
assert.ok(exp.includes('where("GraphicsType", "==", graphicsType)'));
assert.ok(exp.includes('response.ok && type.startsWith("image/")'));
assert.ok(exp.includes('downloadJson(FRAME_GROUPS[0].fileName, top)'));
assert.ok(exp.includes('downloadJson(FRAME_GROUPS[1].fileName, footer)'));
// Parse JSX with Typescript, which is installed with the build environment.
try {
 const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
 const src = ts.createSourceFile('MainEditor.jsx', main, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
 assert.deepEqual(src.parseDiagnostics.map(d => d.messageText), []);
 const source2=ts.createSourceFile('exportEditorFrameData.js',exp,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 assert.deepEqual(source2.parseDiagnostics.map(d => d.messageText), []);
} catch(e) { if(e.code !== 'MODULE_NOT_FOUND') throw e; }
console.log('PASS source checks: static catalogs, no Firestore reads, editor components preserved, exporter uses 2 targeted reads');
