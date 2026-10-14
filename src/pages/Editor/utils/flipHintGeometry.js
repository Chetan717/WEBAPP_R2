/**
 * Find the visible centre of a Konva Image without modifying its state.
 * Returns stage-space coordinates; DOM overlay uses stage-relative percentages.
 */
export function getFlipHintPosition(node, stageWidth = 320, stageHeight = 320) {
  if (!node || !node.image?.() || !node.visible?.()) return null;
  let box;
  try {
    box = node.getClientRect({ skipShadow: true, skipStroke: true });
  } catch {
    return null;
  }
  if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return null;
  const left = Math.max(0, box.x);
  const right = Math.min(stageWidth, box.x + box.width);
  const top = Math.max(0, box.y);
  const bottom = Math.min(stageHeight, box.y + box.height);
  if (right - left < 20 || bottom - top < 20) return null;
  // Stay within the photo and keep the label inside the 320x320 editor.
  const x = Math.max(40, Math.min(stageWidth - 40, (left + right) / 2));
  const y = Math.max(38, Math.min(stageHeight - 38, (top + bottom) / 2));
  return { x, y };
}
