// Top Upline portraits are uploaded waist-up. Use the upper half for the
// small face frames, without changing the uploaded image or its URL.
export function getTopUplineHeadCrop(image) {
  const width = Number(image?.naturalWidth || image?.videoWidth || image?.width);
  const height = Number(image?.naturalHeight || image?.videoHeight || image?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  const size = Math.min(width, height / 2);
  return { x: (width - size) / 2, y: 0, width: size, height: size };
}
