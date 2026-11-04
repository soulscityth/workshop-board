"use client";
import { useEffect, useState } from "react";
import { colorBg } from "@/lib/colors";
import type { Slide } from "@/lib/slides";
import type { Post } from "@/lib/types";
import Qr from "./Qr";
import { timeAgo } from "./PostCard";

/**
 * Everything the audience sees is drawn inside a `.stage` box that sizes its contents with
 * container-query units, so the same markup renders full-screen on the projector and as small
 * previews in the presenter console.
 */
export function Stage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`stage ${className}`}>{children}</div>;
}

export function SlideView({ slide, emptyText = "ยังไม่มีโพสต์ในบอร์ดนี้" }: { slide: Slide | null; emptyText?: string }) {
  if (!slide) {
    return (
      <div className="ss-empty">
        <div className="ss-empty-icon">🖼️</div>
        <p>{emptyText}</p>
      </div>
    );
  }
  const p = slide.post;
  const meta = (
    <>
      {p.a ?? "ไม่ระบุชื่อ"} · {timeAgo(p.at)}
      {slide.photo && p.p.length > 1 && ` · รูป ${(slide.idx ?? 0) + 1}/${p.p.length}`}
      {p.l > 0 && ` · ♥ ${p.l}`}
    </>
  );
  if (slide.photo) {
    return (
      <div className="ss-slide" key={slide.key}>
        <img className="ss-bg" src={slide.photo.s} alt="" aria-hidden />
        <img className="ss-img" src={slide.photo.u} alt="" style={{ backgroundImage: `url("${slide.photo.s}")` }} />
        {(p.t || p.a) && (
          <div className="ss-caption">
            {p.t && <p className="ss-text">{p.t}</p>}
            <p className="ss-who">{meta}</p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="ss-slide ss-note-wrap" key={slide.key}>
      <div className="ss-note" style={{ background: colorBg(p.k) }}>
        <p className="ss-note-text">{p.t}</p>
        <p className="ss-who dark">{meta}</p>
      </div>
    </div>
  );
}

export function QrCorner({ url }: { url: string }) {
  return (
    <div className="ss-qr">
      <Qr value={url} className="ss-qr-code" />
      <span>สแกนเพื่อโพสต์</span>
    </div>
  );
}

/** Progress bar synced to a start time, so every view of the same slide shows the same progress. */
export function Progress({ startedAt, seconds }: { startedAt: number; seconds: number }) {
  const [delay, setDelay] = useState(0);
  useEffect(() => setDelay(Math.min(seconds * 1000, Math.max(0, Date.now() - startedAt))), [startedAt, seconds]);
  return (
    <div
      className="ss-progress"
      key={`${startedAt}-${seconds}`}
      style={{ animationDuration: `${seconds}s`, animationDelay: `-${delay}ms` }}
    />
  );
}

export function QrScreen({ title, url }: { title: string; url: string }) {
  return (
    <div className="qr-screen">
      <div className="qr-screen-card">
        <Qr value={url} className="qr-screen-code" />
      </div>
      <div className="qr-screen-text">
        <p className="qr-screen-kicker">สแกนเพื่อเข้าร่วมบอร์ด</p>
        <h2 className="qr-screen-title">{title}</h2>
        <p className="qr-screen-url">{url.replace(/^https?:\/\//, "")}</p>
        <p className="qr-screen-hint">ไม่ต้องสมัคร ไม่ต้องล็อกอิน · โพสต์ข้อความและรูปได้เลย</p>
      </div>
    </div>
  );
}

export function BlankScreen() {
  return <div className="blank-screen" />;
}

/** Lightweight board preview for the console (the real display renders the full live wall). */
export function BoardPreview({ posts, title }: { posts: Post[]; title: string }) {
  const latest = posts.slice(0, 8);
  return (
    <div className="board-preview">
      <p className="board-preview-title">{title}</p>
      <div className="board-preview-grid">
        {latest.map((p) => (
          <div key={p.id} className="board-preview-card" style={{ background: colorBg(p.k) }}>
            {p.p[0] ? <img src={p.p[0].s} alt="" /> : <span>{p.t.slice(0, 60)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
