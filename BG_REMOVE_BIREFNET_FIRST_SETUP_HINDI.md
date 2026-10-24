# MLMLIVE: Expo WebView background-removal repair

Is ZIP mein full web-app source aur `expo-webview-cache-patch/` included hai.
Photo flow: **Upload → Crop → Remove BG → Final Crop → Done**.

## Deploy: web aur Expo dono update karein

1. Web project mein:

```bash
npm ci --legacy-peer-deps
npm run build
```

Apne existing hosting/Vercel workflow se deploy karein. Poora `public/modnet/` deploy hona chahiye, including matching ONNX Runtime 1.21.0 JSEP WASM/MJS files. Environment aur template-CDN configuration is patch mein unchanged hain.

2. Isi extracted web-project folder se apne **current Expo source** par patch lagayein:

```bash
node expo-webview-cache-patch/apply-expo-cache.cjs ../YOUR_EXPO_PROJECT
```

`../YOUR_EXPO_PROJECT` ko actual Expo project path se replace karein. Windows par quoted absolute path bhi de sakte hain. Script current `comp/WebSheet.tsx`, `App.tsx`, ya `App.js` mein WebView locate karta hai. Wrapper ka backup `.before-model-cache` banata hai, do cache modules copy karta hai, aur existing message/share/download/navigation handling preserve karta hai. Dobara chalana safe/idempotent hai. Multiple/unsupported WebView layout par script wrapper ko guess karke overwrite nahi karta.

3. Expo project ko apne existing compatible EAS Update workflow se release karein, ya usual Android/iOS build banayein. Native code ka JS update installed app tak pahunchna zaroori hai. Sirf web deploy se Expo Documents cache enable nahi hota. Provided historical wrappers mein `expo-file-system` already tha; script SDK/dependency/app ID upgrade nahi karta. Patch Expo SDK 54+ aur existing `expo-file-system` 19+ ke liye hai.

## Kya fix hua

- BiRefNet Lite 512 FP16 pehle. Actual WebGPU/FP16 capability unavailable ho ya primary removal fail ho, tabhi MODNet fallback. Slow timer ki wajah se primary downgrade nahi hota.
- Startup par idle warmup aur one shared model/session. BiRefNet ke GPU kernels bhi startup par warm hote hain; real photo already queued ho to redundant dummy inference skip hoti hai.
- BiRefNet aur supported browsers mein MODNet dono dedicated workers mein. Image preprocessing, inference aur PNG compositing UI thread se bahar.
- Cancel ek photo request cancel karta hai; prepared worker/model ko terminate nahi karta. Genuine worker crash/reset alag handle hota hai. Actual photos worker mein serialized hain.
- Initial crop screen processing ke dauran mounted rehti hai. Final result usi screen ka source replace karta hai. Close/reopen bounce hata diya hai.
- Old/cancelled job ka progress/result current photo ko replace nahi karta. Done double tap, late encoder callback aur queue generation guards added hain.
- Multi-photo selection modal crop start hote hi close hota hai, taaki uska backdrop Done button ko block na kare. Queue operations React state-updater callbacks mein side effects nahi karte.
- 800px crops native async canvas encoder use karte hain. Extra crop-worker startup/8-second timeout wait avoid hota hai. Missing/null encoder callbacks bounded hain. Final PNG lossless rehti hai; existing crop resolution, initial WebP quality, matte/refinement algorithms retained hain.
- Render ke har progress tick par naya Blob preview URL nahi banta. Source/preview URLs release hote hain; tensor outputs aur decoded bitmaps existing cleanup retain karte hain.
- Shared startup preparation failure ko user Cancel samajhne wala reset race fixed hai. Failed removal original/background photo ko successful cutout nahi maanta. Same crop par deliberate retry available hai.

## App close/reopen cache

- Browser version: existing Cache Storage/HTTP cache and compatible old BiRefNet cache entries reuse hote hain.
- Patched Expo: complete model/WASM files app **Documents** directory mein rehte hain. App process close/reopen se completed file delete nahi hoti. Ready native binary ko browser cache mein dobara copy karke extra 98 MB write nahi hoti.
- Already downloaded browser model ko bounded chunks se native storage mein migrate kiya jata hai, bina ek aur network download ke. Native import background preparation ke baad hota hai. Native reads bhi bounded chunks use karte hain, whole 98 MB base64 string nahi.
- Partial, HTML, incorrect-length/header files completed cache nahi bante. Native download single-flight hai. App backgrounding par resumable download checkpoint save hota hai; foreground par resume hota hai.
- App uninstall/clear-data se persistent files delete ho sakti hain. Mid-download force-kill ke baad incomplete transfer restart bhi ho sakta hai; completed model persistence alag hai.
- Compiled GPU session/RAM app process death ke baad retain nahi hoti. Model bytes persist hoti hain; session/kernels next launch par background mein prepare hote hain. First cold download aur device capability ka actual time internet/hardware par depend karta hai. Kisi physical Expo phone par fixed seconds/no-lag guarantee verify nahi ki gayi hai.

## Model/CDN settings

Existing values retain hain:

```env
VITE_BIREFNET_MODEL_URL=https://models.mlmposter.com/birefnet/model_fp16.onnx
VITE_MODNET_ASSET_BASE_URL=https://models.mlmposter.com/modnet/
```

BiRefNet: 98,484,532 bytes. Stable version query `birefnet-lite-512-fp16-2026-10-09-v1`. Har photo par random/timestamp URL nahi banta. Known old extra `/models/` paths normalize hote hain; custom model URLs preserve hote hain. Future native model/runtime replacement par pinned asset specs/native cache version bhi update karein.

Template/catalog `cdn.mlmposter.com`, profile `profile.mlmposter.com`, CDN-first/Firestore fallback, catalog version single-flight, popup routing/cache aur all other environment values previous delivered ZIP se unchanged hain. Changed form files ke database/function call expressions compare karke same paye gaye. Live Cloudflare/R2/Firestore configuration edit nahi hua.

Is repair ke liye **naye Firestore rules, document, Cloud Function, polling ya paid removal API required nahi**. Naye Firebase reads/writes add nahi hain. Existing CDN bandwidth/storage billing apne current setup ke according rahegi.

## Validation aur limits

- Production build pass. Automated suite: **237 tests, 213 pass, 24 original failing labels unchanged**. New failures: zero. Routing/cache/worker/crop/native protocol checks included hain.
- Browser regression checks: Done double tap; same mounted canvas through processing; Cancel/new-photo stale-result rejection; cancelled crop encoding; React StrictMode two-photo queue. Page runtime errors: zero in these checks.
- Real shipped MODNet + matching WASM se production-built uploader/crop flow ne transparent PNG banayi. Fresh browser process/context aur a native-filesystem API adapter ke saath app restart simulate kiya: completed model/runtime par second launch mein zero new native downloads. This is not a physical Expo-device benchmark.
- Native protocol tests use real temporary disk files behind an Expo filesystem API adapter: restart persistence, one download, invalid partial/HTML rejection, chunk/range validation, browser-cache migration, orphaned imports and saved resume checkpoints.
- Physical FP16-capable GPU available nahi tha. Successful actual BiRefNet FP16 inference/phone speed ko tested claim nahi kiya gaya; supported-primary/failure routing controlled fixtures se checked hai.
- Full suite mein original ZIP ke same 24 pre-existing failing test labels hain. Unrelated tests/features is repair mein rewrite nahi kiye gaye.

Local optional diagnostic: `window.__MLMLIVE_BG_METRICS__` mein last worker preparation/processing timings milte hain. Yeh sirf memory mein hai; koi telemetry/database/network write nahi.

## Device par release check

Install/update ke baad model warm hone dein, ek photo ka full two-crop flow aur second photo check karein. Then app force-close/reopen karke same flow check karein. Download/cache test mein app data clear na karein. Cancel ke turant baad doosra photo, aur multi-photo queue bhi check karein. Any device-specific issue ke liye WebView version, device/OS aur local metrics useful rahenge.

QA-only harnesses, installed node_modules, generated dist aur a separate 98 MB model copy ZIP mein included nahi hain. Live deployment is session se nahi kiya gaya.
