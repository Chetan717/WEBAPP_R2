import test from 'node:test';
import assert from 'node:assert/strict';
import { installAiWorker } from '../src/pages/mainform/utils/aiWorkerRuntime.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
async function using(options, check) {
  const old = globalThis.self;
  const replies = [];
  globalThis.self = { postMessage: data => replies.push(data) };
  try {
    installAiWorker(options);
    await check({ send: data => self.onmessage({ data }), replies });
  } finally { globalThis.self = old; delete globalThis.__MLMLIVE_NATIVE_MODEL_CACHE__; }
}
test('startup and a queued photo share preparation and skip redundant dummy inference', async () => {
  let finish; const waiting = new Promise(resolve => { finish = resolve; });
  let prepares = 0, warmups = 0, photos = 0;
  await using({ preload: async report => { prepares++; report('Downloading',10); await waiting; }, warmup: async () => { warmups++; }, process: async () => { photos++; return 'cutout'; } }, async ({ send, replies }) => {
    send({ id:1, type:'preload' }); send({ id:2, type:'process', file:new Blob(['photo']) });
    await flush(); finish(); await flush(); await flush();
    assert.equal(prepares,1); assert.equal(warmups,0); assert.equal(photos,1);
    assert.ok(replies.some(x => x.id === 2 && x.type === 'done'));
  });
});
test('cancelling an in-flight photo discards its reply and the next photo uses the same engine', async () => {
  let finish; let prepares=0; const order=[];
  await using({ preload:async()=>{prepares++;},process:async(file,report,signal)=>{
    const value=await file.text();order.push(value);
    if(value==='first')await new Promise(resolve=>{finish=resolve;});
    return value;
  } }, async ({ send, replies }) => {
    send({id:1,type:'process',file:new Blob(['first'])});await flush();
    send({id:1,type:'cancel'});send({id:2,type:'process',file:new Blob(['second'])});await flush();
    assert.deepEqual(order,['first']);finish();await flush();await flush();
    assert.deepEqual(order,['first','second']);assert.equal(prepares,1);
    assert.equal(replies.some(x=>x.id===1&&x.type==='done'),false);assert.ok(replies.some(x=>x.id===2&&x.type==='done'));
  });
});
