"use client";
// localStorage can throw (private mode, blocked storage) — every access is guarded.
const mem = new Map<string, string>();

export function getItem(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {}
  return mem.get(key) ?? null;
}
export function setItem(key: string, value: string) {
  mem.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}
export function getJSON<T>(key: string, fallback: T): T {
  try {
    const v = getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function setJSON(key: string, value: unknown) {
  setItem(key, JSON.stringify(value));
}

export function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return mem.get("s:" + key) ?? null;
  }
}
export function sessionSet(key: string, value: string) {
  mem.set("s:" + key, value);
  try {
    window.sessionStorage.setItem(key, value);
  } catch {}
}

export function deviceId(): string {
  let id = getItem("wb:device");
  if (!id || !/^[A-Za-z0-9_-]{10,64}$/.test(id)) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    setItem("wb:device", id);
  }
  return id;
}
