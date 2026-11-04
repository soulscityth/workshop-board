"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colorBg } from "@/lib/colors";
import { openChannel, openDisplayWindow, type ToControl, type ToDisplay, type View } from "@/lib/present";
import { useSlideshow, type Slide } from "@/lib/slides";
import type { Column, Post } from "@/lib/types";
import BoardWall, { ZoomView, type Zoom } from "./BoardWall";
import { BlankScreen, Progress, QrCorner, QrScreen, SlideView, Stage } from "./Stage";
import { INTERVALS, useSlideSettings } from "./Slideshow";

type Mode = "board" | "slides" | "qr" | "blank";

const MODES: { mode: Mode; icon: string; label: string; key: string }[] = [
  { mode: "slides", icon: "🎞️", label: "สไลด์โชว์", key: "S" },
  { mode: "board", icon: "🧱", label: "บอร์ด", key: "W" },
  { mode: "qr", icon: "📱", label: "QR เข้าร่วม", key: "Q" },
  { mode: "blank", icon: "⬛", label: "จอดำ", key: "B" },
];

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

/** Renders a view inside a stage — used for the "now" and "next" previews. */
function Preview({ view, title, url }: { view: View; title: string; url: string }) {
  return (
    <Stage>
      {view.mode === "slides" && (
        <>
          <SlideView slide={view.slide} />
          {view.showQr && <QrCorner url={url} />}
          {view.playing && view.slide && view.multi && <Progress startedAt={view.startedAt} seconds={view.seconds} />}
        </>
      )}
      {view.mode === "qr" && <QrScreen title={title} url={url} />}
      {view.mode === "blank" && <BlankScreen />}
    </Stage>
  );
}

/**
 * The real board wall, laid out at the projector's resolution and scaled to fit the preview frame,
 * so what you scroll/click here is exactly what the room sees.
 */
function VirtualScreen({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / w));
    ro.observe(el);
    setScale(el.clientWidth / w);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className="vscreen">
      {scale > 0 && (
        <div className="vscreen-inner" style={{ width: w, height: h, transform: `scale(${scale})` }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Thumb({ slide }: { slide: Slide }) {
  return slide.photo ? (
    <img src={slide.photo.s} alt="" loading="lazy" />
  ) : (
    <span className="pc-thumb-note" style={{ background: colorBg(slide.post.k) }}>{slide.post.t.slice(0, 50)}</span>
  );
}

type Props = {
  slug: string;
  title: string;
  posts: Post[]; // filtered, newest first
  columns: Column[];
  filter: number | "all";
  filterLabel: string;
  publicUrl: string;
  onDelete: (p: Post) => void;
  onExit: () => void;
  notify: (msg: string) => void;
};

/** Canva-style presenter console: the laptop controls, the projector window shows. */
export default function Presenter({ slug, title, posts, columns, filter, filterLabel, publicUrl, onDelete, onExit, notify }: Props) {
  const cfg = useSlideSettings();
  const [mode, setMode] = useState<Mode>("qr");
  const lastNonBlank = useRef<Mode>("qr");
  const [playing, setPlaying] = useState(true);
  const ss = useSlideshow(posts, { photosOnly: cfg.photosOnly, seconds: cfg.seconds, playing: playing && mode === "slides" });
  const [alive, setAlive] = useState<{ at: number; fullscreen: boolean } | null>(null);
  const [screen, setScreen] = useState({ w: 1920, h: 1080 });
  const [zoom, setZoom] = useState<Zoom>(null);
  const wall = useRef<HTMLDivElement>(null);
  const remoteScroll = useRef(0);
  const scrollTop = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [t0, setT0] = useState(() => Date.now());
  const chan = useRef<BroadcastChannel | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const view: View = useMemo(() => {
    if (mode === "slides")
      return { mode, slide: ss.slide, startedAt: ss.startedAt, seconds: cfg.seconds, playing, showQr: cfg.showQr, multi: ss.total > 1 };
    if (mode === "board") return { mode, filter, zoom };
    return { mode };
  }, [mode, ss.slide, ss.startedAt, ss.total, cfg.seconds, cfg.showQr, playing, filter, zoom]);

  const nextView: View | null = useMemo(() => {
    if (mode !== "slides" || !ss.nextSlide) return null;
    return { mode: "slides", slide: ss.nextSlide, startedAt: 0, seconds: cfg.seconds, playing: false, showQr: cfg.showQr, multi: false };
  }, [mode, ss.nextSlide, cfg.seconds, cfg.showQr]);

  // channel to the projector window
  const latest = useRef<ToDisplay>({ t: "view", view, title });
  latest.current = { t: "view", view, title };
  useEffect(() => {
    const ch = openChannel(slug);
    chan.current = ch;
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<ToControl>) => {
      const m = e.data;
      if (m?.t === "hello") {
        ch.postMessage(latest.current);
        if (scrollTop.current) ch.postMessage({ t: "scroll", top: scrollTop.current } satisfies ToDisplay);
        setAlive({ at: Date.now(), fullscreen: false });
      } else if (m?.t === "alive") {
        setAlive({ at: Date.now(), fullscreen: m.fullscreen });
        if (m.w > 0 && m.h > 0) setScreen((s) => (s.w === m.w && s.h === m.h ? s : { w: m.w, h: m.h }));
      } else if (m?.t === "scroll") {
        // the board was scrolled directly on the projector → follow it here
        scrollTop.current = m.top;
        remoteScroll.current = Date.now() + 150;
        wall.current?.scrollTo({ top: m.top });
      } else if (m?.t === "zoom") {
        setZoom(m.zoom);
      }
    };
    ch.postMessage(latest.current);
    return () => ch.close();
  }, [slug]);
  useEffect(() => {
    chan.current?.postMessage({ t: "view", view, title } satisfies ToDisplay);
  }, [view, title]);

  // clock
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // keep the current slide visible in the filmstrip
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".pc-thumb.current");
    if (el && strip.current) {
      const s = strip.current;
      s.scrollTo({ left: el.offsetLeft - s.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
    }
  }, [ss.slide?.key, mode]);

  const choose = (m: Mode) => {
    if (m !== "blank") lastNonBlank.current = m;
    if (m !== "board") setZoom(null);
    setMode(m);
  };

  // scrolling the board preview scrolls the projector
  const scrollRaf = useRef(0);
  const onWallScroll = useCallback((top: number) => {
    scrollTop.current = top;
    if (Date.now() < remoteScroll.current) return;
    cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => chan.current?.postMessage({ t: "scroll", top } satisfies ToDisplay));
  }, []);
  const scrollBy = (dir: 1 | -1) => {
    const el = wall.current;
    if (!el) return;
    const top = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + dir * el.clientHeight * 0.8));
    scrollTop.current = top;
    remoteScroll.current = Date.now() + 800;
    el.scrollTo({ top, behavior: "smooth" });
    chan.current?.postMessage({ t: "scroll", top, smooth: true } satisfies ToDisplay);
  };
  const zoomStep = (dir: 1 | -1) =>
    setZoom((z) => (z ? { ...z, i: Math.min(z.post.p.length - 1, Math.max(0, z.i + dir)) } : z));

  // keep the zoomed post fresh (likes) and close it if the post was deleted
  useEffect(() => {
    if (!zoom) return;
    const fresh = posts.find((p) => p.id === zoom.post.id);
    if (!fresh) setZoom(null);
    else if (fresh !== zoom.post) setZoom({ post: fresh, i: Math.min(zoom.i, fresh.p.length - 1) });
  }, [posts, zoom]);
  const step = (dir: 1 | -1) => {
    if (mode !== "slides") choose("slides");
    else ss.go(dir);
  };

  // keyboard + presentation clickers (they send PageUp/PageDown/arrows/“.” for blank)
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key;
    const fwd = ["ArrowRight", "ArrowDown", "PageDown", "Enter"].includes(k);
    const back = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k);
    if (mode === "board" && zoom) {
      // a photo is expanded: arrows move through that post's photos, Esc closes
      if (k === "Escape" || k === "Backspace") { e.preventDefault(); return setZoom(null); }
      if (fwd) { e.preventDefault(); return zoomStep(1); }
      if (back) { e.preventDefault(); return zoomStep(-1); }
    } else if (mode === "board" && (fwd || back)) {
      // board mode: clickers / arrows scroll the wall
      e.preventDefault();
      return scrollBy(fwd ? 1 : -1);
    }
    if (fwd) { e.preventDefault(); step(1); }
    else if (back) { e.preventDefault(); step(-1); }
    else if (k === " ") { e.preventDefault(); setPlaying((p) => !p); if (mode !== "slides") choose("slides"); }
    else if (k === "b" || k === "B" || k === "." || k === "ิ") { choose(mode === "blank" ? lastNonBlank.current : "blank"); }
    else if (k === "q" || k === "Q" || k === "ๆ") choose("qr");
    else if (k === "w" || k === "W" || k === "ไ") choose("board");
    else if (k === "s" || k === "S" || k === "ห") choose("slides");
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, []);

  const connected = !!alive && now - alive.at < 5000;
  const openDisplay = () => {
    const w = openDisplayWindow(slug);
    if (!w) notify("เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้");
  };

  return (
    <div className="presenter" role="dialog" aria-modal="true" aria-label="โหมดผู้นำเสนอ">
      <header className="pc-top">
        <div className="pc-brand">
          <strong>โหมดผู้นำเสนอ</strong>
          <span className="pc-sub">{title}{filterLabel ? ` · ${filterLabel}` : ""}</span>
        </div>
        <div className={`pc-status ${connected ? "ok" : ""}`}>
          <i />
          {connected ? (alive!.fullscreen ? "จอแสดงผลเชื่อมต่อแล้ว · เต็มจอ" : "เชื่อมต่อแล้ว · คลิกที่จอโปรเจกเตอร์เพื่อเต็มจอ") : "ยังไม่ได้เปิดจอแสดงผล"}
        </div>
        <button className="pc-btn" onClick={openDisplay}>{connected ? "เปิดจอแสดงผลอีกครั้ง" : "🖥️ เปิดจอแสดงผล"}</button>
        <div className="pc-timer" title="เวลาที่ใช้ไป">
          ⏱ {fmt(now - t0)}
          <button onClick={() => setT0(Date.now())} aria-label="เริ่มจับเวลาใหม่">↺</button>
        </div>
        <button className="pc-btn pc-exit" onClick={onExit}>ออกจากโหมดผู้นำเสนอ</button>
      </header>

      <main className="pc-main">
        <section className="pc-now">
          <div className="pc-label">
            <span className="pc-live">● บนจอตอนนี้</span>
            {mode === "slides" && ss.total > 0 && <span>สไลด์ {ss.index + 1} / {ss.total}</span>}
          </div>
          <div className="pc-frame" style={{ aspectRatio: `${screen.w} / ${screen.h}` }}>
            {mode === "board" ? (
              <VirtualScreen w={screen.w} h={screen.h}>
                <BoardWall
                  ref={wall}
                  posts={posts}
                  columns={columns}
                  filter={filter}
                  title={title}
                  publicUrl={publicUrl}
                  width={screen.w}
                  onScroll={onWallScroll}
                  onOpen={(p, i) => setZoom({ post: p, i })}
                />
                {zoom && <ZoomView zoom={zoom} onClose={() => setZoom(null)} />}
              </VirtualScreen>
            ) : (
              <Preview view={view} title={title} url={publicUrl} />
            )}
          </div>
          {mode === "board" ? (
            <div className="pc-controls">
              {zoom ? (
                <>
                  <button className="pc-big" onClick={() => zoomStep(-1)} disabled={zoom.i === 0} aria-label="รูปก่อนหน้า">‹</button>
                  <button className="pc-big pc-play" onClick={() => setZoom(null)}>✕ ปิดรูป กลับไปที่บอร์ด</button>
                  <button className="pc-big" onClick={() => zoomStep(1)} disabled={zoom.i >= zoom.post.p.length - 1} aria-label="รูปถัดไป">›</button>
                </>
              ) : (
                <>
                  <button className="pc-big" onClick={() => scrollBy(-1)} aria-label="เลื่อนขึ้น">↑</button>
                  <span className="pc-hint">เลื่อนบอร์ดในกรอบด้านบนได้เลย · คลิกรูปเพื่อขยายบนจอ</span>
                  <button className="pc-big" onClick={() => scrollBy(1)} aria-label="เลื่อนลง">↓</button>
                </>
              )}
            </div>
          ) : (
          <div className="pc-controls">
            <button className="pc-big" onClick={() => step(-1)} aria-label="ก่อนหน้า">‹</button>
            <button className="pc-big pc-play" onClick={() => { setPlaying((p) => !p); if (mode !== "slides") choose("slides"); }}>
              {playing && mode === "slides" ? "❚❚ หยุดเล่นอัตโนมัติ" : "▶ เล่นอัตโนมัติ"}
            </button>
            <button className="pc-big" onClick={() => step(1)} aria-label="ถัดไป">›</button>
          </div>
          )}
        </section>

        <aside className="pc-side">
          <div>
            <div className="pc-label"><span>ถัดไป</span></div>
            <div className="pc-frame pc-next">
              {nextView ? (
                <Preview view={nextView} title={title} url={publicUrl} />
              ) : (
                <div className="pc-next-empty">{mode === "slides" ? "ไม่มีสไลด์ถัดไป" : "กด › เพื่อเริ่มสไลด์โชว์"}</div>
              )}
            </div>
            {ss.nextSlide && mode === "slides" && ss.isNew(ss.nextSlide.key) && <p className="pc-new-note">✨ โพสต์ใหม่ จะขึ้นจอถัดไป</p>}
          </div>

          <div>
            <div className="pc-label"><span>แสดงบนจอ</span></div>
            <div className="pc-modes">
              {MODES.map((m) => (
                <button key={m.mode} className={`pc-mode ${mode === m.mode ? "on" : ""}`} onClick={() => choose(m.mode)}>
                  <span className="pc-mode-icon">{m.icon}</span>
                  {m.label}
                  <kbd>{m.key}</kbd>
                </button>
              ))}
            </div>
          </div>

          <div className="pc-settings">
            <label>
              เวลาต่อสไลด์
              <select value={cfg.seconds} onChange={(e) => cfg.setSeconds(Number(e.target.value))}>
                {INTERVALS.map((s) => <option key={s} value={s}>{s} วินาที</option>)}
              </select>
            </label>
            <label className="pc-check"><input type="checkbox" checked={cfg.photosOnly} onChange={(e) => cfg.setPhotosOnly(e.target.checked)} /> เฉพาะโพสต์ที่มีรูป</label>
            <label className="pc-check"><input type="checkbox" checked={cfg.showQr} onChange={(e) => cfg.setShowQr(e.target.checked)} /> QR มุมจอระหว่างสไลด์</label>
          </div>

          <p className="pc-keys">
            คีย์ลัด: ← → เปลี่ยนสไลด์ · Space เล่น/หยุด · B จอดำ<br />
            โหมดบอร์ด: ↑ ↓ / PageUp PageDown เลื่อนบอร์ด · คลิกรูปเพื่อขยาย · Esc ปิดรูป<br />
            ใช้กับรีโมตพรีเซนต์ได้
          </p>
        </aside>
      </main>

      <footer className="pc-strip-wrap">
        <div className="pc-strip-head">
          <span>สไลด์ทั้งหมด {ss.total} · คลิกเพื่อขึ้นจอ</span>
        </div>
        <div className="pc-strip" ref={strip}>
          {ss.slides.length === 0 && <span className="pc-strip-empty">ยังไม่มีโพสต์ — โพสต์ใหม่จะปรากฏที่นี่อัตโนมัติ</span>}
          {ss.slides.map((s, i) => (
            <div key={s.key} className={`pc-thumb ${mode === "slides" && ss.slide?.key === s.key ? "current" : ""}`}>
              <button className="pc-thumb-btn" onClick={() => { choose("slides"); ss.goTo(s.key); }} aria-label={`แสดงสไลด์ ${i + 1}`}>
                <Thumb slide={s} />
                <span className="pc-thumb-n">{i + 1}</span>
                {ss.isNew(s.key) && <span className="pc-thumb-new">ใหม่</span>}
              </button>
              <button className="pc-thumb-del" onClick={() => onDelete(s.post)} aria-label="ลบโพสต์นี้" title="ลบโพสต์">✕</button>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
