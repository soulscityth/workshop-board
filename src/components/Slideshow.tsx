"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colorBg } from "@/lib/colors";
import { getItem, setItem } from "@/lib/storage";
import type { Photo, Post } from "@/lib/types";
import Qr from "./Qr";
import { timeAgo } from "./PostCard";

type Slide = { key: string; post: Post; photo?: Photo; idx?: number };

const INTERVALS = [5, 8, 12, 20];

/**
 * Full-screen auto slideshow for the projector.
 * Each photo is a slide (text-only posts optional). New posts jump the queue so the room sees them right away.
 */
export default function Slideshow({ posts, title, publicUrl, onClose }: { posts: Post[]; title: string; publicUrl: string; onClose: () => void }) {
  const [seconds, setSeconds] = useState(() => Number(getItem("wb:ss:sec")) || 8);
  const [photosOnly, setPhotosOnly] = useState(() => getItem("wb:ss:photos") === "1");
  const [showQr, setShowQr] = useState(() => getItem("wb:ss:qr") !== "0");
  const [playing, setPlaying] = useState(true);
  const [current, setCurrent] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);
  // Everything on the board when the slideshow opens counts as "already known";
  // posts arriving later jump the queue (newest first).
  const seen = useRef<Set<string> | null>(null);
  if (!seen.current) {
    seen.current = new Set(posts.flatMap((p) => [`${p.id}`, ...p.p.map((_, i) => `${p.id}:${i}`)]));
  }
  const chromeTimer = useRef<number | undefined>(undefined);
  const resumeKey = useRef<string | null>(null);

  // Oldest → newest; loops.
  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    for (const p of [...posts].sort((a, b) => a.id - b.id)) {
      if (p.p.length) p.p.forEach((ph, i) => out.push({ key: `${p.id}:${i}`, post: p, photo: ph, idx: i }));
      else if (!photosOnly && p.t) out.push({ key: `${p.id}`, post: p });
    }
    return out;
  }, [posts, photosOnly]);

  const pos = slides.findIndex((s) => s.key === current);
  const slide = pos >= 0 ? slides[pos] : slides[0];

  const next = useCallback(
    (dir = 1) => {
      if (!slides.length) return;
      const known = seen.current!;
      const here = pos < 0 ? 0 : pos;
      if (dir > 0) {
        const fresh = [...slides].reverse().find((s) => !known.has(s.key));
        if (fresh) {
          // remember where the normal rotation was, then show the new post
          if (resumeKey.current == null) resumeKey.current = slides[here].key;
          known.add(fresh.key);
          return setCurrent(fresh.key);
        }
      }
      let from = here;
      if (resumeKey.current != null) {
        const r = slides.findIndex((s) => s.key === resumeKey.current);
        resumeKey.current = null;
        if (r >= 0 && dir > 0) from = r;
      }
      const i = (from + dir + slides.length) % slides.length;
      known.add(slides[i].key);
      setCurrent(slides[i].key);
    },
    [slides, pos],
  );

  // auto-advance — timer restarts only when the slide changes, not on every like/poll update
  const nextRef = useRef(next);
  nextRef.current = next;
  const canAdvance = slides.length >= 2 || (slides.length === 1 && pos < 0);
  useEffect(() => {
    if (!playing || !canAdvance) return;
    const t = window.setTimeout(() => nextRef.current(1), seconds * 1000);
    return () => window.clearTimeout(t);
  }, [playing, seconds, current, canAdvance]);

  // if the current slide disappears (deleted), move on
  useEffect(() => {
    if (current && pos < 0 && slides.length) setCurrent(slides[0].key);
  }, [current, pos, slides]);

  // preload next image
  useEffect(() => {
    const n = slides[(Math.max(pos, 0) + 1) % Math.max(slides.length, 1)];
    if (n?.photo) {
      const img = new Image();
      img.src = n.photo.u;
    }
  }, [pos, slides]);

  const poke = useCallback(() => {
    setChrome(true);
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setChrome(false), 3000);
  }, []);

  // fullscreen, wake lock, keyboard
  useEffect(() => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {});
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    poke();
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      lock?.release().catch(() => {});
      document.body.style.overflow = prev;
      window.clearTimeout(chromeTimer.current);
    };
  }, [poke]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      poke();
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "PageDown") next(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") next(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    const fs = () => {
      if (!document.fullscreenElement) poke();
    };
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, [next, onClose, poke]);

  const save = (k: string, v: string) => setItem(k, v);
  const total = slides.length;

  return (
    <div className={`slideshow ${chrome ? "" : "hide-chrome"}`} onMouseMove={poke} onTouchStart={poke} role="dialog" aria-modal="true" aria-label="สไลด์โชว์">
      {!slide ? (
        <div className="ss-empty">
          <div style={{ fontSize: 56 }}>🖼️</div>
          <p>ยังไม่มี{photosOnly ? "รูป" : "โพสต์"}ในบอร์ดนี้<br />สไลด์จะเริ่มเล่นอัตโนมัติเมื่อมีโพสต์</p>
        </div>
      ) : slide.photo ? (
        <div className="ss-slide" key={slide.key}>
          <img className="ss-bg" src={slide.photo.s} alt="" aria-hidden />
          <img className="ss-img" src={slide.photo.u} alt="" style={{ backgroundImage: `url("${slide.photo.s}")` }} />
          {(slide.post.t || slide.post.a) && (
            <div className="ss-caption">
              {slide.post.t && <p className="ss-text">{slide.post.t}</p>}
              <p className="ss-who">
                {slide.post.a ?? "ไม่ระบุชื่อ"} · {timeAgo(slide.post.at)}
                {slide.post.p.length > 1 && ` · รูป ${(slide.idx ?? 0) + 1}/${slide.post.p.length}`}
                {slide.post.l > 0 && ` · ♥ ${slide.post.l}`}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="ss-slide ss-note-wrap" key={slide.key}>
          <div className="ss-note" style={{ background: colorBg(slide.post.k) }}>
            <p className="ss-note-text">{slide.post.t}</p>
            <p className="ss-who dark">
              {slide.post.a ?? "ไม่ระบุชื่อ"} · {timeAgo(slide.post.at)}
              {slide.post.l > 0 && ` · ♥ ${slide.post.l}`}
            </p>
          </div>
        </div>
      )}

      {showQr && (
        <div className="ss-qr">
          <Qr value={publicUrl} className="ss-qr-code" />
          <span>สแกนเพื่อโพสต์</span>
        </div>
      )}

      <div className="ss-top">
        <span className="ss-title">{title}</span>
        <button className="ss-btn" onClick={onClose} aria-label="ออกจากสไลด์โชว์">✕ ออก</button>
      </div>

      <div className="ss-controls">
        <button className="ss-btn" onClick={() => next(-1)} aria-label="ก่อนหน้า">‹</button>
        <button className="ss-btn ss-play" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ หยุด" : "▶ เล่น"}</button>
        <button className="ss-btn" onClick={() => next(1)} aria-label="ถัดไป">›</button>
        <span className="ss-count">{total ? `${Math.max(pos, 0) + 1}/${total}` : "0"}</span>
        <select className="ss-select" value={seconds} aria-label="เวลาต่อสไลด์"
          onChange={(e) => { setSeconds(Number(e.target.value)); save("wb:ss:sec", e.target.value); }}>
          {INTERVALS.map((s) => <option key={s} value={s}>{s} วินาที</option>)}
        </select>
        <label className="ss-check">
          <input type="checkbox" checked={photosOnly} onChange={(e) => { setPhotosOnly(e.target.checked); save("wb:ss:photos", e.target.checked ? "1" : "0"); }} />
          เฉพาะรูป
        </label>
        <label className="ss-check">
          <input type="checkbox" checked={showQr} onChange={(e) => { setShowQr(e.target.checked); save("wb:ss:qr", e.target.checked ? "1" : "0"); }} />
          QR
        </label>
      </div>
      {playing && slide && total > 1 && <div className="ss-progress" key={`${slide.key}-${seconds}`} style={{ animationDuration: `${seconds}s` }} />}
    </div>
  );
}
