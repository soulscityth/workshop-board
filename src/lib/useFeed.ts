"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardMeta, FeedResponse, Post } from "./types";

const POLL_MS = 4000;

/** Polls the (CDN-cached) feed and keeps a Map of posts. Shared by the board and the projector display. */
export function useFeed(slug: string, initialTitle: string, onGone?: () => void) {
  const [meta, setMeta] = useState<BoardMeta>({ slug, title: initialTitle, locked: false, columns: [] });
  const [posts, setPosts] = useState<Map<number, Post>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const version = useRef(0);
  /** Optimistic like counts that should win over (possibly cached) poll results for a few seconds. */
  const likeHold = useRef(new Map<number, { likes: number; until: number }>());
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  const apply = useCallback((data: FeedResponse) => {
    setMeta(data.board);
    const now = Date.now();
    setPosts((prev) => {
      if (!data.reset && data.posts.length === 0 && data.deleted.length === 0) return prev;
      const next = data.reset ? new Map<number, Post>() : new Map(prev);
      for (const p of data.posts) {
        const hold = likeHold.current.get(p.id);
        const old = prev.get(p.id);
        let np = hold && hold.until > now ? { ...p, l: hold.likes } : p;
        // keep object identity when nothing changed → memoised cards don't re-render
        if (old && old.l === np.l && old.t === np.t && old.k === np.k && old.c === np.c && old.p.length === np.p.length) np = old;
        next.set(p.id, np);
      }
      for (const id of data.deleted) next.delete(id);
      return next;
    });
    version.current = data.version;
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let failures = 0;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/b/${slug}/feed?since=${version.current}`);
        if (res.status === 404) {
          goneRef.current?.();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        apply(await res.json());
        failures = 0;
        setOffline(false);
        setLoaded(true);
      } catch {
        failures++;
        if (failures >= 2) setOffline(true);
      }
      const backoff = failures ? Math.min(30000, POLL_MS * 2 ** failures) : POLL_MS;
      timer = window.setTimeout(tick, backoff + Math.random() * 800);
    };
    void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slug, apply]);

  return { meta, setMeta, posts, setPosts, loaded, offline, likeHold };
}

export function useColumnCount() {
  const [n, setN] = useState(2);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setN(w < 340 ? 1 : w < 720 ? 2 : w < 1040 ? 3 : w < 1360 ? 4 : 5);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return n;
}
