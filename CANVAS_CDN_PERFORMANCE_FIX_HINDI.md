# MLM LIVE — Template Canvas & Scroll Reliability Patch

**Source:** user-supplied `MLMLIVE_WEBAPP_R2_SCALABLE_PREVIEW(2).zip`.

## Changes
- Main canvas images: anonymous (CORS-safe) CDN loading; bounded wait and retry; when a *public* CDN template image fails, a restricted same-origin Vercel API fallback; clear Retry button rather than infinite spinner. Failures remain visible rather than silently showing empty canvas.
- New `/api/template-image` endpoint restricts origin strictly to `cdn.mlmposter.com`, raster files under `/templates/`, no redirects/credentials and size/content-type limits. It must be deployed alongside the WebApp for fallback to operate.
- Editor template grid mounts near-screen thumbnails only (virtual scrolling), reducing work when there are hundreds of designs.
- Preload first likely canvas backgrounds as anonymous; avoid cross-origin preloading in an opaque browser cache.
- Home prefetches the editor code after an idle delay **only** on a usable connection, saving download time on first template tap.
- Existing Auth, Admin, Firestore, R2 URLs, Download, RemoveBG, Navratri crop behavior unchanged.

## Deployment
1. **Backup the current Vercel deployment / Git commit** first. Use full ZIP as a new deployment OR selectively copy paths from patch ZIP; don't replace live Firebase Functions.
2. Vercel project `app.mlmlive.in`: build using the existing Vite build settings and `VITE_*` environment variables. `api/template-image.js` must sit at project root (not inside `src/`).
3. Test a few affected template CDN URLs and both Editor preview and final downloaded PNG on Chrome and mobile (Canvas CORS problems may occur only in export).
4. Clear stale app cache/reload one time on test device; do not clear user application profile data.
5. If users still see failures or `api/template-image` returns 413/502, verify CDN CORS at Cloudflare. A browser tab showing an image is **not** proof that Konva can draw it into an exportable Canvas.

## Cloudflare R2 CDN public template CORS — important
Open Cloudflare dashboard for `mlmposter.com` → Rules → Transform Rules → **Modify Response Header** (or configure R2 bucket CORS). For public raster assets only, match hostname `cdn.mlmposter.com` AND path starts `/templates/`. Set `Access-Control-Allow-Origin: *`. The value `*` is appropriate only for intentionally public image assets, not private user profile media. Allow GET/HEAD for R2 bucket CORS if configuring there. Do **not** add this to private profiles. CDN cache remains intact; verify response with Origin `https://app.mlmlive.in`.

Example browser DevTools console test (paste a failed image URL):
```
fetch('https://cdn.mlmposter.com/templates/REPLACE_WITH_REAL_IMAGE.webp', {mode:'cors'})
  .then(r => console.log(r.status, r.headers.get('content-type')))
  .catch(e => console.error('Canvas CORS/network error',e))
```
A 403/404 means the file/path needs investigation; 200 without successful CORS indicates Cloudflare response headers likely need adjustment. A response >4MB may not fit the Vercel emergency proxy limit, so direct CDN CORS is still the proper fix.

## Test honesty
Local static/syntax and focused unit tests can verify code paths. They are **not** a substitute for a logged-in, live mobile/browser end-to-end test; no live test was performed with the test credentials. Never insert a test PIN/phone into repository or production source.
