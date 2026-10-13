import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@firebase-config";
import { isR2ProfileUrl, R2_PROFILE_BASE_URL } from "../utils/profileR2Urls";

const functions = getFunctions(app, "asia-south1");
const createUploadFn = httpsCallable(functions, "createR2ProfileUpload");
const deleteProfileFn = httpsCallable(functions, "deleteR2ProfileObject");

const safeFileName = (value = "image.webp") =>
  String(value || "image.webp")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(-140) || "image.webp";

export async function uploadProfileImageToR2(blob, { scope = "profile", fileName = "image.webp" } = {}) {
  if (!(blob instanceof Blob)) throw new Error("Profile upload requires an image blob.");
  const contentType = "image/webp";
  const result = await createUploadFn({
    scope,
    fileName: safeFileName(fileName.replace(/\.[^.]+$/, ".webp")),
    contentType,
    size: blob.size,
  });
  const { uploadUrl, publicUrl } = result?.data || {};
  if (!uploadUrl || !publicUrl) throw new Error("R2 profile upload URL was not returned.");

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`R2 profile upload failed (${response.status}) ${body.slice(0, 120)}`);
  }
  // The signed upload Function may still return the old public R2 domain.
  // Switch only this known bucket's profile-object URL; never rewrite unknown
  // hosts or paths. The signed PUT always uses the original uploadUrl.
  try {
    const source = new URL(publicUrl);
    const legacyHost = "pub-a9fc3713abb3442ba09ff324db4e136f.r2.dev";
    if (source.protocol === "https:" &&
        source.hostname === legacyHost &&
        source.pathname.startsWith("/mlmprofiles/")) {
      return `${R2_PROFILE_BASE_URL}${source.pathname}${source.search}`;
    }
  } catch {
    // Preserve the Function URL if its format cannot be validated here.
  }
  return publicUrl;
}

export async function deleteR2ProfileAsset(url) {
  if (!isR2ProfileUrl(url)) return false;
  await deleteProfileFn({ url });
  return true;
}
