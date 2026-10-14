# MLM LIVE WebApp — Navratri Direct Editor + Mobile Crop UI Fix

## Base code
`MLMLIVE_WEBAPP_R2_SCALABLE_PREVIEW(1).zip` supplied in conversation (October 2026). All unrelated source, R2/CDN, RemoveBG, user signup, Editor, Admin and Firestore logic are preserved.

## What changed
1. `Navratri_Special` opens the Editor directly, like `Good_Morning`, without showing the SalesExecutiveForm. This is covered for Home, View All, and other routes using the centralized editor-type helper.
2. The Editor classifies Navratri Special like Good Morning, avoiding MLM-form-specific display sections.
3. Both crop canvas components now use a thin, semi-transparent crop border. Four thick white square handles and L-shaped corner highlights were removed visually; their 36px invisible resize hit targets remain.
4. Crop canvas has about 24px left and right breathing room on ordinary phone widths, away from Android system Back edge gestures. Initial crop area also has a little inner breathing room. Crop ratio, Resize/Move, Export, RemoveBG and zoom workflows are unchanged.

## Changed source files
- `src/utils/editorNavigation.js`
- `src/pages/Homepage/Component/ListOfGenaraltemp.jsx`
- `src/pages/Editor/MainEditor.jsx`
- `src/pages/Editor/GenralEditPage.jsx`
- `src/pages/Form/ImageEditorCanvas.jsx`
- `src/pages/mainform/components/ImageEditorCanvas.jsx`

Additional test: `tests/navratriCropMobileFix.test.mjs`

## How to deploy on Vercel
**Recommended for existing running application:** Make a backup of your current Git/Vercel WebApp source, extract `MLMLIVE_NAVRATRI_CROP_PATCH_ONLY.zip` and copy the six changed paths into the *same* app project, preserving folder paths. Commit and deploy the app normally. Do **not** deploy Admin or Firebase Functions for these UI changes.

If you need the whole source instead, extract `MLMLIVE_WEBAPP_NAVRATRI_CROP_FIXED_FULL.zip`, review existing `.env.production` settings and deploy it using your existing Vercel workflow. Never upload private environment secrets to a public repository.

For local verification: `npm ci` then `npm run build` (requires dependencies/network), `node --test tests/navratriCropMobileFix.test.mjs tests/editorFlowReturn.test.mjs`.

## Post-deploy smoke check
- Open Navratri Special from Home and View All: it should go directly to Editor (no MLM form); Back should go to the previous appropriate template page.
- Good Morning is still direct to Editor; Meeting/Bonanza still open their forms.
- Open original Crop and Final Crop screens on mobile: no thick corner squares, resize corners still respond to dragging, and canvas is inside screen edges. Confirm image result after Done.
- Clear stale tab cache/reopen the app if old UI persists.

## Verification performed on supplied source
- Six changed files passed independent TypeScript JSX syntax parsing.
- Seven targeted navigation/crop tests passed.
- Full repository legacy suite had 22 failing tests **already on the source ZIP** (122 pass/22 fail before the patch; 125 pass/22 fail after adding three tests). These pre-existing failures are not considered resolved by this patch.
- No production build or live device tests were performed in this environment.
