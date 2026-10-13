const PROFILE_R2_HOST = "pub-a9fc3713abb3442ba09ff324db4e136f.r2.dev";
const FIREBASE_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
]);

function isAllowedProfileUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || ""));
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  if (url.hostname === PROFILE_R2_HOST) {
    return decodeURIComponent(url.pathname).startsWith("/mlmprofiles/");
  }

  if (FIREBASE_HOSTS.has(url.hostname)) {
    const decoded = decodeURIComponent(`${url.pathname}${url.search}`);
    return decoded.includes("mlmprofiles/");
  }

  return false;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  if (!isAllowedProfileUrl(rawUrl)) {
    res.status(400).json({ error: "Unsupported profile image URL" });
    return;
  }

  try {
    const upstream = await fetch(rawUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Image upstream failed (${upstream.status})` });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      res.status(415).json({ error: "Upstream resource is not an image" });
      return;
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length) {
      res.status(502).json({ error: "Upstream image is empty" });
      return;
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(bytes);
  } catch (error) {
    console.error("[image-proxy]", error);
    res.status(502).json({ error: "Profile image proxy failed" });
  }
}
