"use client";
import { useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/types";

export default function Viewer({ photos, start, onClose }: { photos: Photo[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const touch = useRef<{ x: number; y: number } | null>(null);
  const ph = photos[i];
  const go = (d: number) => setI((x) => Math.min(photos.length - 1, Math.max(0, x + d)));

  useEffect(() => {
    const size = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    size();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("resize", size);
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ph) return null;
  const scale = vp.w ? Math.min(vp.w / ph.w, vp.h / ph.h) : 0;
  const w = Math.round(ph.w * scale);
  const h = Math.round(ph.h * scale);

  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label="ดูรูปเต็มจอ"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (dy > 90) onClose();
      }}
    >
      {scale > 0 && (
        // Thumbnail as background so something shows instantly while the full image loads.
        <img
          key={ph.u}
          src={ph.u}
          alt=""
          width={w}
          height={h}
          style={{ width: w, height: h, backgroundImage: `url("${ph.s}")`, backgroundSize: "cover" }}
          onClick={onClose}
        />
      )}
      <button className="vclose" onClick={onClose} aria-label="ปิด">✕</button>
      {photos.length > 1 && (
        <>
          {i > 0 && <button className="vnav vprev" onClick={() => go(-1)} aria-label="รูปก่อนหน้า">‹</button>}
          {i < photos.length - 1 && <button className="vnav vnext" onClick={() => go(1)} aria-label="รูปถัดไป">›</button>}
          <div className="vcount">{i + 1} / {photos.length}</div>
        </>
      )}
    </div>
  );
}
