MLM LIVE - Top Upline + Footer frame Canvas blank fix
===================================================

Is ZIP mein sirf 3 updated code files hain. BAT ki zaroorat nahi.

1. Apne current WebApp source ki backup copy rakhein.
2. ZIP extract karein.
3. In teen files ko SAME PATH par copy -> replace karein:
   - src/pages/Editor/GenralEditPage.jsx
   - src/hooks/useTemplateCanvasImage.js
   - api/template-image.js
4. Vercel Preview deploy karein (api/template-image.js Vercel serverless route hai).
5. Editor mein Top Upline 1,2,3,4 aur Footer 1,2 switch karein, canvas + final download dono test karein.

Fix: selected TopUpline/Footer Image ko use-image se resilient canvas loader
par shift kiya hai. Anonymous CORS image -> retry -> CORS blob ->
strictly whitelisted same-origin API fallback sirf public CDN
/templates/, /topuplineframe/, /footers/ raster images ke liye.

JSON content aur selection flow unchanged. Firestore reads unchanged.
Actual CDN files/headers ko is offline environment se live verify nahi kiya ja saka.
Localhost Vite par serverless /api fallback directly available nahi hota:
Vercel Preview par end-to-end test karein. Agar localhost Canvas blank hai,
inspect HTTPS CDN Access-Control-Allow-Origin header for the exact image URL.

If blank remains, use PowerShell:
  curl.exe -sS -L -D - -o NUL -H "Origin: https://app.mlmlive.in" "https://cdn.mlmposter.com/topuplineframe/2ndtp.webp"
Expected HTTP 200, Content-Type: image/webp, Access-Control-Allow-Origin: *.
If Cloudflare returns 404 or not an image, update that image URL in local JSON.
Don't paste credentials or tokens in logs.
