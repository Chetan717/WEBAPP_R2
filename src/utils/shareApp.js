export const MLMLIVE_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.mlmbooster.mlmbooster&hl=en_IN";

const SHARE_TITLE = "MLMLIVE";
const SHARE_TEXT = "Download MLMLIVE on Play Store.";

export async function shareMlmliveApp({
  windowObject = globalThis.window,
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
} = {}) {
  const message = `${SHARE_TEXT}\n${MLMLIVE_PLAY_STORE_URL}`;
  if (typeof windowObject?.ReactNativeWebView?.postMessage === "function") {
    try {
      // Keep the same Expo/WebView contract already used by ReferCard.
      windowObject.ReactNativeWebView.postMessage(JSON.stringify({
        type: "SHARE_SOMETHING", title: SHARE_TITLE,
        message, text: message, url: MLMLIVE_PLAY_STORE_URL,
      }));
      return "native";
    } catch { /* Try the browser share sheet if the bridge is unavailable. */ }
  }

  if (typeof navigatorObject?.share === "function") {
    try {
      await navigatorObject.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: MLMLIVE_PLAY_STORE_URL });
      return "web";
    } catch (error) {
      // Closing the device share sheet must not trigger another action.
      if (error?.name === "AbortError") return "cancelled";
    }
  }

  try {
    if (typeof navigatorObject?.clipboard?.writeText === "function") {
      await navigatorObject.clipboard.writeText(MLMLIVE_PLAY_STORE_URL);
      return "copied";
    }
  } catch { /* Fall back to a selectable link if clipboard access is denied. */ }

  if (documentObject?.body && typeof documentObject.execCommand === "function") {
    const input = documentObject.createElement("textarea");
    input.value = MLMLIVE_PLAY_STORE_URL;
    input.style.cssText = "position:fixed;left:-9999px;top:0";
    documentObject.body.appendChild(input);
    try {
      input.select();
      if (documentObject.execCommand("copy")) return "copied";
    } catch { /* Show the link for manual copying. */ }
    finally { input.remove(); }
  }
  return "manual";
}
