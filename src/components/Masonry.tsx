"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { frameHeightPerWidth, type Post } from "@/lib/types";

const GAP = 12;
const LOOKAHEAD = 8; // how far ahead we look for narrow cards to fill a hole under a wide card

/** A single landscape photo spans two columns (framed 3:2 → same height as a 3:4 portrait next to it). */
export const isWidePost = (p: Post, cols: number) =>
  cols >= 2 && p.p.length === 1 && p.p[0].w > p.p[0].h * 1.1;

/** Fallback height before a card has been measured. */
function estimate(p: Post, width: number, wide: boolean) {
  let h = 56;
  if (p.p.length === 1) h += wide ? width / 1.5 : width * frameHeightPerWidth(p.p[0]);
  else if (p.p.length > 1) h += width; // grid of square tiles
  if (p.t) {
    const perLine = Math.max(10, width / 9);
    h += 24 + Math.ceil(p.t.length / perLine + (p.t.match(/\n/g)?.length ?? 0)) * 24;
  }
  if (p.c != null) h += 30;
  return h;
}

type Placed = { x: number; y: number; w: number; wide: boolean };

/**
 * Newest-first masonry with measured heights (absolute positioning).
 * Wide cards take the lowest pair of adjacent columns; if that leaves a hole under the shorter
 * column, upcoming narrow cards that fit are slotted into the hole first.
 */
export default function Masonry({
  items,
  cols,
  render,
}: {
  items: Post[];
  cols: number;
  render: (p: Post, wide: boolean, width: number) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const heights = useRef(new Map<number, number>());
  const [tick, setTick] = useState(0);
  const [animate, setAnimate] = useState(false);
  const raf = useRef(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // one ResizeObserver for all cards
  const cardRO = useRef<ResizeObserver | null>(null);
  if (!cardRO.current && typeof ResizeObserver !== "undefined") {
    cardRO.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        const id = Number((e.target as HTMLElement).dataset.id);
        const h = Math.round((e.target as HTMLElement).offsetHeight);
        if (Math.abs((heights.current.get(id) ?? -99) - h) > 1) {
          heights.current.set(id, h);
          changed = true;
        }
      }
      if (changed) {
        cancelAnimationFrame(raf.current);
        raf.current = requestAnimationFrame(() => setTick((t) => t + 1));
      }
    });
  }
  useEffect(() => () => cardRO.current?.disconnect(), []);

  const refs = useRef(new Map<number, (el: HTMLDivElement | null) => void>());
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const refFor = useCallback((id: number) => {
    let fn = refs.current.get(id);
    if (!fn) {
      fn = (el) => {
        const prev = nodes.current.get(id);
        if (prev && prev !== el) cardRO.current?.unobserve(prev);
        if (el) {
          nodes.current.set(id, el);
          cardRO.current?.observe(el);
        } else {
          nodes.current.delete(id);
          refs.current.delete(id);
          heights.current.delete(id);
        }
      };
      refs.current.set(id, fn);
    }
    return fn;
  }, []);

  const layout = useMemo(() => {
    const pos = new Map<number, Placed>();
    if (!width) return { pos, height: 0 };
    const cw = (width - GAP * (cols - 1)) / cols;
    const hs = new Array(cols).fill(0);
    const heightOf = (p: Post, w: number, wide: boolean) => heights.current.get(p.id) ?? estimate(p, w, wide);
    const place = (p: Post, col: number, wide: boolean) => {
      const w = wide ? cw * 2 + GAP : cw;
      const y = wide ? Math.max(hs[col], hs[col + 1]) : hs[col];
      pos.set(p.id, { x: col * (cw + GAP), y, w, wide });
      const bottom = y + heightOf(p, w, wide) + GAP;
      hs[col] = bottom;
      if (wide) hs[col + 1] = bottom;
    };
    const queue = [...items];
    while (queue.length) {
      const p = queue.shift()!;
      const wide = isWidePost(p, cols);
      if (!wide) {
        let k = 0;
        for (let i = 1; i < cols; i++) if (hs[i] < hs[k] - 1) k = i;
        place(p, k, false);
        continue;
      }
      // lowest pair of adjacent columns
      let best = 0;
      let bestTop = Infinity;
      for (let i = 0; i < cols - 1; i++) {
        const top = Math.max(hs[i], hs[i + 1]);
        if (top < bestTop - 1) {
          bestTop = top;
          best = i;
        }
      }
      // fill the hole under the shorter column with upcoming narrow cards that fit
      for (let guard = 0; guard < LOOKAHEAD; guard++) {
        const lo = hs[best] < hs[best + 1] ? best : best + 1;
        const hole = bestTop - hs[lo];
        if (hole < 60) break;
        const j = queue.findIndex(
          (q, idx) => idx < LOOKAHEAD && !isWidePost(q, cols) && heightOf(q, cw, false) + GAP <= hole + 24,
        );
        if (j < 0) break;
        const [q] = queue.splice(j, 1);
        place(q, lo, false);
        bestTop = Math.max(hs[best], hs[best + 1]);
      }
      place(p, best, true);
    }
    return { pos, height: Math.max(0, ...hs) };
    // tick: re-run when measured heights change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, cols, width, tick]);

  // enable move animation only after the first real layout, so cards don't fly in from 0,0
  useEffect(() => {
    if (width && !animate) {
      const t = window.setTimeout(() => setAnimate(true), 400);
      return () => window.clearTimeout(t);
    }
  }, [width, animate]);

  return (
    <div ref={box} className={`masonry-box ${animate ? "animate" : ""}`} style={{ height: layout.height }}>
      {width > 0 &&
        items.map((p) => {
          const at = layout.pos.get(p.id);
          if (!at) return null;
          return (
            <div
              key={p.id}
              ref={refFor(p.id)}
              data-id={p.id}
              className="masonry-item"
              style={{ width: at.w, transform: `translate(${at.x}px, ${at.y}px)` }}
            >
              {render(p, at.wide, at.w)}
            </div>
          );
        })}
    </div>
  );
}
