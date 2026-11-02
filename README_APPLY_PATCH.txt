MLMLIVE Production UI Patch

Ye patch aapke diye hue MLMLIVE_WEBAPP_R2_SCALABLE_PREVIEW(1).zip ke source par bana hai.

Ismein aapke chaar requested changes hain (pichhle teen + naya profile feather):
1. Profile mein Delete my account ke upar Delete My Company Profile option. Dono ka difference, permanent-delete warning aur registered-mobile confirmation. Existing profile-only deletion function reuse hota hai; account/login delete ya logout nahi hota. Success par existing Select Company flow khulta hai.
2. Home ki regular category rows mein 1 tile = full available width, Capping jaisa wide banner; 2 tiles = barabar width mein poori row; 3+ = existing size aur horizontal scrolling. Capping ki existing one-tile selection rule, Festival calendar, carousel, Everyday Moments grid aur tile click/View All flow same hain.
3. Canvas ke Top Upline photo frames mein upper-centre square crop: waist-up photo ke upper half se head/face prominent dikhega. Normal aur Guru Purnima layouts dono mein same crop; frame size/position same. Download bhi same canvas use karta hai. Original uploaded photo, URL aur admin upload unchanged. Ye fixed crop hai, automatic face detection nahi; face upper-centre mein hone wali photo ke liye hai.

4. Sirf Motivational, ThankYou_Banner_B, ThankYou_Birthday_Anniversary aur Anniversary_Birthday ki profile photo ke bottom edge par halka white smoke aur transparent feather. Photo ka upper 80% untouched; transparent surroundings mein white rectangle nahi banta. Same rendered photo canvas preview aur image/video export mein use hoti hai. Original upload, Top Upline photos, achiever photos, photo size/position, flip/tap controls aur dusre banner types unchanged. Koi naya image fetch ya Firestore read nahi.

Apply kaise karein:
1. ZIP extract karein. Iske src folder ki files ko apne existing project ke matching src paths par merge/replace karein. Poora existing src folder delete na karein. Teeno naye helper files bhi copy karna zaroori hai.
2. tests folder optional verification ke liye hai. Existing tests remove na karein.
3. Apne production project ki existing package.json ke saath npm run build chalayein, phir apne normal Vercel flow se redeploy karein. Is patch ke liye R2 par koi nayi file upload nahi chahiye.

changes.patch mein exact unified diff bhi diya hai. Agar code ZIP ke baad change hua hai, isi diff ke hunks merge karein. Original ZIP ko replace nahi kiya gaya hai. Agar pichhla UI patch already lagaya hai, updated src files merge/replace kar dein; changes.patch original source ZIP ke against poora combined diff hai.

Validation:
- Vite production compilation successful.
- Supplied ZIP mein root package.json aur source index.html nahi the. Local compile ke liye package-lock se temporary manifest aur minimal source entry use ki gayi; ye files patch mein include nahi hain. Apne actual project ka build bhi chalana hai.
- 7 additional pixel/scope/fallback/PNG-export checks passed: lower edge white mist and transparency, upper photo preserved, transparent surroundings preserved, exact type restriction, source image unchanged, fallback returns original. Synthetic light/dark background visual fixture bhi inspect kiya.
- 30 relevant checks passed: new deletion confirmation, existing profile/cache cleanup/navigation, Home WhatsApp/support preservation, Top Upline crop bounds and storage-sync.
- Original ZIP ke saath byte comparison: sirf 5 existing source files changed, plus 3 new helpers. Remove BG code/models, original profile form, upload code, auth/login, WhatsApp routing, backend/services/API aur R2/Vercel config byte-identical hain. Koi naya fetch/Firestore-read operation add nahi kiya.
- Existing latestUpdateHomeFlow ke 2 assertions aur marketingSupportRouting ke 3 assertions original ZIP par bhi fail hote hain. Same failures patched source mein hain; un unrelated files/tests ko change nahi kiya.
- Live account/profile deletion ya live production deploy execute nahi kiya. Live app browser visual QA nahi hua; feather ka synthetic fixture visual/pixel QA hua.

Targeted verification command:
node --test tests/companyProfileDeleteAction.test.mjs tests/companyProfileFlow.test.mjs tests/bannerSettingsNavigation.test.mjs tests/homeFloatingWhatsApp.test.mjs tests/supportContact.test.mjs tests/topUplineHeadCrop.test.mjs tests/topuplineStorageSync.test.mjs
