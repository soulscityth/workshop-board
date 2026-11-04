"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openChannel, type ToControl, type ToDisplay, type View } from "@/lib/present";
import { useColumnCount, useFeed } from "@/lib/useFeed";
import Masonry from "./Masonry";
import PostCard from "./PostCard";
import Qr from "./Qr";
import { BlankScreen, Progress, QrCorner, QrScreen, SlideView, Stage } from "./Stage";

const noop = () => {};

/** Audience window for the projector. Shows whatever the presenter console sends. */
export default function Display({ slug, initialTitle }: { slug: string; initialTitle: string }) {
  const { meta, posts } = useFeed(slug, initialTitle);
  const [view, setView] = useState<View | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [fs, setFs] = useState(false);
  const [idle, setIdle] = useState(false);
  const [origin, setOrigin] = useState("");
  const idleTimer = useRef<number | undefined>(undefined);
  const cols = useColumnCount();

  useEffect(() => setOrigin(window.location.origin), []);

  // channel: receive views, announce ourselves, heartbeat
  useEffect(() => {
    const ch = openChannel(slug);
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<ToDisplay>) => {
      if (e.data?.t === "view") {
        setView(e.data.view);
        setTitle(e.data.title);
      }
    };
    const send = (m: ToControl) => ch.postMessage(m);
    send({ t: "hello" });
    const hb = window.setInterval(() => send({ t: "alive", fullscreen: !!document.fullscreenElement }), 2000);
    return () => {
      window.clearInterval(hb);
      ch.close();
    };
  }, [slug]);

  // fullscreen state + wake lock + hide cursor when idle
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const getLock = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    getLock();
    const onVis = () => document.visibilityState === "visible" && getLock();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  const poke = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
  }, []);
  useEffect(() => {
    poke();
    return () => window.clearTimeout(idleTimer.current);
  }, [poke]);

  const goFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const publicUrl = `${origin}/b/${slug}`;
  const filter = view?.mode === "board" ? view.filter : "all";
  const visible = useMemo(() => {
    const arr = [...posts.values()].filter((p) => filter === "all" || p.c === filter);
    return arr.sort((a, b) => b.id - a.id);
  }, [posts, filter]);
  const colName = useMemo(() => new Map(meta.columns.map((c) => [c.id, c.name])), [meta.columns]);

  let body: React.ReactNode;
  if (!view) {
    body = (
      <Stage>
        {origin && <QrScreen title={title} url={publicUrl} />}
        <div className="display-waiting">รอการเชื่อมต่อจากหน้าควบคุมของผู้นำเสนอ…</div>
      </Stage>
    );
  } else if (view.mode === "board") {
    body = (
      <div className="display-board">
        <header className="display-board-head">
          <h1>{title}{filter !== "all" && colName.get(filter) ? ` · ${colName.get(filter)}` : ""}</h1>
          {origin && (
            <div className="display-board-join">
              <span>สแกนเพื่อโพสต์<br /><b>{publicUrl.replace(/^https?:\/\//, "")}</b></span>
              <Qr value={publicUrl} className="display-board-qr" />
            </div>
          )}
        </header>
        <div className="masonry">
          <Masonry
            items={visible}
            cols={Math.max(cols, 3)}
            render={(p, wide, width) => (
              <PostCard post={p} wide={wide} sizes={`${Math.round(width)}px`} liked={false}
                columnName={filter === "all" && p.c != null ? colName.get(p.c) : undefined}
                isAdmin={false} onLike={noop} onOpen={noop} onDelete={noop} />
            )}
          />
        </div>
      </div>
    );
  } else if (view.mode === "slides") {
    body = (
      <Stage>
        <SlideView slide={view.slide} />
        {view.showQr && origin && <QrCorner url={publicUrl} />}
        {view.playing && view.slide && view.multi && <Progress startedAt={view.startedAt} seconds={view.seconds} />}
      </Stage>
    );
  } else if (view.mode === "qr") {
    body = <Stage>{origin && <QrScreen title={title} url={publicUrl} />}</Stage>;
  } else {
    body = <Stage><BlankScreen /></Stage>;
  }

  return (
    <div className={`display ${idle ? "idle" : ""}`} onMouseMove={poke} onClick={goFullscreen}
      onDoubleClick={() => (document.fullscreenElement ? document.exitFullscreen?.() : goFullscreen())}>
      {body}
      {!fs && (
        <button className="fs-hint" onClick={goFullscreen}>
          ⛶ คลิกที่หน้าจอนี้เพื่อแสดงเต็มจอ
          <small>ถ้าหน้าต่างนี้ยังไม่อยู่บนจอโปรเจกเตอร์ ให้ลากไปก่อน</small>
        </button>
      )}
    </div>
  );
}
