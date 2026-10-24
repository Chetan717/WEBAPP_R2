# App popups + New Added badges only

Base: your uploaded `MLMLIVE_WEBAPP_R2_SCALABLE_PREVIEW(6).zip`.

Only the popup/badge feature was added. Remove BG, crop/photo-upload flow, model/runtime assets, Expo code, environment values, authentication, template selection handlers and existing CDN request/cache behavior were not changed. `POPUP_CHANGE_MANIFEST.json` records the five modified existing files and matching hashes for 43 protected BG/form/runtime/upload files.

## Included behavior

- General/offer popup: admin image, title/message/button, and the selected internal app page.
- Template popup: the selected template's **first GraphicsLink**, Create Now, and the existing Home selection handler. MainType, type, subtype, template ID/seed, designation/profile prompts and editor/form routing follow the current app flow.
- Close, Maybe later, backdrop, Escape and CTA acknowledge that campaign ID once for the verified user on this device. Home revisit, reload and logout/login retain it. Editing the same campaign ID does not resend it; use the existing Admin Copy as New behavior to resend.
- A different user has a separate seen list. Reinstall/clearing browser data or another device can show it again. No per-user Firestore history was added.
- Home subtype tiles, Home category headings and All Templates subtype tiles show **New Added** for seven days from published `subtypeAddedAt`/`subtypeDates` metadata. Serial number and template edit date do not make an old subtype new. Missing legacy dates are not guessed.
- Blue app theme, dark mode, mobile sizing and keyboard dismissal are included.

## CDN and Admin compatibility

The app consumes your existing Admin publisher's public feed:

`{VITE_TEMPLATE_CDN_BASE_URL}/catalog/v1/popups.json`

The current production CDN environment value is reused. No new popup document/collection environment variable is needed. Admin/backend code was not edited or included in this update. Use your existing **Save & Publish / Publish Changes** action; changing a Firestore source document by itself does not update an already-published CDN file.

Feed requests share a pending request and use a five-minute memory/device cache. Missing feeds and failures also have a retry cache; an outage does not trigger requests on every render. Old cached feed can be used during an outage. There is no background polling or popup Firestore fallback. Existing upstream CDN cache headers also affect publication delay.

Existing template catalog publishing supplies the badge dates. This app change preserves those fields when reading the existing catalogs; it does not fetch Firestore just for badges. Old session cache may take its existing five-minute TTL/normal refresh to acquire the new fields.

## Deploy

```bash
npm ci --legacy-peer-deps
npm run build
```

Deploy this full web source with your existing hosting workflow. No new Cloud Function, Firestore rule update, native/Expo patch or model deployment is required for this app-only change. Existing Admin permissions/publisher configuration remain as already set up.

## Verification

- Production build passes.
- All 12 added popup/cache/model tests pass. Full suite: 184 tests, 157 pass, the same 27 pre-existing failures as the original ZIP. No new failing labels.
- Actual React popup components and router were checked with a virtual DOM and controlled auth/company/CDN fixtures: first GraphicsLink, selected-template callback, internal redirect, Close/CTA/Escape acknowledgment, remount persistence, separate users, seven-day expiry and one shared feed request.
- Five existing files changed: Home list, All Templates tiles, and three template metadata adapters. Network/database query expressions and the existing Home navigation/selection callbacks match the original.
- All 43 protected Remove BG/form/runtime/upload files match the uploaded ZIP byte for byte. The rest of the original files, including CDN delivery helpers and environment values, also match except the five explicitly listed feature files.
- This popup update was not deployed to the live app or Admin. No production popup campaigns/settings were saved during its tests. QA-only files, dependencies and generated build output are excluded from this ZIP.
