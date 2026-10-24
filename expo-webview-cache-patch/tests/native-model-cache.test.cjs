const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const original = fs.readFileSync(path.join(__dirname, '../NativeModelCache.ts'), 'utf8');

function fixture({ truncated = false, html = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mlmlive-model-'));
  const root = directory + '/';
  const bytes = Buffer.alloc(4096, 21); bytes[0] = 8;
  const downloads = [];
  const info = async p => { try { const s = fs.statSync(p); return { exists: true, isDirectory: s.isDirectory(), size: s.size }; } catch { return { exists: false }; } };
  const api = {
    documentDirectory: root, EncodingType: { Base64: 'base64' }, getInfoAsync: info,
    async makeDirectoryAsync(p) { fs.mkdirSync(p, { recursive: true }); },
    async readAsStringAsync(p, o = {}) { const b = fs.readFileSync(p); return o.encoding === 'base64' ? b.subarray(o.position || 0, o.length === undefined ? b.length : (o.position || 0) + o.length).toString('base64') : b.toString(); },
    async writeAsStringAsync(p, data) { fs.writeFileSync(p, data); },
    async deleteAsync(p) { fs.rmSync(p, { force: true, recursive: true }); },
    async moveAsync({ from, to }) { fs.renameSync(from, to); },
    createDownloadResumable(url, fileUri, options, progress, resumeData) {
      const record = { url, fileUri, resumeData }; downloads.push(record);
      const run = async () => {
        const data = html ? Buffer.alloc(4096, 60) : truncated ? bytes.subarray(0, 200) : bytes;
        await new Promise(resolve => setImmediate(resolve)); fs.writeFileSync(fileUri, data);
        progress({ totalBytesWritten: data.length }); return { status: 200, uri: fileUri };
      };
      return { downloadAsync: run, resumeAsync: run, async pauseAsync() { return { url, fileUri, options, resumeData: 'checkpoint' }; } };
    },
  };
  class File {
    constructor(uri) { this.uri = uri; }
    create() { fs.writeFileSync(this.uri, ''); }
    open() {
      const fd = fs.openSync(this.uri, 'r+'); let offset = 0;
      return { writeBytes: bytes => { fs.writeSync(fd, bytes, 0, bytes.length, offset); offset += bytes.length; }, close: () => fs.closeSync(fd) };
    }
  }
  const code = ts.transpileModule(original.replace('size: 98484532', 'size: 4096'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const box = { exports: {}, require: name => name === 'expo-file-system/legacy' ? api : { File }, URL, atob, Uint8Array, Map, Set, Date, Promise, Error, Number };
  vm.runInNewContext(code, box);
  const create = () => new box.exports.NativeModelCache('https://app.example');
  let id = 0;
  const message = (cache, fields) => new Promise(resolve => { cache.receive({ id: String(++id), page: 'first', asset: 'birefnet', ...fields }, reply => { if (reply.progress === undefined) resolve(reply); }); });
  return { root, bytes, downloads, create, message, dispose: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
async function using(options, fn) { const f = fixture(options); try { await fn(f); } finally { f.dispose(); } }

test('completed model survives a new app instance with zero additional downloads', async () => using({}, async f => {
  const first = f.create();
  assert.equal((await f.message(first, { action: 'prepare' })).size, 4096);
  assert.equal((await f.message(f.create(), { action: 'prepare' })).size, 4096);
  assert.equal(f.downloads.length, 1);
  const read = await f.message(first, { action: 'read', offset: 0, length: 4096 });
  assert.deepEqual(Buffer.from(read.data, 'base64'), f.bytes);
}));
test('parallel preparation is one native network download', async () => using({}, async f => {
  const c = f.create(); const r = await Promise.all([f.message(c, { action: 'prepare' }), f.message(c, { action: 'prepare' })]);
  assert.ok(r.every(x => x.size === 4096)); assert.equal(f.downloads.length, 1);
}));
for (const bad of ['truncated', 'html']) test(`${bad} response never becomes a completed cache entry`, async () => using({ [bad]: true }, async f => {
  const c = f.create(); assert.ok((await f.message(c, { action: 'prepare' })).error);
  assert.equal((await f.message(c, { action: 'status' })).ready, false);
}));
test('read bounds reject oversized, negative and incomplete requests', async () => using({}, async f => {
  const c = f.create(); await f.message(c, { action: 'prepare' });
  for (const [offset, length] of [[-1,1],[0,196609],[4090,100],[1.5,1]]) assert.ok((await f.message(c, { action: 'read', offset, length })).error);
}));
test('importing an existing browser cache needs no network request', async () => using({}, async f => {
  const c = f.create(); assert.ok((await f.message(c, { action: 'write-start' })).ok);
  for (let i = 0; i < 4096; i += 1024) assert.ok((await f.message(c, { action: 'write', offset: i, data: f.bytes.subarray(i,i+1024).toString('base64') })).ok);
  assert.ok((await f.message(c, { action: 'write-finish' })).ok);
  assert.equal((await f.message(f.create(), { action: 'prepare' })).size, 4096); assert.equal(f.downloads.length, 0);
}));
test('out-of-order and partial imports cannot become ready', async () => using({}, async f => {
  const c = f.create(); await f.message(c, { action: 'write-start' });
  assert.ok((await f.message(c, { action: 'write', offset: 1, data: f.bytes.toString('base64') })).error);
  assert.ok((await f.message(c, { action: 'write-finish' })).error);
  assert.equal((await f.message(c, { action: 'status' })).ready, false);
}));
test('a new WebView page releases an orphaned import and ignores retired writes', async () => using({}, async f => {
  const c = f.create(); await f.message(c, { action: 'write-start' });
  assert.ok((await f.message(c, { action: 'write-start', page: 'second' })).ok);
  assert.ok((await f.message(c, { action: 'write', page: 'first', offset: 0, data: f.bytes.toString('base64') })).error);
  assert.ok((await f.message(c, { action: 'write', page: 'second', offset: 0, data: f.bytes.toString('base64') })).ok);
  assert.ok((await f.message(c, { action: 'write-finish', page: 'second' })).ok);
}));
test('saved native download checkpoints are supplied when resuming', async () => using({}, async f => {
  fs.mkdirSync(f.root + 'mlmlive-ai-models-v1');
  const fileUri = f.root + 'mlmlive-ai-models-v1/birefnet.partial';
  fs.writeFileSync(fileUri, f.bytes.subarray(0,200));
  fs.writeFileSync(f.root + 'mlmlive-ai-models-v1/birefnet.resume.json', JSON.stringify({ url: 'https://models.mlmposter.com/birefnet/model_fp16.onnx', fileUri, resumeData: 'saved-state' }));
  await f.message(f.create(), { action: 'prepare' }); assert.equal(f.downloads[0].resumeData, 'saved-state');
}));
