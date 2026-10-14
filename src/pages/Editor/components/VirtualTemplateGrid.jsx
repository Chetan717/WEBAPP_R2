import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const GAP = 8;
const OVERSCAN_ROWS = 4;

function getColumnCount() {
  if (typeof window === "undefined") return 4;
  return window.innerWidth >= 768 ? 6 : window.innerWidth >= 640 ? 5 : 4;
}

/**
 * Keep the original full list and scroll height, but mount only the thumbnail
 * rows that are on screen. This prevents 500+ images from being in the DOM
 * after a customer scrolls through hundreds of templates.
 */
export default function VirtualTemplateGrid({ items, renderTile }) {
  const hostRef = useRef(null);
  const frameRef = useRef(null);
  const [layout, setLayout] = useState({ width: 320, columns: 4, topRow: 0, bottomRow: 11 });

  const recalculate = useCallback(() => {
    const host = hostRef.current;
    const scrollParent = host?.closest('[data-template-scroll="true"]');
    if (!host || !scrollParent) return;
    const width = host.clientWidth || 320;
    const columns = getColumnCount();
    const rowHeight = ((width - (columns - 1) * GAP) / columns) + GAP;
    const scrollRect = scrollParent.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const startPx = Math.max(0, scrollRect.top - hostRect.top);
    const topRow = Math.max(0, Math.floor(startPx / rowHeight) - OVERSCAN_ROWS);
    const bottomRow = Math.max(topRow, Math.ceil((startPx + scrollParent.clientHeight) / rowHeight) + OVERSCAN_ROWS);
    setLayout((old) => old.width === width && old.columns === columns &&
      old.topRow === topRow && old.bottomRow === bottomRow
      ? old : { width, columns, topRow, bottomRow });
  }, []);

  useLayoutEffect(() => {
    recalculate();
    const host = hostRef.current;
    const scrollParent = host?.closest('[data-template-scroll="true"]');
    if (!host || !scrollParent) return;
    const scheduleUpdate = () => {
      if (frameRef.current != null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        recalculate();
      });
    };
    scrollParent.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(host);
    observer?.observe(scrollParent);
    return () => {
      scrollParent.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      observer?.disconnect();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [recalculate, items]);

  const { columns, width, topRow, bottomRow } = layout;
  const rowHeight = ((width - (columns - 1) * GAP) / columns) + GAP;
  const totalRows = Math.ceil(items.length / columns);
  const firstIndex = Math.min(items.length, topRow * columns);
  const lastIndex = Math.min(items.length, (bottomRow + 1) * columns);
  const visible = useMemo(() => items.slice(firstIndex, lastIndex), [items, firstIndex, lastIndex]);

  return (
    <div ref={hostRef} className="relative w-full" style={{ height: Math.max(0, totalRows * rowHeight - GAP) }}>
      <div
        className="absolute inset-x-0 grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6"
        style={{ top: Math.floor(firstIndex / columns) * rowHeight }}
      >
        {visible.map((item, index) => renderTile(item, firstIndex + index))}
      </div>
    </div>
  );
}
