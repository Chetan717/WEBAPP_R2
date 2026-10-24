import { installAiWorker } from "./aiWorkerRuntime.js";
import { preloadBirefNet, warmupBirefNet, removeBackgroundWithBirefNet } from "./birefnetBg.js";
installAiWorker({ preload: preloadBirefNet, warmup: warmupBirefNet, process: removeBackgroundWithBirefNet });
