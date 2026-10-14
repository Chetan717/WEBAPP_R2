MLM LIVE – EDITOR TAP-TO-FLIP HINT PATCH
========================================
Base project: MLMLIVE_WEBAPP_CANVAS_CDN_OPTIMIZED_COMPLETE.zip
Scope: General Editor only (Profile Photo + Rank/Achiever Photo).

WHAT CHANGED
- Tiny theme-blue HandPointer with subtle tap/ripple animation + “Tap to flip” on both photo slots.
- Each hint follows the actual visible Konva image bounds across template variants.
- The indicator is non-interactive (pointer-events:none); the image beneath remains tappable.
- Hides that photo's hint immediately after its first flip. Resets for a new template.
- No indicator in Preview-only mode, while the canvas is loading, or on video-unavailable screens.
- Only an HTML overlay, *outside* the Konva Stage. Not included in any downloaded banner or video.
- Respects reduce-motion device preferences. No new packages, no Functions, Admin or Firestore changes.

HOW TO APPLY (Vercel, beginner-friendly)
1. Save a copy of your CURRENT deployed project / commit to allow rollback.
2. Extract this ZIP. Copy its src/ folder INTO your WebApp project root,
   keeping directory structure. Replace the existing GenralEditPage.jsx when prompted.
   Do not replace package.json, .env, or unrelated source files.
3. In project root run: npm install (if needed), then npm run build.
4. Deploy to a Vercel PREVIEW environment first. Test on mobile:
   a) Open Editor with a template containing both photos.
   b) Verify hand cues appear on both photo areas.
   c) Tap each PHOTO (not the hint) – it flips, and its hint disappears.
   d) Change template – cues reappear only on visible photo slots.
   e) Download image and try video export – no hint, ring or label is in the export.
   f) Check thumbnails scroll, crop and other Editor actions as before.
5. If preview succeeds, promote/deploy to production.

RUN FOCUSED TEST
node --test tests/flipTapHint.test.mjs

ROLLBACK
Restore the previous GenralEditPage.jsx from your backup; remove the new
FlipTapHint.jsx, FlipTapHint.css and flipHintGeometry.js files.

NOTES
- Existing image flip code has been preserved; no background/network logic was changed.
- Not tested with a real browser/device on your live account in this environment.
- Any future updates to Editor should retain the four file changes.
