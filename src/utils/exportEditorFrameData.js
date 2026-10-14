/**
 * ONE-TIME LOCAL DEV EXPORTER (not imported by the production App).
 * Run only while logged in to your LOCAL Vite dev WebApp:
 *   const { downloadEditorFrameJson } = await import('/src/utils/exportEditorFrameData.js');
 *   await downloadEditorFrameJson();
 * The downloaded JSON files go into src/data/ BEFORE deploying the MainEditor patch.
 * Does not write Firestore and does not export secrets/user data.
 */
import { db } from "@firebase-config";
import { collection, getDocs, query, where } from "firebase/firestore";
import { COLLECTIONS } from "../collections";

const FRAME_GROUPS = [
  { graphicsType: "TopUplineFrames", fileName: "topuplineframes.json" },
  { graphicsType: "Footers", fileName: "footerframes.json" },
];

const hasValue = (link) =>
  link && typeof link.value === "string" && link.value.trim().length > 0;

const cleanDocument = (snapshot, graphicsType) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    GraphicName: typeof data.GraphicName === "string" ? data.GraphicName : "",
    GraphicsType: graphicsType,
    Active: data.Active === true,
    GraphicsLinks: (Array.isArray(data.GraphicsLinks) ? data.GraphicsLinks : [])
      .filter(hasValue)
      .map((link) => ({ ...link, value: link.value.trim() })),
  };
};

function downloadJson(fileName, value) {
  const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function fetchFrameType(graphicsType) {
  const q = query(
    collection(db, COLLECTIONS.MLMGRAPHICS),
    where("GraphicsType", "==", graphicsType),
  );
  const result = await getDocs(q);
  const docs = result.docs
    .map((doc) => cleanDocument(doc, graphicsType))
    .filter((doc) => doc.Active && doc.GraphicsLinks.length > 0)
    // Original getDocs(collection) iterated in document-ID order.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (docs.length === 0) {
    throw new Error(`${graphicsType}: no active documents with GraphicsLinks found. Nothing downloaded.`);
  }
  return docs;
}

// Only verified public R2 images are substituted. Existing Firebase URLs remain
// unchanged if the same object key is missing or CDN HEAD fails.
function cdnCandidateForFirebaseStorage(value) {
  try {
    const u = new URL(value);
    if (u.hostname !== "firebasestorage.googleapis.com") return null;
    const match = u.pathname.match(/\/o\/(.+)$/);
    if (!match) return null;
    const key = decodeURIComponent(match[1]);
    if (!/^(?:graphics|utils|companies|templates|video|music)\//.test(key)) return null;
    if (key.includes("..") || key.includes("\\")) return null;
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `https://cdn.mlmposter.com/${encoded}`;
  } catch {
    return null;
  }
}

async function verifiedCdnUrl(link) {
  const candidate = cdnCandidateForFirebaseStorage(link.value);
  if (!candidate) return link;
  try {
    const response = await fetch(candidate, { method: "HEAD", mode: "cors" });
    const type = response.headers.get("content-type") || "";
    if (response.ok && type.startsWith("image/")) {
      return { ...link, value: candidate };
    }
  } catch {
    // Not proven present/accessible; preserve original working Firebase URL.
  }
  return link;
}

async function verifyAndRewritePublicCdnLinks(docs) {
  // Small bounded work pool; NO Firebase Storage reads, no Firestore writes.
  const refs = docs.flatMap((doc) => doc.GraphicsLinks.map((link, i) => ({ link, i, doc })));
  let next = 0;
  const workers = Array.from({ length: Math.min(6, refs.length) }, async () => {
    while (next < refs.length) {
      const index = next++;
      const { link, i, doc } = refs[index];
      doc.GraphicsLinks[i] = await verifiedCdnUrl(link);
    }
  });
  await Promise.all(workers);
  return docs;
}

export async function downloadEditorFrameJson() {
  // Fetch both first; never download only one if the other query fails.
  const [top, footer] = await Promise.all([
    fetchFrameType(FRAME_GROUPS[0].graphicsType),
    fetchFrameType(FRAME_GROUPS[1].graphicsType),
  ]);
  await Promise.all([
    verifyAndRewritePublicCdnLinks(top),
    verifyAndRewritePublicCdnLinks(footer),
  ]);
  const groups = [top, footer];
  groups.forEach((docs, idx) => {
    const links = docs.flatMap((doc) => doc.GraphicsLinks);
    const firebaseCount = links.filter((link) =>
      link.value.includes("firebasestorage.googleapis.com"),
    ).length;
    console.log(`[Frame export] ${FRAME_GROUPS[idx].graphicsType}: ${docs.length} active docs, ${links.length} links, Firebase Storage URLs: ${firebaseCount}`);
    if (firebaseCount > 0) {
      console.warn(`Some ${FRAME_GROUPS[idx].graphicsType} images still point to Firebase Storage. Convert to verified R2 URLs in JSON if you want to reduce Storage bandwidth, but do not guess URLs.`);
    }
  });
  downloadJson(FRAME_GROUPS[0].fileName, top);
  downloadJson(FRAME_GROUPS[1].fileName, footer);
  console.log("Two local JSON files downloaded. Copy BOTH into src/data/ before replacing MainEditor.jsx.");
  return {
    topUplineDocs: top.length,
    topUplineLinks: top.reduce((n, doc) => n + doc.GraphicsLinks.length, 0),
    footerDocs: footer.length,
    footerLinks: footer.reduce((n, doc) => n + doc.GraphicsLinks.length, 0),
  };
}
