import * as FS from 'expo-file-system/legacy';
import { File } from 'expo-file-system';

type Message = { id: string; page: string; asset: string; action: string; url?: string; offset?: number; length?: number; data?: string };
type Reply = (value: Record<string, unknown>) => void;
const ASSETS: Record<string, { size: number; magic: number[]; remote?: string; path?: string }> = {
  birefnet: { size: 98484532, magic: [8], remote: 'https://models.mlmposter.com/birefnet/model_fp16.onnx' },
  modnet: { size: 25888640, magic: [8], remote: 'https://models.mlmposter.com/modnet/modnet.onnx' },
  'birefnet-wasm': { size: 23914392, magic: [0,97,115,109], path: '/modnet/ort-wasm-simd-threaded.jsep.wasm' },
  'modnet-wasm': { size: 12666427, magic: [0,97,115,109], path: '/modnet/ort-wasm-simd-threaded.wasm' },
};
const decode = (data: string) => Uint8Array.from(atob(data), ch => ch.charCodeAt(0));
type Writer = { file: File; handle: Awaited<ReturnType<File['open']>>; offset: number; page: string };

export class NativeModelCache {
  private root: string;
  private verified = new Set<string>();
  private downloads = new Map<string, Promise<number>>();
  private tasks = new Map<string, ReturnType<typeof FS.createDownloadResumable>>();
  private watchers = new Map<string, Set<Reply>>();
  private writers = new Map<string, Writer>();
  private page = '';
  private retired = new Set<string>();
  private active = true;
  private wake = new Set<() => void>();
  constructor(private origin: string) {
    if (!FS.documentDirectory) throw new Error('Persistent app storage is unavailable');
    this.root = FS.documentDirectory + 'mlmlive-ai-models-v1/';
  }
  private path(asset: string) { return this.root + asset + '.bin'; }
  private async ready(asset: string) {
    const spec = ASSETS[asset];
    if (!spec) throw new Error('Unknown model asset');
    if (this.verified.has(asset)) return true;
    const info = await FS.getInfoAsync(this.path(asset));
    if (!info.exists || info.isDirectory || info.size !== spec.size) return false;
    const header = decode(await FS.readAsStringAsync(this.path(asset), { encoding: FS.EncodingType.Base64, position: 0, length: spec.magic.length }));
    if (!spec.magic.every((n, i) => header[i] === n)) return false;
    this.verified.add(asset); return true;
  }
  async setActive(active: boolean) {
    this.active = active;
    if (active) { for (const fn of this.wake) fn(); this.wake.clear(); return; }
    await Promise.all([...this.tasks].map(async ([asset, task]) => {
      try {
        const paused = await task.pauseAsync();
        await FS.writeAsStringAsync(this.root + asset + '.resume.json', JSON.stringify(paused));
      } catch { /* Completion may race with backgrounding. */ }
    }));
  }
  private async waitActive() {
    if (!this.active) await new Promise<void>(resolve => this.wake.add(resolve));
  }
  private async ensure(asset: string, requested?: string): Promise<number> {
    const spec = ASSETS[asset];
    if (await this.ready(asset)) return spec.size;
    const existing = this.downloads.get(asset);
    if (existing) return existing;
    const job = (async () => {
      await FS.makeDirectoryAsync(this.root, { intermediates: true });
      // The bridge can fetch only these four pinned public assets. Never accept
      // an arbitrary URL or path from web content.
      let target = new URL(spec.remote || spec.path!, this.origin);
      if (requested) {
        const supplied = new URL(requested);
        const localModnet = asset === 'modnet' && supplied.origin === this.origin && supplied.pathname === '/modnet/modnet.onnx';
        if (!localModnet && (supplied.origin !== target.origin || supplied.pathname !== target.pathname)) throw new Error('Model URL does not match the pinned asset');
        if (!localModnet) target = supplied;
      }
      const partial = this.root + asset + '.partial';
      const checkpoint = this.root + asset + '.resume.json';
      let resume: string | undefined;
      try {
        const saved = JSON.parse(await FS.readAsStringAsync(checkpoint));
        if (saved.url === target.href && saved.fileUri === partial) resume = saved.resumeData;
      } catch {}
      let lastProgress = 0;
      const task = FS.createDownloadResumable(target.href, partial, {}, event => {
        if (Date.now() - lastProgress < 250) return;
        lastProgress = Date.now();
        const progress = Math.min(100, Math.round(event.totalBytesWritten / spec.size * 100));
        for (const reply of this.watchers.get(asset) || []) reply({ progress });
      }, resume);
      this.tasks.set(asset, task);
      let useResume = Boolean(resume);
      try {
        let result;
        do {
          await this.waitActive();
          result = useResume ? await task.resumeAsync() : await task.downloadAsync();
          useResume = true;
        } while (!result);
        if (result.status !== 200 && result.status !== 206) throw new Error(`Model download failed (${result.status})`);
        const info = await FS.getInfoAsync(partial);
        if (!info.exists || info.isDirectory || info.size !== spec.size) throw new Error('Model download is incomplete');
        const header = decode(await FS.readAsStringAsync(partial, { encoding: FS.EncodingType.Base64, position: 0, length: spec.magic.length }));
        if (!spec.magic.every((n, i) => header[i] === n)) throw new Error('Model download is not a valid binary');
        await FS.deleteAsync(this.path(asset), { idempotent: true });
        await FS.moveAsync({ from: partial, to: this.path(asset) });
        await FS.deleteAsync(checkpoint, { idempotent: true });
        this.verified.add(asset); return spec.size;
      } catch (e) {
        await FS.deleteAsync(checkpoint, { idempotent: true }).catch(() => {});
        throw e;
      } finally { this.tasks.delete(asset); }
    })();
    this.downloads.set(asset, job);
    try { return await job; } finally { this.downloads.delete(asset); }
  }
  async receive(message: Message, reply: Reply) {
    const send: Reply = value => reply({ id: message.id, ...value });
    const { asset, action, page } = message;
    try {
      if (!ASSETS[asset] || !page || !message.id) throw new Error('Invalid cache request');
      if (this.retired.has(page)) throw new Error('Expired cache page');
      if (this.page !== page) {
        if (this.page) this.retired.add(this.page);
        this.page = page;
        const old = [...this.writers.values()]; this.writers.clear();
        for (const item of old) await item.handle.close();
      }
      if (action === 'status') { send({ ready: await this.ready(asset) }); return; }
      if (action === 'prepare') {
        let watchers = this.watchers.get(asset);
        if (!watchers) { watchers = new Set(); this.watchers.set(asset, watchers); }
        watchers.add(send);
        try { send({ size: await this.ensure(asset, message.url) }); }
        finally { watchers.delete(send); }
        return;
      }
      if (action === 'read') {
        const { offset, length } = message;
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset! < 0 || length! <= 0 || length! > 196608 || offset! + length! > ASSETS[asset].size || !await this.ready(asset)) throw new Error('Invalid model read');
        send({ data: await FS.readAsStringAsync(this.path(asset), { encoding: FS.EncodingType.Base64, position: offset, length }) }); return;
      }
      if (action === 'write-start') {
        if (this.downloads.has(asset) || this.writers.has(asset)) throw new Error('Model cache already busy');
        await FS.makeDirectoryAsync(this.root, { intermediates: true });
        const file = new File(this.root + asset + '.import');
        await file.create({ overwrite: true });
        const handle = await file.open();
        this.writers.set(asset, { file, handle, offset: 0, page }); send({ ok: true }); return;
      }
      const writer = this.writers.get(asset);
      if (!writer || writer.page !== page) throw new Error('Model cache import not started');
      if (action === 'write') {
        if (typeof message.data !== 'string' || message.data.length > 262144 || message.offset !== writer.offset) throw new Error('Invalid model cache chunk');
        const bytes = decode(message.data);
        if (writer.offset + bytes.length > ASSETS[asset].size) throw new Error('Model cache import is oversized');
        await writer.handle.writeBytes(bytes); writer.offset += bytes.length; send({ ok: true }); return;
      }
      if (action === 'write-finish' || action === 'write-cancel') {
        this.writers.delete(asset); await writer.handle.close();
        if (action === 'write-finish') {
          if (writer.offset !== ASSETS[asset].size) throw new Error('Model cache import is incomplete');
          const header = decode(await FS.readAsStringAsync(writer.file.uri, { encoding: FS.EncodingType.Base64, position: 0, length: ASSETS[asset].magic.length }));
          if (!ASSETS[asset].magic.every((n, i) => header[i] === n)) throw new Error('Invalid imported binary');
          await FS.deleteAsync(this.path(asset), { idempotent: true });
          await FS.moveAsync({ from: writer.file.uri, to: this.path(asset) });
          this.verified.add(asset);
        } else await FS.deleteAsync(writer.file.uri, { idempotent: true });
        send({ ok: true }); return;
      }
      throw new Error('Unknown model cache operation');
    } catch (e) { send({ error: e instanceof Error ? e.message : String(e) }); }
  }
}
