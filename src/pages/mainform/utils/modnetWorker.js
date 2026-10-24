import { installAiWorker } from './aiWorkerRuntime.js';
import { preloadModNet, removeBackgroundWithModNet } from './modnetBg.js';
installAiWorker({ preload: preloadModNet, process: removeBackgroundWithModNet });
