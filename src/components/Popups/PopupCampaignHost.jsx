import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../Auth/AuthContext";
import { useSelectedCompany } from "../../Context/SelectedCompanyContext";
import { createPopupFeedClient, seenPopups, markPopupSeen, POPUP_SEEN_PREFIX } from "../../utils/popupFeedClient";
import { eligiblePopupQueue } from "../../utils/popupModel";
import PopupCard from "./PopupCard";

let deviceStorage = null;
try { deviceStorage = globalThis.localStorage || null; } catch { /* Private WebView. */ }
const base = String(import.meta.env.VITE_TEMPLATE_CDN_BASE_URL || "https://cdn.mlmposter.com").replace(/\/+$/, "");
const client = createPopupFeedClient({ url: `${base}/catalog/v1/popups.json`, storage: deviceStorage });

function PopupDialog({ item, count, onDismiss, onAction }) {
  const box = useRef(null);
  const callbacks = useRef({ onDismiss });
  useEffect(() => { callbacks.current = { onDismiss }; }, [onDismiss]);
  useEffect(() => {
    const previous = document.activeElement;
    const element = box.current;
    element.querySelector("button")?.focus();
    const keydown = event => {
      if (event.key === "Escape") { event.preventDefault(); callbacks.current.onDismiss(); }
      if (event.key !== "Tab") return;
      const nodes = [...element.querySelectorAll("button:not([disabled])")];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, [item.id]);
  return createPortal(<div className="mlm-popup-backdrop" onClick={event => { if (event.currentTarget === event.target) onDismiss(); }}><div ref={box} className="mlm-popup-dialog" role="dialog" aria-modal="true" aria-label={item.title}><PopupCard campaign={item} count={count} onClose={onDismiss} onAction={onAction} /></div></div>, document.body);
}

export default function PopupCampaignHost({ onTemplateSelect }) {
  const { user, loading: authLoading } = useAuth();
  const { selectedCompany, loading: companyLoading } = useSelectedCompany();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const uid = user?.uid || "";
  const companyId = selectedCompany?.id || "";
  const [feed, setFeed] = useState(null);
  const [seenVersion, setSeenVersion] = useState(0);
  const [quietVisit, setQuietVisit] = useState(false);
  const acting = useRef(false);
  useEffect(() => {
    if (!uid || authLoading || companyLoading || pathname !== "/") return;
    let active = true;
    client.load().then(value => { if (active) setFeed(value); });
    return () => { active = false; };
  }, [uid, authLoading, companyLoading, pathname]);
  useEffect(() => {
    const changed = event => { if (event.key === `${POPUP_SEEN_PREFIX}${uid}`) setSeenVersion(value => value + 1); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [uid]);
  useEffect(() => { if (pathname !== "/") setQuietVisit(false); }, [pathname]);
  const queue = useMemo(() => eligiblePopupQueue(feed, companyId, seenPopups(uid, deviceStorage)), [feed, companyId, uid, seenVersion, pathname]);
  if (!uid || authLoading || companyLoading || pathname !== "/" || quietVisit || !queue.length) return null;
  const item = queue[0];
  const acknowledge = () => { markPopupSeen(uid, item.id, deviceStorage); setSeenVersion(value => value + 1); };
  const act = () => {
    if (acting.current) return;
    acting.current = true;
    setQuietVisit(true);
    acknowledge();
    try {
      if (item.kind === "template") {
        // Reuse Home's actual selection handler, including designation picker,
        // profile prompt, seed and editor/form navigation. No parallel flow.
        const template = { ...item.template, type: item.template.SelectType || item.template.type };
        onTemplateSelect(template);
      } else navigate(item.destination);
    } finally { acting.current = false; }
  };
  return <PopupDialog key={item.id} item={item} count={queue.length} onDismiss={acknowledge} onAction={act} />;
}
