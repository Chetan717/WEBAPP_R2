# Remove background: startup warmup, persistent cache, worker repair

Yeh **poora updated app source** hai, latest popup/CDN version par based. Existing popup campaigns, Create Now routing aur New Added badges included hain.

## Is repair mein kya badla

1. **Actual runtime failure reproduce aur repair:** WebGPU runtime ka inferred WASM path development build mein HTML return kar raha tha (`expected magic word 00 61 73 6d`). Matching ONNX Runtime **1.21.0 JSEP WASM + MJS** ab `public/modnet/` mein bundled hain aur explicit same-origin paths se load hote hain. Yeh MODNet ke existing WASM pair se alag, WebGPU ke required assets hain.
2. **App startup par warmup:** first paint ke baad idle slot mein model preparation start hoti hai. Photo page khulne tak wait nahi karti. Startup aur crop controls same singleton model/session promise reuse karte hain; normal successful startup mein duplicate model download nahi hota.
3. **Heavy BiRefNet work worker mein:** model initialization, inference aur alpha compositing UI thread se bahar hain. Cancel worker terminate karke pending requests release karta hai. Stalled model connection aur stuck worker bounded hain; continuous slow download ko short total-download deadline se cut nahi kiya jata.
4. **Existing model cache reuse:** current `mlmlive-ai-models-v3` aur known legacy `mlmlive-birefnet-*` / `mlmlive-ai-models-*` entries mein same model reuse hota hai. Known older CDN URLs aur `mlmlive-cache=v1` keys compatible hain. Custom model hosts/tokens ko unrelated cached model se replace nahi kiya jata.
5. **Cache integrity:** HTTP 206, HTML, incomplete model bytes aur known wrong model length reject hote hain. Sirf complete binary Cache Storage mein save hoti hai. Known production BiRefNet model length **98,484,532 bytes** hai. Download stream normally ek preallocated buffer use karti hai; progress har network chunk par React render nahi karata.
6. **Failure par same-action fallback:** capable devices par BiRefNet primary hai; unsupported WebGPU/FP16 ya engine failure par existing MODNet same photo process karta hai. Startup par primary unavailable ho to fallback warm hota hai. Unchanged background photo ko success nahi kehte.

## Photo flow

**Upload → first Crop / Done → Remove Background → final Crop / Done → form apply.**

Crop components, form callbacks, output quality settings aur Achievement Image / Feature Photos ka existing `skipBackgroundRemoval` behavior is repair mein unchanged hain. BiRefNet Lite 512 FP16 input ImageNet-normalized 512×512 hai; output logits par sigmoid aur original-aspect compositing retain hai.

## CDN delivery preserve ki gayi hai

Template/catalog `cdn.mlmposter.com`, profile `profile.mlmposter.com`, catalog version single-flight, CDN-first/Firestore-fallback flow, image delivery, TTL configuration aur existing R2 compatibility mein is repair ne change nahi kiya. Latest delivered app se template/CDN helper files byte-for-byte compare ki gayi hain. Cloudflare rules, R2 objects aur Firestore data par live write nahi hua.

Model URL values:

```env
VITE_BIREFNET_MODEL_URL=https://models.mlmposter.com/birefnet/model_fp16.onnx
VITE_MODNET_ASSET_BASE_URL=https://models.mlmposter.com/modnet/
```

Exactly known old `models.mlmposter.com/models/birefnet/...` aur `/models/modnet/...` paths runtime par correct existing public endpoints mein normalize hote hain. Stable model version query retain hai; har photo par timestamp/random key nahi lagti. Other environment values preserve hain.

## Deploy

```bash
npm ci --legacy-peer-deps
npm run build
```

Updated frontend source ko normal hosting/Vercel process se deploy karein. Sirf env value badalne se purana deployed JavaScript update nahi hota. **Poora public/modnet folder deploy hona chahiye**, including dono new `ort-wasm-simd-threaded.jsep.*` files. Vite worker format `es` set hai.

Is repair ke liye Cloud Functions deploy, new backend, Firestore rules update ya paid removal API required nahi. Naye Firestore reads/writes/polling add nahi hain. Model aur static runtime delivery ki existing bandwidth/storage billing apply hoti hai.

## Cache behavior

BiRefNet pehli baar approx 98.5 MB download hota hai; slow internet par cold download ab bhi time leta hai. Browser Cache Storage bacha ho to next load model network se dobara nahi leta. Ek app session mein compiled model reuse hota hai. Browser/WebView data clear ya storage eviction hone par download phir required ho sakta hai. Unsupported FP16 devices large BiRefNet download skip karte hain; MODNet ka existing CDN + bundled model fallback retain hai.

## Verification

- Production app build pass.
- **76 targeted tests pass**, including startup scheduling, StrictMode cleanup, worker reuse/cancel/crash recovery, legacy/current model cache, malformed/partial response rejection, BiRefNet-first routing, fallback, URLs, quality, template CDN, profile R2 aur popup cache behavior.
- Full app suite mein **24 existing failing cases** ka same set hai; is repair ne naya failing label add nahi kiya.
- Real Chromium cache test: poori **98,484,532-byte model file** cold load ke baad reload par **zero model-network requests** se reused hui. Corrupt HTML cache entry repair hui. Local test server ke timings real users ke internet/download timings ka benchmark nahi hain.
- Production-built actual uploader/crop components par do consecutive photos real MODNet inference se transparent PNG bani; second photo par **zero repeated model/WASM requests**. Initial aur final crop Done flow pass hua.
- Actual BiRefNet model ke saath software WebGPU path par correct JSEP WASM load hua. Adapter mein shader-f16 unavailable hone par primary failure se real MODNet fallback aur final transparent PNG verify hui. Normal capability gate unsupported FP16 adapter par BiRefNet download skip karti hai.
- Supported-primary wait/progress route controlled output fixture se separately checked hai. Is environment mein physical FP16-capable GPU available nahi hai; successful real BiRefNet FP16 inference ko verified claim nahi kiya gaya.

Full source ZIP mein validation-only 98 MB model, local QA harness, generated dist aur installed node_modules included nahi hain. Live frontend ko is session se deploy nahi kiya gaya.
