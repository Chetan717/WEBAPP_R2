import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Mic, MicOff } from "lucide-react";
import { toast } from "@heroui/react";
import { useAppLanguage } from "../i18n/AppLanguageContext";
import { getVoiceSearchLanguage, startVoiceSearch, VOICE_SEARCH_FALLBACK } from "../utils/voiceSearch";

export default function VoiceSearchButton({ onTranscript, onFallback, onStart, cancelSignal, className = "" }) {
  const { pathname } = useLocation();
  const { language } = useAppLanguage();
  const [isListening, setIsListening] = useState(false);
  const controllerRef = useRef(null);
  const callbacksRef = useRef({ onTranscript, onFallback, onStart });
  callbacksRef.current = { onTranscript, onFallback, onStart };

  const cancel = useCallback(() => {
    controllerRef.current?.cancel();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    cancel();
    const onVisibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancel();
    };
  }, [pathname, cancelSignal, cancel]);

  const handleClick = () => {
    if (controllerRef.current?.isActive) { cancel(); return; }
    callbacksRef.current.onStart?.();
    const controller = startVoiceSearch({
      language: getVoiceSearchLanguage(language),
      onListeningChange: setIsListening,
      onTranscript: (text) => {
        controllerRef.current = null;
        callbacksRef.current.onTranscript?.(text);
      },
      onError: ({ code, message }) => {
        controllerRef.current = null;
        toast.warning(message);
        if (["service-not-allowed", "language-not-supported", "not-allowed", "audio-capture"].includes(code)) callbacksRef.current.onFallback?.();
      },
    });
    controllerRef.current = controller.isActive ? controller : null;
    if (!controller.supported) {
      toast.warning(VOICE_SEARCH_FALLBACK);
      callbacksRef.current.onFallback?.();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={isListening ? "Stop voice search" : "Search by voice"}
      aria-pressed={isListening}
      title={isListening ? "Listening… Tap to stop" : "Search by voice"}
      className={`flex shrink-0 items-center justify-center rounded-full transition-colors ${
        isListening ? "bg-red-100 text-red-600 motion-safe:animate-pulse dark:bg-red-500/20" : "text-[#2877e9] hover:bg-[#e5efff] dark:text-[#8bb8ff] dark:hover:bg-white/10"
      } ${className}`}
    >
      {isListening ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
      <span className="sr-only" role="status">{isListening ? "Listening for your search" : ""}</span>
    </button>
  );
}
