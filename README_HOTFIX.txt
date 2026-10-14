MLM LIVE - EDITOR CRASH HOTFIX (14 Oct 2026)

Reason: Installed lucide-react does not export HandPointer. The previous
FlipTapHint.jsx imported it and the Editor crashed during module load.

FAST FIX:
1. Extract this ZIP.
2. Copy src/pages/Editor/components/FlipTapHint.jsx from ZIP into your
   existing WebApp, replacing just that ONE file (same relative path).
3. Save the file; Vite should hot-reload localhost:5001/editor.
4. Refresh and test both Profile and Rank image tapping.

No npm install, backend deploy, or package dependency changes are needed.
The hand remains theme-blue via the existing FlipTapHint.css.
It remains outside the Konva Stage and is not exported to banner/video.

IMPORTANT: Do not replace the entire app or revert any CDN/performance changes.
