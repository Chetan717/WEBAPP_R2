import "./PopupCard.css";
import { popupPreview } from "../../utils/popupModel";

export default function PopupCard({ campaign, onClose, onAction, busy = false, preview = false, count = 1 }) {
  const isTemplate = campaign.kind === "template";
  const template = campaign.template || campaign.templateMeta;
  const imageUrl = isTemplate ? popupPreview(campaign) : campaign.imageUrl;
  const firstGraphic = template?.GraphicsLink?.[0];
  const isVideo = isTemplate ? Boolean(firstGraphic?.backgroundVideoUrl && firstGraphic.backgroundVideoUrl === imageUrl) : campaign.video;
  return <article className="mlm-popup-card">
    <div className="mlm-popup-top"><span className="mlm-popup-eyebrow"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" /></svg>{isTemplate ? "FRESH FROM THE STUDIO" : "A LITTLE SOMETHING FOR YOU"}</span><button type="button" aria-label="Close popup" disabled={busy || preview} onClick={onClose} className="mlm-popup-close">×</button></div>
    <div className="mlm-popup-art">
      {imageUrl ? isVideo ? <video key={imageUrl} src={imageUrl} muted autoPlay loop playsInline preload="metadata" /> : <img key={imageUrl} src={imageUrl} alt={isTemplate ? `${template?.Subtype || "New template"} first design preview` : campaign.title || "Announcement"} decoding="async" onError={event => { event.currentTarget.style.visibility = "hidden"; }} /> : <span className="mlm-popup-placeholder">Your announcement preview</span>}
      <span className="mlm-popup-sticker">{isTemplate ? "NEW DESIGN" : "MLMLIVE EXCLUSIVE"}</span>
    </div>
    <div className="mlm-popup-copy">
      {isTemplate && <div className="mlm-popup-tags"><span>{String(template?.SelectType || template?.type || "Template").replaceAll("_", " ")}</span>{template?.Subtype && <span>{template.Subtype}</span>}</div>}
      <h2>{campaign.title || (isTemplate ? "Your next great design is here." : "Something exciting is here.")}</h2>
      <p>{campaign.message || (isTemplate ? "Make it yours in a few taps. Add your details and create something worth sharing." : "Discover the latest updates, offers and more from MLMLIVE.")}</p>
      <button type="button" className="mlm-popup-primary" disabled={busy || preview} onClick={onAction}>{busy ? "Opening…" : isTemplate ? "Create Now" : campaign.buttonLabel || "Explore Now"}<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
      <button type="button" className="mlm-popup-cancel" disabled={busy || preview} onClick={onClose}>Maybe later</button>
      <div className="mlm-popup-foot"><span>Made for your next big moment</span>{count > 1 && <span>{count} updates</span>}</div>
    </div>
  </article>;
}
