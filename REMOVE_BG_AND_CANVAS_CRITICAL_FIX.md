# Critical RemoveBG + Canvas fix

## Root cause fixed

The previous optimized RemoveBG patch accidentally let `preloadBgModel()` replace the global progress callback with a wrapper that called `emitProgress()`. `emitProgress()` then called that same wrapper again, creating an infinite recursion:

`emitProgress -> activeProgress -> emitProgress -> ...`

This caused `RangeError: Maximum call stack size exceeded` in both BiRefNet and MODNet.

The progress callback is now non-recursive and the fast/quality engine fallback can complete normally.

## Canvas profile image fix

Firebase/R2 profile and top-upline images are now loaded through a resilient canvas-safe loader:

- remote image is fetched as a CORS-approved Blob with cache reload;
- Blob is decoded through an object URL so Konva receives a canvas-safe image;
- if the stored URL is an old Firebase `mlmprofiles/...` URL, the matching R2 URL is automatically tried as a second candidate;
- direct anonymous image loading remains a fallback;
- both General and MLM editor profile/top-upline canvas images use this loader.

This keeps dual-storage transition working while Firestore still contains a mix of Firebase and R2 URLs.

## Main changed files

- `src/pages/mainform/utils/removeBg.js`
- `src/hooks/useResilientCanvasImage.js`
- `src/utils/profileR2Urls.js`
- `src/pages/Editor/GenralEditPage.jsx`
- `src/pages/Editor/MlmEditPage.jsx`
