"use client";

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const FULL_EDGE = 1600;
// Thumbnail: short edge ≤720px, long edge ≤1080px — sharp on 2–3× phone screens in a 2-column grid.
const THUMB_SHORT = 720;
const THUMB_LONG = 1080;

export type Processed = { full: Blob; thumb: Blob; w: number; h: number; sw: number };

function isHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

type Source = { el: CanvasImageSource; w: number; h: number; close?: () => void };

/** Decode with EXIF orientation applied (both paths below honour orientation in modern browsers). */
async function decode(blob: Blob): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { el: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.style.imageOrientation = "from-image";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("decode failed"));
      img.src = url;
    });
    return { el: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function render(src: Source, scale: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  scale = Math.min(1, scale);
  const w = Math.max(1, Math.round(src.w * scale));
  const h = Math.max(1, Math.round(src.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#fff"; // flatten transparent PNGs onto white
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src.el, 0, 0, w, h);
  return new Promise((res, rej) =>
    canvas.toBlob(
      (b) => {
        // free canvas memory quickly (iOS has a tight canvas budget)
        canvas.width = canvas.height = 0;
        if (b) res({ blob: b, w, h });
        else rej(new Error("encode failed"));
      },
      "image/jpeg",
      quality,
    ),
  );
}

/**
 * Resize + compress in the browser: long edge ≤1600px JPEG 0.8, plus a ~720px thumbnail.
 * Redrawing on canvas also strips EXIF (incl. GPS location).
 */
export async function processImage(file: File): Promise<Processed> {
  if (file.size > MAX_INPUT_BYTES) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
  const looksImage = file.type.startsWith("image/") || isHeic(file) || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
  if (!looksImage) throw new Error("รองรับเฉพาะไฟล์รูปภาพ");

  let src: Source;
  try {
    src = await decode(file);
  } catch (e) {
    if (!isHeic(file) && file.type) throw new Error("เปิดไฟล์รูปนี้ไม่ได้");
    // Browser can't decode HEIC natively (most non-Safari browsers) → convert lazily.
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    src = await decode(Array.isArray(out) ? out[0] : out).catch(() => {
      throw e instanceof Error ? e : new Error("เปิดไฟล์รูปนี้ไม่ได้");
    });
  }
  try {
    const full = await render(src, FULL_EDGE / Math.max(src.w, src.h), 0.8);
    const thumbScale = Math.min(THUMB_SHORT / Math.min(src.w, src.h), THUMB_LONG / Math.max(src.w, src.h));
    const thumb = await render(src, thumbScale, 0.8);
    return { full: full.blob, thumb: thumb.blob, w: full.w, h: full.h, sw: thumb.w };
  } finally {
    src.close?.();
  }
}
