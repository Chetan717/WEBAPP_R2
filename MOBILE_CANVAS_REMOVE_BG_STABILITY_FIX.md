# Mobile Canvas + Remove Background Stability Fix

This build targets the two production issues reported on phone:

1. Profile images render on desktop canvas but not on mobile canvas.
2. Remove Background fails / downloads the heavy BiRefNet model / runs out of memory or returns no result on phones.

## Canvas image changes

- Added `/api/image-proxy.js`, a same-origin Vercel fallback restricted to `mlmprofiles/` images on the known Firebase Storage and profile R2 hosts.
- `useResilientCanvasImage` now tries:
  1. direct CORS-safe fetch,
  2. same-origin `/api/image-proxy`,
  3. anonymous image loading,
  4. next Firebase/R2 candidate.
- `vercel.json` SPA fallback now excludes `/api/` so the proxy function is reachable.

## Remove Background changes

- Phones/tablets now use the tuned MODNet path directly instead of attempting the ~98 MB BiRefNet WebGPU model.
- Desktop can still warm/use BiRefNet and automatically fall back to MODNet if its result is invalid.
- MODNet ONNX model prefers R2, but automatically falls back to bundled `/modnet/modnet.onnx` when the R2 fetch fails.
- ONNX Runtime WASM/MJS is always loaded from same-origin `/modnet/` for Android Chrome/WebView stability.
- Mobile inference is capped to 512 reference / 768 max-side and a smaller output memory budget for faster and more reliable phone execution.

## Deployment

Deploy the full project to Vercel. Do not remove the existing `public/modnet/` directory; it is now the reliability fallback.

After deployment, test `/api/image-proxy?url=<encoded profile URL>` indirectly by opening the editor on the phone; no manual API configuration is needed.
