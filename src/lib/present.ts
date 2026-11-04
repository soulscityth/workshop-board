"use client";
import type { Slide } from "./slides";

/** What the projector should show. The presenter console is the single source of truth. */
export type View =
  | { mode: "board"; filter: number | "all" }
  | { mode: "slides"; slide: Slide | null; startedAt: number; seconds: number; playing: boolean; showQr: boolean; multi: boolean }
  | { mode: "qr" }
  | { mode: "blank" };

export type ToDisplay = { t: "view"; view: View; title: string };
export type ToControl = { t: "hello" } | { t: "alive"; fullscreen: boolean };

/** Both windows live in the same browser on the facilitator's laptop, so BroadcastChannel is enough. */
export function openChannel(slug: string): BroadcastChannel | null {
  try {
    return new BroadcastChannel(`wb-present-${slug}`);
  } catch {
    return null;
  }
}

type ScreenDetailed = { availLeft: number; availTop: number; availWidth: number; availHeight: number };
type ScreenDetails = { screens: ScreenDetailed[]; currentScreen: ScreenDetailed };

/**
 * Open the audience window. Must be called from a click handler (popup rules).
 * On Chromium with the Window Management API, also move it onto the other (extended) screen.
 */
export function openDisplayWindow(slug: string): Window | null {
  const w = window.open(`/b/${slug}/present`, `wb-display-${slug}`, "popup=yes,width=1280,height=720");
  const wm = window as Window & { getScreenDetails?: () => Promise<ScreenDetails> };
  if (w && wm.getScreenDetails) {
    wm.getScreenDetails()
      .then((d) => {
        const other = d.screens.find((s) => s !== d.currentScreen);
        if (!other) return;
        w.moveTo(other.availLeft, other.availTop);
        w.resizeTo(other.availWidth, other.availHeight);
      })
      .catch(() => {});
  }
  return w;
}
