import { preloadBirefNet, removeBackgroundWithBirefNet } from "./birefnetBg.js";

// Startup initialization and an explicit photo request share one model/session.
// They may overlap while downloading; removeBg.js serializes photo inference.
self.onmessage = async ({ data }) => {
  const { id, type, file } = data;
  let lastStage = "";
  let lastPercentage = -1;
  let lastTime = 0;
  const report = (stage, percentage) => {
    const rounded = Math.round(percentage);
    const now = Date.now();
    // Avoid a React update/message for every 64 KB network chunk.
    if (stage === lastStage && rounded === lastPercentage && now - lastTime < 250) return;
    lastStage = stage;
    lastPercentage = rounded;
    lastTime = now;
    self.postMessage({ id, type: "progress", stage, percentage: rounded });
  };
  try {
    const value = type === "preload"
      ? await preloadBirefNet(report)
      : await removeBackgroundWithBirefNet(file, report);
    self.postMessage({ id, type: "done", value });
  } catch (error) {
    self.postMessage({ id, type: "error", error: {
      message: error?.message || String(error), name: error?.name || "Error",
      removeBgStage: error?.removeBgStage,
      removeBgRetryable: error?.removeBgRetryable,
      removeBgUnsupported: error?.removeBgUnsupported,
    } });
  }
};
