"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { COLORS } from "@/lib/colors";
import { processImage, type Processed } from "@/lib/image";
import { getItem, setItem } from "@/lib/storage";
import type { Column, Photo, Post } from "@/lib/types";
import { IconCamera, IconImage } from "./icons";

const MAX_PHOTOS = 6;

type Item = {
  id: string;
  file: File;
  status: "queued" | "processing" | "uploading" | "done" | "error";
  progress: number; // 0..100
  error?: string;
  preview?: string;
  processed?: Processed;
  thumbUrl?: string;
  fullUrl?: string;
};

type Props = {
  open: boolean;
  slug: string;
  device: string;
  columns: Column[];
  defaultColumn: number | null;
  locked: boolean;
  onClose: () => void;
  onPosted: (p: Post) => void;
};

const STALL_MS = 20000;

/**
 * Blob's client retries up to 10× with backoff, which on bad venue Wi-Fi can look frozen for minutes.
 * Abort if no progress for STALL_MS so the participant gets a clear "tap to retry" instead.
 */
async function uploadWithWatchdog(
  pathname: string,
  body: Blob,
  opts: Omit<Parameters<typeof upload>[2], "abortSignal">,
  onProgress: (loaded: number) => void,
) {
  const ctrl = new AbortController();
  let timer = window.setTimeout(() => ctrl.abort(), STALL_MS);
  const bump = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ctrl.abort(), STALL_MS);
  };
  const offline = () => ctrl.abort();
  window.addEventListener("offline", offline);
  try {
    return await upload(pathname, body, {
      ...opts,
      abortSignal: ctrl.signal,
      onUploadProgress: (e) => {
        bump();
        onProgress(e.loaded);
      },
    });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error("stalled");
    throw e;
  } finally {
    window.clearTimeout(timer);
    window.removeEventListener("offline", offline);
  }
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export default function Composer({ open, slug, device, columns, defaultColumn, locked, onClose, onPosted }: Props) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [color, setColor] = useState("yellow");
  const [column, setColumn] = useState<number | null>(defaultColumn);
  const [name, setName] = useState("");
  const [anon, setAnon] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  const running = useRef(false);
  itemsRef.current = items;

  useEffect(() => {
    setName(getItem("wb:name") ?? "");
    setAnon(getItem("wb:anon") === "1");
    setColor(getItem("wb:color") ?? "yellow");
  }, []);

  useEffect(() => {
    if (open) setColumn((c) => (defaultColumn ?? c ?? columns[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultColumn]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const patch = (id: string, p: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));

  /** Process + upload one photo at a time (keeps phone memory low, still fast). */
  async function pump() {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((it) => it.status === "queued");
        if (!next) break;
        await runItem(next);
      }
    } finally {
      running.current = false;
    }
  }

  async function runItem(item: Item) {
    let processed = item.processed;
    try {
      if (!processed) {
        patch(item.id, { status: "processing", progress: 0, error: undefined });
        processed = await processImage(item.file);
        patch(item.id, { processed, preview: URL.createObjectURL(processed.thumb) });
      }
      patch(item.id, { status: "uploading", error: undefined });
      const total = processed.thumb.size + processed.full.size;
      const opts = {
        access: "public" as const,
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ slug, device }),
        contentType: "image/jpeg",
      };
      const progress = (offset: number) => (loaded: number) =>
        patch(item.id, { progress: Math.min(99, Math.round(((offset + loaded) / total) * 100)) });
      let thumbUrl = itemsRef.current.find((x) => x.id === item.id)?.thumbUrl;
      if (!thumbUrl) {
        thumbUrl = (await uploadWithWatchdog(`b/${slug}/${rid()}_s.jpg`, processed.thumb, opts, progress(0))).url;
        patch(item.id, { thumbUrl });
      }
      const fullUrl = (
        await uploadWithWatchdog(`b/${slug}/${rid()}.jpg`, processed.full, opts, progress(processed.thumb.size))
      ).url;
      patch(item.id, { fullUrl, status: "done", progress: 100 });
    } catch (e) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const raw = e instanceof Error ? e.message : "";
      const msg = offline
        ? "ไม่มีอินเทอร์เน็ต"
        : /10 MB|รองรับ|เปิดไฟล์/.test(raw)
          ? raw
          : /locked/.test(raw)
            ? "บอร์ดถูกล็อก"
            : /rate/.test(raw)
              ? "อัปโหลดถี่เกินไป รอสักครู่"
              : raw === "stalled"
                ? "สัญญาณช้า อัปโหลดไม่สำเร็จ"
                : "อัปโหลดไม่สำเร็จ";
      patch(item.id, { status: "error", error: msg, processed });
      // Not-an-image / too-large errors cannot be retried; drop the file reference
      if (/10 MB|รองรับ|เปิดไฟล์/.test(raw)) patch(item.id, { processed: undefined });
    }
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    const room = MAX_PHOTOS - items.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) setError(`เพิ่มรูปได้สูงสุด ${MAX_PHOTOS} รูปต่อโพสต์`);
    const fresh: Item[] = files.map((file) =>
      file.size > 10 * 1024 * 1024
        ? { id: rid(), file, status: "error", progress: 0, error: "ไฟล์ใหญ่เกิน 10 MB" }
        : { id: rid(), file, status: "queued", progress: 0 },
    );
    itemsRef.current = [...itemsRef.current, ...fresh];
    setItems(itemsRef.current);
    void pump();
  }

  function retry(it: Item) {
    if (it.error === "ไฟล์ใหญ่เกิน 10 MB" || /รองรับ|เปิดไฟล์/.test(it.error || "")) return remove(it);
    itemsRef.current = itemsRef.current.map((x) => (x.id === it.id ? { ...x, status: "queued", error: undefined } : x));
    setItems(itemsRef.current);
    void pump();
  }

  function remove(it: Item) {
    if (it.preview) URL.revokeObjectURL(it.preview);
    itemsRef.current = itemsRef.current.filter((x) => x.id !== it.id);
    setItems(itemsRef.current);
  }

  function reset() {
    items.forEach((it) => it.preview && URL.revokeObjectURL(it.preview));
    itemsRef.current = [];
    setItems([]);
    setText("");
    setError("");
  }

  const pending = items.filter((it) => it.status !== "done" && it.status !== "error").length;
  const failed = items.filter((it) => it.status === "error").length;
  const done = items.filter((it) => it.status === "done");
  const canSend = !sending && !locked && pending === 0 && failed === 0 && (text.trim().length > 0 || done.length > 0);

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    setItem("wb:name", name.trim());
    setItem("wb:anon", anon ? "1" : "0");
    setItem("wb:color", color);
    try {
      const photos: Photo[] = done.map((it) => ({
        u: it.fullUrl!,
        s: it.thumbUrl!,
        w: it.processed?.w ?? 1,
        h: it.processed?.h ?? 1,
        sw: it.processed?.sw,
      }));
      const res = await fetch(`/api/b/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device, text, author: anon ? null : name.trim() || null, color, column, photos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "โพสต์ไม่สำเร็จ กรุณาลองใหม่");
      onPosted(data.post);
      reset();
      onClose();
    } catch (e) {
      setError(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "ไม่มีอินเทอร์เน็ต — ข้อความยังอยู่ กดโพสต์อีกครั้งเมื่อเชื่อมต่อได้"
          : e instanceof Error ? e.message : "โพสต์ไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setSending(false);
    }
  }

  const close = () => {
    if (sending) return;
    onClose(); // draft is kept while the sheet is closed
  };

  if (!open) return null;

  let sendLabel = "โพสต์";
  if (sending) sendLabel = "กำลังโพสต์…";
  else if (pending > 0) sendLabel = `กำลังอัปโหลดรูป (${done.length}/${items.length - failed})…`;
  else if (failed > 0) sendLabel = "มีรูปที่อัปโหลดไม่สำเร็จ";

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="composer-title" style={{ paddingBottom: 0 }}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2 id="composer-title">โพสต์ใหม่</h2>
          <button className="btn btn-ghost btn-sm" onClick={close}>ปิด</button>
        </div>

        <div className="stack">
          {locked && <p className="warn">บอร์ดถูกล็อกแล้ว ไม่สามารถโพสต์เพิ่มได้</p>}

          <div className="photo-btns">
            <button type="button" className="photo-btn" onClick={() => cameraRef.current?.click()} disabled={items.length >= MAX_PHOTOS}>
              <IconCamera /> ถ่ายรูป
            </button>
            <button type="button" className="photo-btn" onClick={() => galleryRef.current?.click()} disabled={items.length >= MAX_PHOTOS}>
              <IconImage /> เลือกจากคลังภาพ
            </button>
            <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" tabIndex={-1}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={galleryRef} className="sr-only" type="file" accept="image/*,.heic,.heif" multiple tabIndex={-1}
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </div>

          {items.length > 0 && (
            <div className="thumbs">
              {items.map((it) => (
                <div key={it.id} className={`thumb ${it.status === "error" ? "err" : ""}`}>
                  {it.preview && <img src={it.preview} alt="" />}
                  {it.status === "error" ? (
                    <button className="retry" onClick={() => retry(it)}>
                      <span>⚠️ {it.error}</span>
                      <strong>{/10 MB|รองรับ|เปิดไฟล์/.test(it.error || "") ? "แตะเพื่อเอาออก" : "แตะเพื่อลองใหม่"}</strong>
                    </button>
                  ) : (
                    <>
                      <button className="x" onClick={() => remove(it)} aria-label="เอารูปออก">×</button>
                      {it.status !== "done" && (
                        <div className="state">
                          {it.status === "queued" ? "รอคิว…" : it.status === "processing" ? "กำลังย่อรูป…" : `อัปโหลด ${it.progress}%`}
                          <div className="bar"><i style={{ width: `${it.status === "uploading" ? it.progress : 3}%` }} /></div>
                        </div>
                      )}
                      {it.status === "done" && <div className="state">✓ พร้อม</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="sr-only" htmlFor="post-text">ข้อความ</label>
            <textarea id="post-text" className="textarea" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="เขียนความคิดของคุณ…" />
          </div>

          {columns.length > 0 && (
            <div>
              <label className="label" htmlFor="post-col">โพสต์ลงคอลัมน์</label>
              <select id="post-col" className="input select" value={column ?? ""} onChange={(e) => setColumn(e.target.value ? Number(e.target.value) : null)}>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <span className="label">สีโน้ต</span>
            <div className="swatches" role="radiogroup" aria-label="สีโน้ต">
              {COLORS.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={color === c.key} aria-label={c.label}
                  className="swatch" style={{ background: c.bg }} onClick={() => setColor(c.key)} />
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="post-name">ชื่อเล่น</label>
            <input id="post-name" className="input" value={anon ? "" : name} disabled={anon} maxLength={40}
              onChange={(e) => setName(e.target.value)} placeholder={anon ? "โพสต์แบบไม่ระบุชื่อ" : "ใส่ชื่อเล่น (ไม่บังคับ)"} autoComplete="nickname" />
            <label className="toggle">
              <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
              โพสต์แบบไม่ระบุชื่อ
            </label>
          </div>

          <div className="send-bar">
            {error && <p className="error-text" role="alert" style={{ margin: "0 0 8px" }}>{error}</p>}
            <button className="btn btn-primary btn-block" style={{ minHeight: 56, fontSize: 18 }} disabled={!canSend} onClick={send}>
              {sendLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
