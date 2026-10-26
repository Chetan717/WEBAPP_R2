import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { X } from "lucide-react";
import { useAuth } from "../Auth/AuthContext";
import { useSelectedCompany } from "../Context/SelectedCompanyContext";
import { TEMPLATE_CDN_BASE_URL } from "../pages/Homepage/Component/Services/templateCdnService";
import {
  createPopupFeedClient,
  createPopupSeenStore,
  eligiblePopups,
  popupPreview,
} from "../services/appPopupService";

const loadFeed = createPopupFeedClient(TEMPLATE_CDN_BASE_URL);
const seenStore = createPopupSeenStore();

function PopupDialog({ popup, onDismiss, onAction }) {
  const dialogRef = useRef(null);
  const preview = popupPreview(popup);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector("button")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onDismiss();
      }
      if (event.key !== "Tab") return;
      const buttons = [...dialog.querySelectorAll("button")];
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    const onNativeBack = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      onDismiss();
    };
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("webviewBackPressed", onNativeBack, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("webviewBackPressed", onNativeBack, true);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [onDismiss]);

  return createPortal(
    <div
      data-app-popup-backdrop
      className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-popup-title"
        aria-describedby={popup.message ? "app-popup-message" : undefined}
        className="relative my-auto max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-[#E4EAF3] bg-white text-[#20283A] shadow-2xl dark:border-[#263146] dark:bg-[#111827] dark:text-[#E4EAF4]"
      >
        <button
          type="button"
          aria-label="Close popup"
          onClick={onDismiss}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex min-h-32 items-center justify-center bg-[#EAF1FB] dark:bg-[#172235]">
          {preview.video ? (
            <video
              src={preview.url}
              muted
              playsInline
              autoPlay
              loop
              preload="metadata"
              aria-label="Template preview"
              className="max-h-[45dvh] w-full object-contain"
            />
          ) : (
            <img
              src={preview.url}
              alt={popup.title || "Template preview"}
              className="max-h-[45dvh] w-full object-contain"
            />
          )}
        </div>
        <div className="p-5">
          <h2 id="app-popup-title" className="text-xl font-bold">
            {popup.title}
          </h2>
          {popup.message && (
            <p
              id="app-popup-message"
              className="mt-2 whitespace-pre-wrap text-sm opacity-80"
            >
              {popup.message}
            </p>
          )}
          <button
            type="button"
            onClick={onAction}
            className="mt-5 w-full rounded-2xl bg-[#2F80EA] px-4 py-3 text-sm font-bold text-white"
          >
            {popup.kind === "template"
              ? "Create Now"
              : popup.buttonLabel || "Explore Now"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="mt-2 w-full rounded-2xl px-4 py-2.5 text-sm font-medium opacity-75"
          >
            Cancel
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default function AppPopup({ onTemplateSelect, blocked = false }) {
  const { user, loading: authLoading } = useAuth();
  const { selectedCompany, loading: companyLoading } = useSelectedCompany();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [feed, setFeed] = useState(null);
  const [, setSeenVersion] = useState(0);
  const [actionTaken, setActionTaken] = useState(false);
  const uid = user?.uid || "";
  const companyId = selectedCompany?.id || "";
  const active =
    pathname === "/" && Boolean(uid) && !authLoading && !companyLoading;

  useEffect(() => {
    if (!active) {
      setActionTaken(false);
      return;
    }
    let cancelled = false;
    loadFeed().then((value) => {
      if (!cancelled) setFeed(value);
    });
    return () => {
      cancelled = true;
    };
  }, [active, uid, companyId]);

  const popup =
    active && !blocked && !actionTaken
      ? eligiblePopups(feed, companyId, seenStore.read(uid))[0]
      : null;
  const acknowledge = useCallback(() => {
    if (!popup) return;
    seenStore.mark(uid, popup.id);
    setSeenVersion((version) => version + 1);
  }, [popup, uid]);

  if (!popup) return null;
  return (
    <PopupDialog
      key={popup.id}
      popup={popup}
      onDismiss={acknowledge}
      onAction={() => {
        // Persist before routing, opening a profile/rank picker or leaving Home.
        acknowledge();
        setActionTaken(true);
        if (popup.kind === "template")
          onTemplateSelect({
            ...popup.template,
            type: popup.template.type || popup.template.SelectType,
          });
        else navigate(popup.destination);
      }}
    />
  );
}
