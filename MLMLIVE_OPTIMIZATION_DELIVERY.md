# MLM LIVE web app optimization (October 2026)

## What changed (narrow, reversible changes only)

- Home's general 4 MB master catalog is now loaded only when the compact Home CDN catalog fails; deep search continues using the live master.
- Catalog version polling is single-flight per browser tab so simultaneous Home sections share the same request.
- R2 profile uploads to the known legacy profile-bucket hostname return the equivalent custom CDN URL; unknown hosts stay untouched.
- Default CDN hostnames for templates, profile photos, BiRefNet and MODNet point to the customer domains.
- Added focused source regression tests.

## Not changed

- Firestore fallback, existing Firebase images, Admin functions, user auth, signup, pricing, permissions and payment flows.
- Browser-side MODNet runtime WASM files remain same-origin for WebView compatibility; only the .onnx model may be on CDN.
- No old Firebase files have been deleted or rewritten.
- Public hosting of profile files is a security decision. Never make private images accessible through public R2.

## Deployment gates: DO NOT deploy unverified

1. Save rollback build and database backup; use a Vercel Preview deployment first.
2. Verify CDN custom domains serve actual object paths (200 OK) and correct CORS; domain activation alone is not proof.
3. Verify the Admin Function `createR2ProfileUpload` and `deleteR2ProfileObject`: validate that delete accepts `https://profile.mlmposter.com/mlmprofiles/...` and uses the object key, not the public hostname; update function server-side if it currently rejects the custom domain.
4. In Vercel > Project > Settings > Environment Variables (Preview first), set:
   VITE_TEMPLATE_CDN_BASE_URL=https://cdn.mlmposter.com
   VITE_R2_PROFILE_BASE_URL=https://profile.mlmposter.com
   VITE_BIREFNET_MODEL_URL=https://models.mlmposter.com/models/birefnet/model_fp16.onnx
   VITE_MODNET_ASSET_BASE_URL=https://models.mlmposter.com/models/modnet/
   Build/redeploy: Vite injects environment at build time. Do not remove unrelated variables.
5. Cache rules: template image URLs under /templates/ can have 7-30 day edge TTL if immutable; Profile /mlmprofiles/ needs change-on-replacement object keys; Models /models/ long TTL only with versioned names/URLs.
6. DO NOT apply forced 7-day caching to /catalog/v1/version.json. Override broad hostname cache rules with a more specific bypass rule until Admin publishing Cache-Control semantics and Cloudflare behavior have been verified.
7. Preview smoke-test: new and old profiles, remove/replace photo, Editor, categories, search, latest, trending, festival, company switch, RemoveBG on WebGPU and Android/WebView, offline and CDN-failure fallback. Confirm new public URLs before updating Firestore.
8. Only after tests pass, deploy using canary/staged rollout. Monitor Firebase reads + storage egress, R2 Class B operations, latency, error rate and CDN HIT/MISS. Keep rollback deployment.

## Scalability caveat

100,000 registered users is not the same as 100,000 simultaneously active users. This package reduces unnecessary browser catalog downloads but does not establish a validated 100k-user capacity. The Admin source and Firebase Functions, billing metrics, Firestore indexes, load-testing, R2 catalog publisher and migration tooling still require auditing.
