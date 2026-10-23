# Background removal — BiRefNet first

Ye **poora app source ZIP** previous popup/CDN update par based hai. Popup campaigns, internal page redirects, template Create Now routing, seven-day New Added badges aur baaki existing app code included hain.

## Agreed photo flow

**Upload → first Crop / Done → Remove Background → final Crop / Done → form mein photo apply.**

Primary model **BiRefNet Lite 512 FP16** hai. Capable mobile aur desktop dono par first photo isi model se process hoti hai, even agar model abhi download/preload ho raha ho. Sirf ready MODNet milne ke kaaran first photo downgrade nahi hoti.

- WebGPU/FP16 unsupported, adapter unavailable, ya existing low-memory/device-safety check fail ho: **MODNet fallback**.
- BiRefNet download/session/inference fail ho, ya result blank / opaque ho: same action mein **MODNet fallback**. Photo dobara select karna zaroori nahi.
- Transient model/session startup error par existing one clean retry hai. Normal retry cached model reuse karti hai; forced new download nahi.
- User Cancel kare: processing cancel hoti hai; fallback apne aap start nahi hota.
- Dono models fail hon: existing error behavior retain hai; original background photo ko removed-background success kehkar accept nahi kiya jaata.
- Achievement Image aur Achievement Feature Photos ka existing `skipBackgroundRemoval` behavior preserve hai. Normal profile / portrait photo flow ke liye shared router update hua hai.

Original crop/editor components aur form callbacks preserve hain. Final transparent crop lossless PNG mein apply hoti hai. BiRefNet input/output tensors processing ke baad dispose hote hain. Loader ab engine/download ka reported progress dikhata hai; timer ke basis par 99% nahi dikhata.

## 404 URL correction

Correct production values:

```env
VITE_BIREFNET_MODEL_URL=https://models.mlmposter.com/birefnet/model_fp16.onnx
VITE_MODNET_ASSET_BASE_URL=https://models.mlmposter.com/modnet/
```

Purane URL mein hostname ke baad extra `/models/` tha. Correct BiRefNet aur MODNet model endpoints par HTTP Range verification mein **206**, expected binary signatures aur CORS `*` mile. BiRefNet model length **98,484,532 bytes**; MODNet **25,888,640 bytes** thi.

Checked-in `.env.production` aur BiRefNet default URL fix hain. Agar Vercel mein abhi bhi exactly wahi known old `models.mlmposter.com/models/birefnet/...` ya `models.mlmposter.com/models/modnet/...` value reh gayi ho, runtime URL builder us known path ko repair karta hai. Other custom model hosts / object paths ko rewrite nahi karta.

`?v=birefnet-lite-512-fp16-2026-10-09-v1` jaisi query model cache version hai. Ye supported hai; har photo par timestamp/random query add nahi hoti.

## Vercel build / deploy

1. Vercel → existing app project → Settings → Environment Variables mein above values set karein. Production ke saath jis Preview environment ko test karte hain uski value bhi correct rakhein.
2. Is ZIP ka updated source deploy karein. Purana deployed JavaScript apne aap change nahi hota.
3. Local production build:

```bash
npm ci --legacy-peer-deps
npm run build
```

4. Apna normal Vercel/hosting deployment process use karein. Naye build ko open karke Profile / Rank / Meeting photo par two-crop flow verify karein.

Background-removal fix ke liye Cloud Functions deploy, Firestore rule update, paid remove-bg API ya new backend service required nahi. Previous popup feature ki existing-handler deployment instructions uske separate setup note mein hain.

## Cache aur cost

- Photo inference device par hoti hai. User photo remove-background service ko upload nahi hoti.
- BiRefNet model pehli baar approx **98.5 MB** download hota hai; slow network par ismein time lag sakta hai. Browser Cache Storage / HTTP cache aur shared session promise reuse hote hain. Browser/WebView storage clear/evict hone par download phir ho sakta hai.
- Unsupported FP16 devices par BiRefNet ka bada download skip hota hai. MODNet ka existing remote + bundled same-origin fallback retain hai; WASM/MJS same-origin rehte hain.
- Successful BiRefNet action ke liye MODNet model/runtime preload nahi hote. Multiple photos serialize hoti hain, taaki GPU inference overlap na kare.
- Is update se Firestore reads/writes, Cloud Function calls ya polling add nahi hai. Normal CDN/model delivery bandwidth/storage ki existing billing conditions apply karti hain.

## Verification

- Production build pass.
- **45 targeted tests pass:** supported-mobile primary routing, pending preload, same-action fallback, blank/opaque masks, transient retry, Cancel, serialized photos, corrected/legacy/custom URLs, FP16 capability checks, existing image quality checks, CDN defaults aur popup cache tests.
- Full app suite: **201 tests, 177 pass, 24 pre-existing unrelated failures**. New failure labels nahi hain. Previous app suite ke 27 failing cases mein se three outdated routing-policy assertions agreed behavior ke hisaab se update hue. Baaki unrelated failures ko modify nahi kiya gaya.
- Browser QA actual crop/uploader components aur real MODNet inference ke saath: unsupported WebGPU, WebGPU without FP16, remote-model failure → bundled fallback, final transparent PNG apply. Controlled BiRefNet output fixture se primary wait/progress aur full two-crop route separately verify hui.
- Routing tests supported-primary and primary-failure cases mein controlled engine doubles use karti hain. Is environment ka software WebGPU adapter shader-f16 support nahi deta; real FP16 BiRefNet GPU inference ko physical supported-device test ke barabar claim nahi kiya gaya.
- Popup update source preserve hai. Full source ZIP mein local QA harness, screenshots, validation-only 98 MB model download, generated dist aur installed node_modules include nahi hain.

Live app deployment is ZIP se perform nahi hua. Updated source ko apne production frontend par deploy karein.
