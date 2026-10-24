import { receiveNativeReply } from './modelWorkerNativeTransport.js';

export function installAiWorker({ preload, process, warmup }) {
  const jobs = new Map();
  const photoJobs = new Set();
  const reports = new Map();
  const reportAll = (stage, pct) => { for (const report of reports.values()) report(stage, pct); };
  let tail = Promise.resolve();
  let preparing = null;
  const prepare = report => {
    // Engines share their own session promise and fan progress out to callers.
    preparing ||= preload(reportAll).catch(e => { preparing = null; throw e; });
    return preparing;
  };
  self.onmessage = ({ data }) => {
    if (receiveNativeReply(data)) return;
    if (data.type === 'cancel') { jobs.get(data.id)?.abort(); return; }
    globalThis.__MLMLIVE_NATIVE_MODEL_CACHE__ = data.nativeCache;
    const controller = new AbortController(); jobs.set(data.id, controller);
    if (data.type === 'process') photoJobs.add(data.id);
    const started = performance.now();
    let preparedAt = started;
    let lastTime = 0; let lastStage = ''; let lastPct = -1;
    const report = (stage, percentage) => {
      if (controller.signal.aborted) return;
      const rounded = Math.round(percentage); const now = Date.now();
      if (stage === lastStage && rounded === lastPct && now - lastTime < 250) return;
      lastTime = now; lastStage = stage; lastPct = rounded;
      self.postMessage({ id: data.id, type: 'progress', stage, percentage: rounded });
    };
    reports.set(data.id, report);
    const run = async () => {
      if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (data.type === 'preload') {
        await prepare(report);
        // A queued real photo warms kernels itself; do not run a dummy before it.
        const photoWaiting = [...photoJobs].some(id => !jobs.get(id)?.signal.aborted);
        if (!photoWaiting && warmup) await warmup(report);
        preparedAt = performance.now();
        return 'ready';
      }
      // Subscribe this action to model progress even if startup prepared first.
      await prepare(report);
      preparedAt = performance.now();
      return process(data.file, report, controller.signal);
    };
    const work = data.type === 'preload' ? run() : tail.then(run);
    if (data.type !== 'preload') tail = work.catch(() => {});
    work.then(value => {
      if (!controller.signal.aborted) self.postMessage({ id: data.id, type: 'done', value,
        timing: { preparationMs: Math.round(preparedAt - started), processingMs: Math.round(performance.now() - preparedAt) } });
    }, e => {
      if (!controller.signal.aborted) self.postMessage({ id: data.id, type: 'error', error: {
        message: e?.message || String(e), name: e?.name || 'Error',
        removeBgUnsupported: e?.removeBgUnsupported, removeBgRetryable: e?.removeBgRetryable,
        removeBgStage: e?.removeBgStage,
      } });
    }).finally(() => { jobs.delete(data.id); photoJobs.delete(data.id); reports.delete(data.id); });
  };
}
