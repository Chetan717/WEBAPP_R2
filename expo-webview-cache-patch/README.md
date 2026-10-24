# Apply to your existing Expo WebView wrapper

From the extracted **web project** (after npm install/ci):

```bash
node expo-webview-cache-patch/apply-expo-cache.cjs ../YOUR_EXPO_PROJECT
```

Then ship the updated Expo JavaScript using your existing compatible EAS Update setup, or rebuild/release the app. Web deploy alone cannot add the native persistent-storage bridge to an already installed wrapper.

Requires Expo SDK 54+ and existing expo-file-system 19+. No package/SDK upgrades, app IDs, permissions, push handlers or share/download handlers are changed. The script makes a wrapper backup and patches one WebView in comp/WebSheet.tsx, App.tsx or App.js. It preserves existing injected scripts and onMessage handling. Run again safely to copy updated cache modules.

Files:
- NativeModelCache.ts: pinned assets, app Documents storage, resumable download, chunked reads/imports, complete-file validation.
- NativeModelCacheBridge.ts: trusted-origin message handler, capability bootstrap and app background/foreground handling.
- apply-expo-cache.cjs: AST-based minimal wrapper edits.

Main deployment, cache behavior and verification notes: ../BG_REMOVE_BIREFNET_FIRST_SETUP_HINDI.md.

Protocol checks from the web-project root:

```bash
node --test expo-webview-cache-patch/tests/native-model-cache.test.cjs
```

Tests use a filesystem API adapter backed by real temporary disk files. Physical Expo/WebView behavior and supported-device BiRefNet FP16 speed still require device testing.
