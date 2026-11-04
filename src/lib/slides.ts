"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Photo, Post } from "./types";

export type Slide = { key: string; post: Post; photo?: Photo; idx?: number };

/** Oldest → newest. Each photo is its own slide; text-only posts optional. */
export function buildSlides(posts: Post[], photosOnly: boolean): Slide[] {
  const out: Slide[] = [];
  for (const p of [...posts].sort((a, b) => a.id - b.id)) {
    if (p.p.length) p.p.forEach((ph, i) => out.push({ key: `${p.id}:${i}`, post: p, photo: ph, idx: i }));
    else if (!photosOnly && p.t) out.push({ key: `${p.id}`, post: p });
  }
  return out;
}

const keysOf = (posts: Post[]) => new Set(posts.flatMap((p) => [`${p.id}`, ...p.p.map((_, i) => `${p.id}:${i}`)]));

/**
 * Slideshow state machine shared by the single-screen slideshow and the presenter console.
 * Posts that arrive after it starts jump the queue (newest first), then rotation resumes where it was.
 */
export function useSlideshow(posts: Post[], opts: { photosOnly: boolean; seconds: number; playing: boolean }) {
  const { photosOnly, seconds, playing } = opts;
  const initial = useRef<Set<string> | null>(null);
  if (!initial.current) initial.current = keysOf(posts);
  const seen = useRef<Set<string> | null>(null);
  if (!seen.current) seen.current = new Set(initial.current);
  const resumeKey = useRef<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const slides = useMemo(() => buildSlides(posts, photosOnly), [posts, photosOnly]);
  const pos = slides.findIndex((s) => s.key === current);
  const here = pos < 0 ? 0 : pos;
  const slide: Slide | null = slides[here] ?? null;

  const freshest = useCallback(
    () => [...slides].reverse().find((s) => s.key !== slide?.key && !seen.current!.has(s.key)),
    [slides, slide],
  );

  /** What "next" would show — used for the presenter's next-slide preview. */
  const nextSlide: Slide | null = useMemo(() => {
    if (slides.length < 2) return null;
    const fresh = freshest();
    if (fresh) return fresh;
    let from = here;
    if (resumeKey.current != null) {
      const r = slides.findIndex((s) => s.key === resumeKey.current);
      if (r >= 0) from = r;
    }
    return slides[(from + 1) % slides.length];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides, here, freshest, current]);

  const show = useCallback((key: string) => {
    seen.current!.add(key);
    setCurrent(key);
    setStartedAt(Date.now());
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (!slides.length) return;
      if (dir > 0) {
        const fresh = freshest();
        if (fresh) {
          if (resumeKey.current == null && slide) resumeKey.current = slide.key;
          return show(fresh.key);
        }
      }
      let from = here;
      if (resumeKey.current != null) {
        const r = slides.findIndex((s) => s.key === resumeKey.current);
        resumeKey.current = null;
        if (r >= 0 && dir > 0) from = r;
      }
      show(slides[(from + dir + slides.length) % slides.length].key);
    },
    [slides, here, slide, freshest, show],
  );

  const goTo = useCallback((key: string) => {
    resumeKey.current = null;
    show(key);
  }, [show]);

  // auto-advance — the timer restarts only when the slide changes, not on every like/poll update
  const goRef = useRef(go);
  goRef.current = go;
  const canAdvance = slides.length >= 2;
  useEffect(() => {
    if (!playing || !canAdvance) return;
    const t = window.setTimeout(() => goRef.current(1), seconds * 1000);
    return () => window.clearTimeout(t);
  }, [playing, seconds, startedAt, canAdvance]);

  // restart the countdown when play resumes or timing changes
  useEffect(() => {
    setStartedAt(Date.now());
  }, [playing, seconds]);

  // current slide deleted → move on
  useEffect(() => {
    if (current && pos < 0 && slides.length) show(slides[0].key);
  }, [current, pos, slides, show]);

  // preload the next photo
  useEffect(() => {
    if (nextSlide?.photo) {
      const img = new Image();
      img.src = nextSlide.photo.u;
    }
  }, [nextSlide]);

  const isNew = useCallback((key: string) => !initial.current!.has(key), []);

  return { slides, slide, nextSlide, index: here, total: slides.length, go, goTo, startedAt, isNew };
}
