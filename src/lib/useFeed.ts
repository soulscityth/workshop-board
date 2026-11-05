"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardMeta, FeedResponse, Post } from "./types";

export type FeedPace = {
  /** interval while things are changing / right after the user acts */
  fastMs: number;
  /** slowest interval while the user is using the page but nothing changes */
  maxMs: number;
  /** slow down further when nobody has touched the page for idleAfterMs (phones lying on the table) */
  trackIdle: boolean;
  idleAfterMs: number;
  idleMaxMs: number;
};

/** Participants' phones: every poll is a Vercel Edge Request, counted against the team-wide monthly quota. */
export const PHONE_PACE: FeedPace = { fastMs: 4000, maxMs: 12000, trackIdle: true, idleAfterMs: 60_000, idleMaxMs: 30_000 };
/** Projector / presenter console: one device each and nobody touches it, so keep it lively. */
export const SCREEN_PACE: FeedPace = { fastMs: 4000, maxMs: 8000, trackIdle: false, idleAfterMs: 0, idleMaxMs: 8000 };

/**
 * Polls the (CDN-cached) feed and keeps a Map of posts. Shared by the board and the projector display.
 * Adaptive: 4s while posts are changing, backing off ×1.5 per quiet poll up to maxMs, and to idleMaxMs when
 * nobody has touched the page for a minute. Any touch/scroll/key, or kick(), polls right away and goes fast again.
 */
export function useFeed(slug: string, initialTitle: string, onGone?: () => void, pace: FeedPace = PHONE_PACE) {
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

  const paceRef = useRef(pace);
  paceRef.current = pace;
  const kickRef = useRef<() => void>(() => {});
  /** Call after the user does something (posts, likes): poll soon and stay fast for a while. */
  const kick = useCallback(() => kickRef.current(), []);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let failures = 0;
    let inFlight = false;
    let delay = paceRef.current.fastMs;
    let lastPollAt = 0;
    let lastInput = Date.now();

    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped) return;
      const p = paceRef.current;
      let wait: number;
      if (failures) wait = Math.min(30000, p.fastMs * 2 ** failures);
      else {
        const idle = p.trackIdle && Date.now() - lastInput > p.idleAfterMs;
        wait = Math.min(idle ? p.idleMaxMs : p.maxMs, delay);
      }
      timer = window.setTimeout(tick, wait + Math.random() * 800);
    };

    const tick = async () => {
      if (stopped || inFlight) return;
      if (document.visibilityState === "hidden") {
        // no requests while the tab is in the background; check again later
        timer = window.setTimeout(tick, paceRef.current.fastMs);
        return;
      }
      inFlight = true;
      lastPollAt = Date.now();
      try {
        const before = version.current;
        const res = await fetch(`/api/b/${slug}/feed?since=${version.current}`);
        if (res.status === 404) {
          goneRef.current?.();
          stopped = true;
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data: FeedResponse = await res.json();
        apply(data);
        const changed = data.version !== before || data.posts.length > 0 || data.deleted.length > 0;
        const p = paceRef.current;
        delay = changed ? p.fastMs : Math.min(Math.max(p.maxMs, p.idleMaxMs), Math.round(delay * 1.5));
        failures = 0;
        setOffline(false);
        setLoaded(true);
      } catch {
        failures++;
        if (failures >= 2) setOffline(true);
      } finally {
        inFlight = false;
      }
      schedule();
    };

    // user is back: poll now (if the last one isn't fresh) and go fast again
    const wake = () => {
      delay = paceRef.current.fastMs;
      if (Date.now() - lastPollAt > paceRef.current.fastMs && !inFlight) {
        window.clearTimeout(timer);
        void tick();
      }
    };
    kickRef.current = wake;
    let lastWake = 0;
    const onInput = () => {
      const now = Date.now();
      const wasIdle = paceRef.current.trackIdle && now - lastInput > paceRef.current.idleAfterMs;
      lastInput = now;
      if (wasIdle || now - lastWake > 10_000) {
        lastWake = now;
        if (wasIdle) wake();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        lastInput = Date.now();
        wake();
      }
    };
    const inputs = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"] as const;
    inputs.forEach((ev) => window.addEventListener(ev, onInput, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      kickRef.current = () => {};
      inputs.forEach((ev) => window.removeEventListener(ev, onInput));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slug, apply]);

  return { meta, setMeta, posts, setPosts, loaded, offline, likeHold, kick };
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
