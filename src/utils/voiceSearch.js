export const VOICE_SEARCH_FALLBACK =
  "Use the microphone on your device keyboard to search by voice.";

const ERROR_MESSAGES = {
  "not-allowed": "Allow microphone access to use voice search, or use your keyboard microphone.",
  "service-not-allowed": VOICE_SEARCH_FALLBACK,
  "audio-capture": "No microphone was found. You can still type your search.",
  "no-speech": "No speech was detected. Tap the microphone and try again.",
  network: "Voice search could not connect. Check your connection and try again.",
  "language-not-supported": "Voice search does not support this language on your device. Use your keyboard microphone.",
};

export function getVoiceSearchLanguage(language) {
  return ({ en: "en-IN", hi: "hi-IN", mr: "mr-IN", gu: "gu-IN" })[language] || "en-IN";
}

export function startVoiceSearch({
  windowObject = globalThis.window,
  language = "en-IN",
  onTranscript = () => {},
  onListeningChange = () => {},
  onError = () => {},
} = {}) {
  const Recognition = windowObject?.SpeechRecognition || windowObject?.webkitSpeechRecognition;
  if (typeof Recognition !== "function") return { supported: false, isActive: false, cancel() {} };

  let recognition;
  let active = true;
  const finish = () => {
    if (!active) return;
    active = false;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onnomatch = null;
    }
    onListeningChange(false);
  };
  const abort = () => {
    try { recognition?.abort(); } catch { /* Already stopped. */ }
  };
  const fail = (code) => {
    if (!active) return;
    finish();
    abort();
    if (code !== "aborted") {
      onError({ code, message: ERROR_MESSAGES[code] || "Voice search is unavailable. Try your keyboard microphone." });
    }
  };

  try {
    recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      if (!active) return;
      const transcript = Array.from(event.results || [])
        .filter((result) => result.isFinal !== false)
        .map((result) => result[0]?.transcript || "")
        .join(" ").trim().slice(0, 50);
      if (!transcript) return;
      finish();
      abort();
      onTranscript(transcript);
    };
    recognition.onerror = (event) => fail(event.error || "unknown");
    recognition.onnomatch = () => fail("no-speech");
    recognition.onend = () => fail("no-speech");
    onListeningChange(true);
    recognition.start();
  } catch (error) {
    fail(error?.name === "NotAllowedError" ? "not-allowed" : "service-not-allowed");
  }

  return {
    supported: true,
    get isActive() { return active; },
    cancel() { finish(); abort(); },
  };
}
