"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openChannel, type ToControl, type ToDisplay, type View } from "@/lib/present";
import { useFeed } from "@/lib/useFeed";
import BoardWall, { ZoomView } from "./BoardWall";
import { BlankScreen, Progress, QrCorner, QrScreen, SlideView, Stage } from "./Stage";

/** Audience window for the projector. Shows whatever the presenter console sends. */
export default function Display({ slug, initialTitle }: { slug: string; initialTitle: string }) {
  const { meta, posts } = useFeed(slug, initialTitle);
  const [view, setView] = useState<View | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [fs, setFs] = useState(false);
  const [idle, setIdle] = useState(false);
  const [origin, setOrigin] = useState("");
  const idleTimer = useRef<number | undefined>(undefined);
  const [width, setWidth] = useState(1920);
  const chan = useRef<BroadcastChannel | null>(null);
  const wall = useRef<HTMLDivElement>(null);
  const remoteScroll = useRef(0); // ignore scroll events caused by the console for a moment
  const pendingTop = useRef<number | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    const size = () => setWidth(window.innerWidth);
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, []);

  const applyScroll = useCallback((top: number, smooth?: boolean) => {
    const el = wall.current;
    if (!el) {
      pendingTop.current = top;
      return;
    }
    remoteScroll.current = Date.now() + (smooth ? 800 : 150);
    el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // channel: receive views, announce ourselves, heartbeat
  useEffect(() => {
    const ch = openChannel(slug);
    chan.current = ch;
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<ToDisplay>) => {
      if (e.data?.t === "view") {
        setView(e.data.view);
        setTitle(e.data.title);
      } else if (e.data?.t === "scroll") {
        applyScroll(e.data.top, e.data.smooth);
      }
    };
    const send = (m: ToControl) => ch.postMessage(m);
    const alive = () => send({ t: "alive", fullscreen: !!document.fullscreenElement, w: window.innerWidth, h: window.innerHeight });
    send({ t: "hello" });
    alive();
    const hb = window.setInterval(alive, 2000);
    window.addEventListener("resize", alive);
    return () => {
      window.clearInterval(hb);
      window.removeEventListener("resize", alive);
      ch.close();
    };
  }, [slug, applyScroll]);

  // a scroll that arrived before the wall was mounted
  useEffect(() => {
    if (view?.mode === "board" && wall.current && pendingTop.current != null) {
      applyScroll(pendingTop.current);
      pendingTop.current = null;
    }
  });

  const scrollRaf = useRef(0);
  const onWallScroll = (top: number) => {
    if (Date.now() < remoteScroll.current) return;
    cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => chan.current?.postMessage({ t: "scroll", top } satisfies ToControl));
  };

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
      <>
        <BoardWall
          ref={wall}
          posts={visible}
          columns={meta.columns}
          filter={filter}
          title={title}
          publicUrl={origin ? publicUrl : ""}
          width={width}
          onScroll={onWallScroll}
          onOpen={(p, i) => chan.current?.postMessage({ t: "zoom", zoom: { post: p, i } } satisfies ToControl)}
        />
        {view.zoom && (
          <ZoomView zoom={view.zoom} onClose={() => chan.current?.postMessage({ t: "zoom", zoom: null } satisfies ToControl)} />
        )}
      </>
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
