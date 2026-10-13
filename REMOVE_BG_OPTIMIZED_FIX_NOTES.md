# Remove Background Optimized Fix

This patch fixes the blank/near-transparent result after background removal and improves first-use speed.

## What changed

1. **Fast engine first:** MODNet is warmed first, so the first remove-bg run starts faster.
2. **Quality engine in background:** BiRefNet now warms silently in the background on capable devices.
3. **No more blank output trap:** if BiRefNet returns a near-blank transparent image, the app automatically falls back to MODNet in the same action.
4. **Same-action fallback:** users no longer need to retry manually when the quality engine misbehaves.
5. **Better progress flow:** progress messages now make it clearer when the fast engine is being used and when the high-quality engine is still warming.

## Main file changed

- `src/pages/mainform/utils/removeBg.js`

## Expected behaviour now

- First remove-bg use should start faster.
- If BiRefNet is ready and healthy, it will be used.
- If BiRefNet is not ready yet, the app uses MODNet immediately.
- If BiRefNet gives a bad/blank matte, the app automatically switches to MODNet.
