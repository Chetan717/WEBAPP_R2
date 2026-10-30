# Validation: R2-only AI asset patch

- Production build: PASS (`npm run build`).
- Deployment guard: PASS, including a negative test with an accidentally copied WASM file.
- AI delivery and existing template CDN tests: PASS (10 tests).
- Actual MODNet inference with standard ONNX Runtime 1.21.0 binary/loader pair: PASS, 4096 finite output pixels.
- Actual inference with the JSEP binary/loader pair through its WASM execution provider: PASS, 4096 finite output pixels. This verifies the matching runtime artifacts; it is not a physical WebGPU device test.
- Both inference smoke checks supplied the WASM bytes explicitly and made 0 runtime fetch requests.
- Existing 640x640 portrait quality smoke test: PASS, mask IoU 99.31%, missed foreground 0.338%, background leakage 0.173% on the bundled test image. These are fixture-specific quality metrics, not a general accuracy guarantee.
- Local deploy artifact before patch: 71,181,513 bytes, including 62,469,459 bytes of model/WASM files.
- Local deploy artifact after patch: approximately 8.73 MB, with 0 `.wasm`/`.onnx` files. This is an artifact-size comparison, not a measured forecast of total Vercel monthly traffic.
- Runtime cache tests cover concurrent requests, reuse from persistent Cache Storage, invalid/truncated cache eviction, CDN failure, and rejection of app-origin/Vercel asset endpoints.

Limitations:

- Live R2 upload, CORS/cache configuration and Vercel production deployment have not been performed from this environment. Follow `START_HERE_R2_SETUP.md` and run `npm run check:ai-assets` before deploying.
- Android/iOS/WebView and browser end-to-end checks remain for the deployed app. A local browser could not be installed in this environment; the browser download was unavailable. No successful browser test is claimed.
- Three existing UI-text tests in `cropThemeEnglishUi.test.mjs` and `imageUploadLimit.test.mjs` fail on the original supplied ZIP as well as on the patched source. They assert old labels/language strings; they were not rewritten by this patch. The existing duplicate translation-key build warning also remains.

Reproduce the targeted checks:

```bash
node --test tests/r2OnlyAiAssets.test.mjs tests/templateCdnR2.test.mjs
node tests/ortR2BinarySmoke.mjs wasm
node tests/ortR2BinarySmoke.mjs webgpu
node tests/removeBgModelSmoke.mjs
npm run build
```
