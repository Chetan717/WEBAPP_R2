const PROFILE_BOTTOM_FEATHER_TYPES = new Set([
  "Motivational",
  "ThankYou_Banner_B",
  "ThankYou_Birthday_Anniversary",
  "Anniversary_Birthday",
]);

// Render a copy so the uploaded photo, other banner types and Top Upline
// images keep their original pixels. Only the bottom edge gets a light mist.
export function getBottomFeatheredProfilePhoto(
  image,
  type,
  createCanvas = () => document.createElement("canvas"),
) {
  if (!image || !PROFILE_BOTTOM_FEATHER_TYPES.has(type)) return image;
  const width = Number(image.naturalWidth || image.width);
  const height = Number(image.naturalHeight || image.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return image;
  }

  try {
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return image;
    context.drawImage(image, 0, 0, width, height);

    // source-atop keeps the surrounding transparent area transparent.
    const mist = context.createLinearGradient(0, 0, 0, height);
    mist.addColorStop(0, "rgba(255,255,255,0)");
    mist.addColorStop(0.98, "rgba(255,255,255,0)");
    mist.addColorStop(0.99, "rgba(255,255,255,0.015)");
    mist.addColorStop(1, "rgba(255,255,255,0.05)");
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = mist;
    context.fillRect(0, 0, width, height);

    const fade = context.createLinearGradient(0, 0, 0, height);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.98, "rgba(0,0,0,1)");
    fade.addColorStop(0.99, "rgba(0,0,0,0.9)");
    fade.addColorStop(0.995, "rgba(0,0,0,0.6)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = fade;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    return canvas;
  } catch {
    return image;
  }
}
