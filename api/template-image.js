// Emergency canvas fallback for public, non-sensitive, explicitly whitelisted
// CDN template raster images only. Prefer fixing CDN CORS at Cloudflare.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // stay below Vercel Function body limit
const CDN_HOST = "cdn.mlmposter.com";
const ALLOWED_MIME = /^image\/(?:webp|png|jpeg|avif|gif)(?:\s*;|$)/i;

export function isAllowedTemplateImageUrl(raw) {
  try {
    const u = new URL(String(raw || ""));
    return u.protocol === "https:" && u.hostname === CDN_HOST &&
      !u.username && !u.password && (!u.port || u.port === "443") &&
      u.pathname.startsWith("/templates/") &&
      /\.(?:webp|png|jpe?g|avif|gif)$/i.test(u.pathname);
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const raw = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  if (!isAllowedTemplateImageUrl(raw)) return res.status(400).json({ error: "Unsupported CDN image" });
  try {
    const response = await fetch(raw, {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(10000),
      headers: { Accept: "image/webp,image/avif,image/png,image/jpeg,image/gif" },
    });
    if (!response.ok) return res.status(response.status >= 300 && response.status < 400 ? 502 : response.status).json({error: "Image upstream unavailable"});
    const length = Number(response.headers.get("content-length") || "0");
    if (length > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Image too large" });
    const mime = response.headers.get("content-type") || "";
    if (!ALLOWED_MIME.test(mime)) return res.status(415).json({ error: "Not a raster image" });
    const body = response.body;
    if (!body) return res.status(502).json({ error: "No image data" });
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return res.status(413).json({ error: "Image too large" });
      }
      chunks.push(Buffer.from(value));
    }
    if (!total) return res.status(502).json({ error: "Empty image" });
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(Buffer.concat(chunks));
  } catch (error) {
    console.warn("[template-image fallback] upstream unavailable", error?.name || "error");
    return res.status(502).json({ error: "Template image temporarily unavailable" });
  }
}
