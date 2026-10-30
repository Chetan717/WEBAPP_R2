# MLMLIVE: model aur WASM direct R2 setup

Code ready hai. Is package ko live karne se **pehle R2 par dono WASM files upload karna zaroori hai**. Is conversation se aapke Cloudflare/Vercel account mein upload ya production deployment nahi kiya gaya hai.

## 1. R2 upload pehle karein

Cloudflare Dashboard → R2 → wahi models bucket kholein jisse `models.mlmposter.com` connected hai. Neeche diye object keys bilkul same rakhein. `r2-upload` folder ko object key ka hissa mat banayein.

| Package ki file | R2 object key | Size |
|---|---|---:|
| `r2-upload/modnet/modnet.onnx` | `modnet/modnet.onnx` | 25,888,640 bytes |
| `r2-upload/ort/1.21.0/ort-wasm-simd-threaded.wasm` | `ort/1.21.0/ort-wasm-simd-threaded.wasm` | 12,666,427 bytes |
| `r2-upload/ort/1.21.0/ort-wasm-simd-threaded.jsep.wasm` | `ort/1.21.0/ort-wasm-simd-threaded.jsep.wasm` | 23,914,392 bytes |

MODNet model pehle se same key par hai to usko dobara upload karna zaroori nahi. BiRefNet model ki existing URL `https://models.mlmposter.com/birefnet/model_fp16.onnx` hai; us model ko change nahi kiya gaya.

Object metadata:

- `.wasm` Content-Type: `application/wasm`
- `.onnx` Content-Type: `application/octet-stream`
- Cache-Control: `public, max-age=31536000, immutable`

Version `1.21.0` package ke JavaScript/runtime ke saath match karta hai. Is folder mein kisi doosre ONNX Runtime version ki files upload na karein.

Optional command upload, Node.js aur Cloudflare login wale terminal se:

```bash
npm ci
npx wrangler@4 login
npm run upload:ai-assets -- YOUR_EXISTING_MODELS_BUCKET_NAME
```

`YOUR_EXISTING_MODELS_BUCKET_NAME` ko apne actual bucket name se replace karein. Script upload se pehle files ka SHA-256 aur size check karti hai aur metadata set karti hai. Cloudflare token ko frontend/VITE variable mein kabhi add na karein.

## 2. CORS aur Cloudflare cache

R2 bucket → Settings → CORS policy mein `r2-setup/cors-dashboard.json` ki read rule add/merge karein. Agar existing rules hain to unhe preserve karein. Ye public model/WASM downloads ke liye GET/HEAD allow karti hai.

Agar domain Cloudflare Worker se serve ho raha hai, Worker ke WASM responses mein bhi `Access-Control-Allow-Origin: *` aur upar diye MIME/cache headers return hone chahiye. Vercel par external rewrite/proxy banane ki zaroorat nahi.

Cloudflare Cache Rule: hostname `models.mlmposter.com`, URI path starts with `/ort/1.21.0/`, cache eligibility **Eligible for cache**, Edge TTL **1 year**. Existing model cache rules ko preserve karein. CORS update ke baad purani cached responses zaroorat par Cloudflare se purge karein.

R2 check:

```bash
npm run check:ai-assets
```

Teeno assets ka PASS aane ke baad app redeploy karein. Agar FAIL aaye to us output mein URL access, CORS, size, MIME ya cache metadata ki kami dikhegi.

## 3. App deploy

Updated source files aur `public/ort/1.21.0/` ke small `.mjs` loaders apne existing Vercel repo mein copy/push karein. `public/modnet/` ka old model/WASM folder aur `public/modnet_ort-wasm-simd-threaded.mjs` repo se **delete** karein. Sirf naye files upar copy karke purana folder chhodne par build guard jaan-boojhkar build fail karega.

Existing Firebase, R2 profile aur template environment variables unchanged rakhein. Is package mein aapke Vercel ke account-specific environment values include nahi hain.

Ye teen AI variables set kar sakte hain; code ke defaults bhi yehi hain:

```env
VITE_MODNET_ASSET_BASE_URL=https://models.mlmposter.com/modnet/
VITE_ORT_ASSET_BASE_URL=https://models.mlmposter.com/ort/1.21.0/
VITE_BIREFNET_MODEL_URL=https://models.mlmposter.com/birefnet/model_fp16.onnx
```

Purane `VITE_MODNET_ASSET_BASE_URL` mein full `.../modnet/modnet.onnx` ya `.../modnet/model.onnx` ho to code ab usko bhi sahi URL mein normalize karta hai.

Vercel build command: `npm run build`. Output directory: `dist`. Build guard output directory mein `.onnx`/`.wasm` bachi hone par build rok deta hai. `r2-upload` aur `r2-setup` deployment output mein copy nahi hote.

## Kya badla

- MODNet model ka duplicate-filename URL bug fixed.
- MODNet aur WebGPU/JSEP dono WASM binaries direct R2 fetch hoti hain.
- Small matching JavaScript loaders same-origin rehte hain, taaki Android/WebView ke module restrictions se compatibility rahe. Inka combined size lagbhag 80 KB hai.
- Validated WASM responses versioned browser Cache Storage mein reuse hoti hain. Cache unavailable/evicted ho to bytes dobara R2 se hi aati hain.
- Vercel model/WASM fallback removed. CDN failure par Vercel se heavy file download nahi hoti.
- Purane `/modnet/` URLs ke liye lightweight redirects added; Vercel image/model proxy nahi banaya gaya.
- Editor, crop, model quality, primary/fallback engine selection aur user-photo upload flow is patch mein change nahi kiye gaye.

## Deploy ke baad verify

Chrome DevTools → Network kholein, background removal chalayein, `wasm` aur `onnx` filter karein. Heavy files ke request URLs `models.mlmposter.com` hone chahiye. `app.mlmlive.in` se sirf small `.mjs`/app code load hoga. Same browser mein reload ke baad runtime Cache Storage se reuse hogi, jab tak browser cache clear/evict na kare.

Vercel ka normal HTML/JS/CSS/image traffic ab bhi rahega. Is change ka purpose heavy AI binaries ka Vercel outgoing hatana hai; total site bandwidth zero hone ka claim nahi hai.

References: [ONNX Runtime WASM flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html), [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).
