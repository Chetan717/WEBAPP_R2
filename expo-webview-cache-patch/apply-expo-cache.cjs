// Run after npm install in the web project. Patches the user's current Expo
// wrapper in place, retaining existing push/share/download/navigation handlers.
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || '.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const fsVersion = pkg.dependencies?.['expo-file-system'] || pkg.devDependencies?.['expo-file-system'] || '';
if (Number(fsVersion.match(/\d+/)?.[0] || 0) < 19) throw new Error('This patch needs Expo SDK 54+ with expo-file-system already installed. No SDK/package upgrade was made.');
let ts;
try { ts = require(require.resolve('typescript', { paths: [root, __dirname] })); }
catch { throw new Error('Run npm install in this web project or the Expo project first.'); }
const target = ['comp/WebSheet.tsx', 'App.tsx', 'App.js'].map(p => path.join(root, p)).find(p => fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes('<WebView'));
if (!target) throw new Error('Could not find the current WebView in comp/WebSheet.tsx, App.tsx or App.js.');
let source = fs.readFileSync(target, 'utf8');
const folder = path.join(root, 'mlmlive-native-cache');
fs.mkdirSync(folder, { recursive: true });
if (!source.includes('handleNativeModelCacheMessage')) {
  const ast = ts.createSourceFile(target, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const views = [];
  function visit(n) {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(ast) === 'WebView') views.push(n);
    ts.forEachChild(n, visit);
  }
  visit(ast);
  if (views.length !== 1) throw new Error('Expected one WebView. No wrapper changes were made.');
  const view = views[0];
  const attrs = new Map(view.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(ast), a]));
  const expr = name => {
    const init = attrs.get(name)?.initializer;
    return init && ts.isJsxExpression(init) && init.expression ? init.expression.getText(ast) : null;
  };
  const ref = expr('ref'); const sourceProp = expr('source'); const handler = expr('onMessage');
  if (!ref || !sourceProp || !handler) throw new Error('WebView needs explicit ref, source and onMessage attributes. No wrapper changes were made.');
  const edits = [];
  const add = [];
  const set = (name, text) => {
    const attr = attrs.get(name);
    if (attr) edits.push({ start: attr.getStart(ast), end: attr.end, text: `${name}={${text}}` });
    else add.push(`${name}={${text}}`);
  };
  set('onMessage', `(event) => { if (!handleNativeModelCacheMessage(event, ${ref}, (${sourceProp}).uri)) (${handler})(event); }`);
  for (const name of ['injectedJavaScriptBeforeContentLoaded', 'injectedJavaScript']) {
    const old = expr(name);
    if (attrs.has(name) && !old) throw new Error(`Use a JSX expression for ${name} before applying the patch.`);
    set(name, old ? `MODEL_CACHE_BOOTSTRAP + (${old} || '')` : 'MODEL_CACHE_BOOTSTRAP');
  }
  set('cacheEnabled', 'true'); set('incognito', 'false'); set('domStorageEnabled', 'true'); set('cacheMode', '"LOAD_DEFAULT"');
  if (add.length) edits.push({ start: view.attributes.end, end: view.attributes.end, text: '\n            ' + add.join('\n            ') });
  for (const e of edits.sort((a,b) => b.start - a.start)) source = source.slice(0,e.start) + e.text + source.slice(e.end);
  let relative = path.relative(path.dirname(target), path.join(folder, 'NativeModelCacheBridge')).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = './' + relative;
  source = `import { MODEL_CACHE_BOOTSTRAP, handleNativeModelCacheMessage } from '${relative}';\n` + source;
  const checked = ts.createSourceFile(target, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (checked.parseDiagnostics.length) throw new Error('Generated wrapper did not parse. No wrapper changes were made.');
  const backup = target + '.before-model-cache';
  if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  fs.writeFileSync(target, source);
}
for (const name of ['NativeModelCache.ts', 'NativeModelCacheBridge.ts']) fs.copyFileSync(path.join(__dirname, name), path.join(folder, name));
console.log('Updated: ' + target);
console.log('Native model cache added. Existing Expo dependencies/app IDs were preserved.');
console.log('Publish the Expo JS update with your existing EAS workflow, or rebuild the app.');
