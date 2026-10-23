# App Popups — CDN setup

Admin mein **App Popups** sidebar tab, URL `/popups`, Master Admin ke liye add hai. Existing violet Admin theme aur blue app theme, light/dark mode aur mobile preview use hote hain. Existing login aur Expense Manager preserve hain.

## Firestore ka ek source document

Firebase Console mein collection **popup**, document **popup** banayein: path `popup/popup`. Initial field `schemaVersion` ko number **1** rakhein. First save `campaigns` map, `revision`, `publishedRevision` aur `updatedAt` isi document mein set karti hai. Har campaign ka alag document ya subcollection nahi banta.

`popup.firestore.rules.snippet` ko apni existing published rules ke `match /databases/{database}/documents { ... }` ke andar add karein. Ye snippet existing `panel: admin`, `role: Master Admin`, `actorType: owner` claims use karta hai. App users ko Firestore popup read/write permission dene ki zaroorat nahi. Full existing rules file ZIP mein nahi thi, isliye use replace ya `firebase.json` mein configure nahi kiya gaya.

Existing broad wildcard allows ko check karein: Firestore mein kisi bhi matching allow ka true hona access deta hai. Is restricted block se pehle ka broad allow cancel nahi hota.

`campaigns` map ko single-field indexing se exempt rakhein: Firebase Console → Firestore → Indexes → Single field → Add exemption → collection `popup`, field `campaigns`, indexes disabled. Included `firestore.indexes.json` mein ye entry add hai aur previous entries preserve hain. Puri index configuration deploy karne se pehle current production indexes se reconcile karein.

## Existing functions ka update

Koi naya Firebase Cloud Function export, popup trigger, scheduler ya callable add nahi hai. Existing R2 callable mein ek operation aur existing template catalog publisher mein subtype dates add hain. Isliye updated existing handlers deploy karna zaroori hai:

```bash
firebase deploy --only functions:panelCreateR2AdminMediaUpload,functions:publishTemplateCatalogOnWrite,functions:panelRebuildTemplateCatalog
```

Ye command Admin project folder se, apne existing Firebase project selection ke saath chalayein. Existing R2 secrets/config aur public CDN/CORS retain karein. Koi naya secret/env required nahi. ZIP se live deployment nahi kiya gaya.

Admin aur app dono mein apna normal frontend build/deploy process use karein:

```bash
npm ci --legacy-peer-deps
npm run build
```

App ka existing `VITE_TEMPLATE_CDN_BASE_URL` reuse hota hai; supplied production config `https://cdn.mlmposter.com` use karti hai.

## Popup banana aur publish karna

1. **General / Offer:** image upload ya HTTPS URL, title, message, button label aur app page choose karein. Home, Categories, Everyday Moments, Subscription, Profile, MLM Profile, Select Company, Search, Reporting aur Ask AI destinations available hain.
2. **New Template:** General/MLM main type, template type, MLM company, subtype aur actual template choose karein. **Load Templates from CDN** existing public catalog use karta hai. Company names sirf explicit button par existing Firestore collection se load hote hain; known company ID direct enter kar sakte hain.
3. Preview selected subtype/template ka **first GraphicsLink** use karta hai, Showcase image ya later graphic nahi. Create Now existing Home selection handler ko call karta hai: same selected template, form/editor route, editor seed, designation picker aur profile creation prompt preserve hain. MLM popup sirf matching selected company ko dikhta hai.
4. **Save Draft** Firestore source save karta hai. **Save & Publish** save ke baad existing handler se `catalog/v1/popups.json` publish karta hai. **Publish Changes** saved source dobara publish karta hai. Firestore Console mein edit karne se apne aap CDN publish nahi hota.
5. Failed publish mein saved draft retain hota hai aur error dikhta hai; successful live status report nahi hota. Publish retry karein. Same campaign edit karne se uski identity nahi badalti. Pehle dismiss kar chuke users ko updated campaign dobara bhejna ho to **Copy as New** use karein.
6. Optional start/end aur priority available hain. Higher priority pehle dikhti hai. Ended/inactive campaigns public feed se omit hote hain; future start app clock par check hota hai. App Home par eligibility check hoti hai, background polling nahi.

## Cache aur read/cost behavior

- App popup delivery mein **zero popup Firestore reads/writes**, zero callable invocations aur zero realtime listeners hain. Feed/image existing CDN se aate hain. Existing app profile/template flows apna pehle wala behavior retain karte hain.
- Feed memory + persistent device cache **5 minutes** reuse hoti hai. Simultaneous Home loads ek pending request share karte hain. Reload bhi fresh saved feed reuse karta hai. Missing feed/404 aur errors par bhi retry cache hai, taaki har render par request na ho. Network error par previous public feed use hoti hai; Firestore fallback nahi.
- CDN response cache browser 60 seconds / shared edge 300 seconds hai. Publish ke baad next Home visits par naya feed aam taur par **5–10 minutes** mein milta hai; upstream custom cache rules ko bhi ye headers honor karne chahiye. Khule idle Home par background requests nahi hoti.
- Admin popup settings memory cache 5 minutes, UID scoped hai. Refresh explicit fresh read karta hai. Save direct Firestore transaction hai; latest source read + write karti hai, contention par retry ho sakti hai.
- Template selection cache 5 minutes CDN se hai. Optional company-name lookup bhi 5 minutes cache hota hai. Popup publish sirf selected active/unexpired template IDs ke exact documents read karta hai, whole template collection scan nahi.
- Publish source read, bounded selected-template reads, revision update aur existing lock helper ke temporary `_systemLocks/popupCatalogR2` reads/writes karta hai. Ye temporary coordination metadata hai; campaign data sirf `popup/popup` mein hai. Admin media upload existing callable use karta hai. CDN requests/storage aur Admin publish total zero-cost hone ki guarantee nahi hai; per-user popup Firestore traffic avoid hota hai.
- Document limit guard: max **40 campaigns**, approx **600 KiB** source JSON; public feed max **750 KiB**. Old campaigns delete karke space free karein. Delete campaign map entry remove karta hai, source document nahi.

## Ek baar dikhne ka behavior

Close/X, backdrop, Escape, Maybe later ya CTA par popup ID verified UID ke saath **isi device ke localStorage** mein seen mark hoti hai. Same UID/device par logout/login, Home revisit aur reload mein repeat nahi hoti. Doosra UID apni seen list use karta hai. Per-user Firestore history nahi likhi jaati.

Doosre device, reinstall ya browser data clear karne par popup phir dikh sakta hai. Cross-device lifetime-once ke liye server-side user tracking chahiye; is implementation mein read/write cost bachane ke liye device persistence use hai. Browser storage block ho to current runtime ka in-memory seen fallback hai.

## New Added badges — 7 days

Existing template catalog publisher earliest `createdAt` se per subtype `subtypeAddedAt` calculate karta hai. Scope main type + company + template type + subtype hai. Update date/serial se old subtype new nahi ban jaata. Oldest known date incremental CDN updates mein preserve hoti hai; unknown legacy dates ko new label nahi milta.

Home subtype tile, All Templates subtype tile aur Home type heading par chhota **New Added** badge hai. Type heading ka badge poore category ke subtype dates dekhta hai, sirf pehle 30 thumbnails nahi. Badge original subtype birth ke 7 din baad next render par hide hota hai; koi timer request/Firestore read nahi.

Existing publisher update deploy hone ke baad normal new template writes updated metadata CDN mein publish karti hain. Old CDN buckets mein metadata turant backfill karna optional hai: existing Admin Sync CDN / `panelRebuildTemplateCatalog` use karein. Full rebuild existing template collection scan karta hai aur Admin-only one-time reads leta hai; popup setup ke liye ise baar-baar chalana zaroori nahi.

## Verification

- Dono production builds pass.
- Admin suite: **105 tests pass**, including 12 popup/publisher/badge tests. New Admin modules ka ESLint pass.
- App ke **6 naye popup cache/dismissal tests pass**. Full uploaded app suite mein 27 pre-existing failures hain: original ZIP baseline mein bhi wahi 27 failures reproduce hue. Baseline 145 pass / 27 fail; updated suite 151 pass / 27 fail. In unrelated failures ko is feature ke scope mein change nahi kiya gaya.
- Browser QA local fixtures/test adapter ke saath: first GraphicsLink, exact editor/form destinations, designation/profile pickers, internal redirect, persistent once-only acknowledgment, single feed request/cache, Admin save/publish failure recovery, light/dark/mobile preview. Production Firebase data ya real media upload modify nahi hua.
- Source ZIP mein QA harness, screenshots, installed root dependencies aur generated build outputs add nahi hain. Original archived backend dependencies preserve hain. Function export names unchanged hain.
