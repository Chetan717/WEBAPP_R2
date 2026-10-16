# MLM LIVE WebApp – October 16 Production-Safe Performance Patch

Source baseline: `MLMLIVE_WEBAPP_R2_SCALABLE_PREVIEW(7).zip` uploaded by user.

## Exactly what changed
1. `src/pages/Homepage/Component/ListOfGenaraltemp.jsx`: Home screen Everyday Moments has a responsive 2-column card grid (2 cards per row). It retains existing design previews and click actions.
2. `src/pages/Homepage/Component/AllTemplates.jsx`: Everyday Moments View All subtypes reverted from 2-column layout to the original horizontal scroll list, with 118px cards. The entire New Subtype Announcement popup and state are removed.
3. `src/utils/newSubtypeAnnouncement.js` and its old test removed (no longer referenced).
4. `src/index.css`: Touch action manipulation on buttons and navigation links to avoid synthetic delayed taps on mobile. Does not alter swipe containers or page scroll.
5. `src/App.jsx`: Small core page chunks preloaded one by one during idle after Home is ready, not during initial loading. Skipped on data saver and 2G. Import-only; no route mounting, no new Firestore fetches.
6. `src/pages/mainform/components/ImageEditorCanvas.jsx` and `src/pages/Form/ImageEditorCanvas.jsx`: Removed an extra 180ms timeout after crop encoding, reduced unnecessary progress re-renders, preserved PNG for transparent final crop and 800px resolution.
7. `src/utils/cropCanvasEncoder.js` + `src/utils/cropCanvasEncoder.worker.js`: Image encode in an OffscreenCanvas worker where available, with original `canvas.toBlob` fallback on unsupported/failed worker. Prevents blocking the UI while the final cropped image is encoded; DOES NOT guarantee encode/server delay disappears on every phone.
8. `tests/oct16-performance-smoke.mjs`: 5 local regression checks.

## Deployment
1. Back up the current working WebApp repo and deployment.
2. **Recommended:** upload/replace the complete WebApp source ZIP as a clean folder; do not replace `.env` or actual secret files. Or replace only matching paths using direct patch, and DELETE `src/utils/newSubtypeAnnouncement.js` because it is no longer used.
3. In the project root run:
   ```powershell
   npm ci
   node --test tests/oct16-performance-smoke.mjs
   npm run build
   ```
4. Deploy to Vercel **Preview**, NOT straight to production.
5. Verify on real Android / iPhone with normal & slow network:
   - Homepage Everyday Moments is 2 items per row.
   - Everyday Moments View All still horizontally scrolls.
   - No New Subtype popup appears.
   - Home > template > editor routes load; Login/Signup, Home/All Templates/Company/Profile work.
   - RemoveBG: original crop > AI > final crop > Done; transparent edges remain intact. Try both main form photo and MLM profile photo. Ensure the original image and result are retained if processing fails.
   - Test mobile Back/Refresh and existing editing/download functions.
6. If all pass, promote Preview. Rollback is the last working Vercel deployment or original ZIP.

## Safety boundaries
No changed Firebase Functions, Firestore writes, R2/Storage/delete APIs, Auth rules, payment code, Editor canvas rendering rules, or remove-background ML algorithms. No lowering of PNG transparency quality or crop dimensions. Background worker failure falls back to existing canvas.toBlob.

## Validation performed locally
- 242 JS/JSX/TS/TSX source files syntactically parsed with TypeScript parser (zero parse errors).
- 6 focused Node smoke tests passed.
- ZIP integrity check on delivered outputs.

**Not yet verified:** full Vite production build, because npm dependency installation timed out in this environment; live real-device timing and integrated Firebase journeys are also unverified. Do not treat source parse tests as a replacement for build and preview testing.
