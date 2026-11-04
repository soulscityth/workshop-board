"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getItem, setItem } from "@/lib/storage";
import { useSlideshow } from "@/lib/slides";
import type { Post } from "@/lib/types";
import { Progress, QrCorner, SlideView, Stage } from "./Stage";

export const INTERVALS = [5, 8, 12, 20];

/** Hook for the slideshow settings shared by the single-screen slideshow and the presenter console. */
export function useSlideSettings() {
  const [seconds, setSecondsS] = useState(8);
  const [photosOnly, setPhotosOnlyS] = useState(false);
  const [showQr, setShowQrS] = useState(true);
  useEffect(() => {
    setSecondsS(Number(getItem("wb:ss:sec")) || 8);
    setPhotosOnlyS(getItem("wb:ss:photos") === "1");
    setShowQrS(getItem("wb:ss:qr") !== "0");
  }, []);
  return {
    seconds,
    photosOnly,
    showQr,
    setSeconds: (v: number) => { setSecondsS(v); setItem("wb:ss:sec", String(v)); },
    setPhotosOnly: (v: boolean) => { setPhotosOnlyS(v); setItem("wb:ss:photos", v ? "1" : "0"); },
    setShowQr: (v: boolean) => { setShowQrS(v); setItem("wb:ss:qr", v ? "1" : "0"); },
  };
}

/** Full-screen slideshow on the same screen (no second display). */
export default function Slideshow({ posts, title, publicUrl, onClose }: { posts: Post[]; title: string; publicUrl: string; onClose: () => void }) {
  const cfg = useSlideSettings();
  const [playing, setPlaying] = useState(true);
  const ss = useSlideshow(posts, { photosOnly: cfg.photosOnly, seconds: cfg.seconds, playing });
  const [chrome, setChrome] = useState(true);
  const chromeTimer = useRef<number | undefined>(undefined);

  const poke = useCallback(() => {
    setChrome(true);
    window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setChrome(false), 3000);
  }, []);

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
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

  const { go } = ss;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      poke();
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, onClose, poke]);

  return (
    <div className={`slideshow ${chrome ? "" : "hide-chrome"}`} onMouseMove={poke} onTouchStart={poke} role="dialog" aria-modal="true" aria-label="สไลด์โชว์">
      <Stage>
        <SlideView slide={ss.slide} emptyText={`ยังไม่มี${cfg.photosOnly ? "รูป" : "โพสต์"}ในบอร์ดนี้ — สไลด์จะเริ่มเมื่อมีโพสต์`} />
        {cfg.showQr && <QrCorner url={publicUrl} />}
        {playing && ss.slide && ss.total > 1 && <Progress startedAt={ss.startedAt} seconds={cfg.seconds} />}
      </Stage>

      <div className={`ss-top ${cfg.showQr ? "with-qr" : ""}`}>
        <span className="ss-title">{title}</span>
        <button className="ss-btn" onClick={onClose} aria-label="ออกจากสไลด์โชว์">✕ ออก</button>
      </div>

      <div className="ss-controls">
        <button className="ss-btn" onClick={() => go(-1)} aria-label="ก่อนหน้า">‹</button>
        <button className="ss-btn ss-play" onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ หยุด" : "▶ เล่น"}</button>
        <button className="ss-btn" onClick={() => go(1)} aria-label="ถัดไป">›</button>
        <span className="ss-count">{ss.total ? `${ss.index + 1}/${ss.total}` : "0"}</span>
        <select className="ss-select" value={cfg.seconds} aria-label="เวลาต่อสไลด์" onChange={(e) => cfg.setSeconds(Number(e.target.value))}>
          {INTERVALS.map((s) => <option key={s} value={s}>{s} วินาที</option>)}
        </select>
        <label className="ss-check">
          <input type="checkbox" checked={cfg.photosOnly} onChange={(e) => cfg.setPhotosOnly(e.target.checked)} />
          เฉพาะรูป
        </label>
        <label className="ss-check">
          <input type="checkbox" checked={cfg.showQr} onChange={(e) => cfg.setShowQr(e.target.checked)} />
          QR
        </label>
      </div>
    </div>
  );
}
