# MLMLIVE — Diwali fireworks update

Home screen khulte hi rockets upar jaakar colourful fireworks banate hain.
Welcome 5.4 seconds mein khatam hota hai aur ek app/page load mein ek baar
dikhta hai. Home par wapas aane ya company badalne par baar-baar nahi chalta.

Template image, video aur AI-retouch download ke existing success trigger par
purane paper confetti ki jagah rocket celebration chalta hai. Download effect
4.8 seconds ka hai; agla successful download ise naya restart karta hai.

Home par golden lights, diye aur “शुभ दीपावली” greeting bhi hai. Greeting ka
button existing Festival Calendar par le jaata hai.

## Apply / deploy

Yeh poora updated project hai, sirf patch nahi. `dist/` mein naya production
build bhi diya hai. Apne existing project/deployment mein updated source use
karke normal process se deploy karein:

```sh
npm ci
npm run build
```

Koi naya npm dependency install karne ki zarurat nahi hai.

## Diwali Home control

Default `auto`: 1 November se 15 November 2026 tak, India time. 16 November
ko Home ka Diwali theme aur welcome effect khud band ho jaata hai. Download
ka rocket celebration uske baad bhi kaam karta hai.

Deployment environment mein optional setting:

| Setting | Result |
| --- | --- |
| `VITE_DIWALI_MODE=auto` | Upar di hui date range; default |
| `VITE_DIWALI_MODE=on` | Diwali Home ko force on karein |
| `VITE_DIWALI_MODE=off` | Diwali Home ko band karein |

Environment setting badalne ke baad build/redeploy karein. Agle saal ke liye
dates `src/utils/diwaliSeason.js` mein update karni hongi.

## Behaviour and verification

- Effects touch/click ko block nahi karte; background hone ya Home chhodne
  par welcome ruk jaata hai. Timers, resize listeners aur drawing frames
  effect ke baad saaf hote hain.
- Reduced motion mein sirf short status message dikhta hai, rockets nahi.
- Graphics local canvas/SVG se bante hain; koi extra Firebase read, animation
  download, sound ya animation dependency add nahi hua hai.
- Export/download handlers aur saved template ke pixels badle nahi gaye hain.
- Production build aur R2-only deployment guard pass hain.
- Season boundaries, engine cleanup, orientation, scroll/navigation aur
  existing export/R2 regression checks pass hain.
- Source project ke 4 purane UI assertions aur 85 TypeScript errors original
  upload mein bhi hain. Is update se koi naya TypeScript error nahi aaya.

Browser checks use actual Home and celebration components with local fixture
data, without signing into Firebase. Physical Android/iOS gallery saving is
still handled by the existing WebView bridge and should be checked after deploy.
