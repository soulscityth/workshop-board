import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { customAlphabet } from "nanoid";
import { NextResponse } from "next/server";
import { ensureSchema, sql } from "./db";
import type { Photo, Post } from "./types";

export const LIMITS = {
  postsPerDevicePerMin: 10,
  postsPerIpPerMin: 300, // a whole workshop room often shares one public IP
  uploadsPerDevicePerMin: 60,
  uploadsPerIpPerMin: 1500,
  likesPerDevicePerMin: 120,
  boardsPerIpPerHour: 20,
  maxPhotosPerPost: 6,
  maxTextLength: 2000,
  maxAuthorLength: 40,
  maxUploadBytes: 10 * 1024 * 1024,
};

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const newSlug = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 8);
export const newAdminKey = () => randomBytes(32).toString("base64url");
export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}
export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function clientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function cleanDevice(d: unknown): string | null {
  return typeof d === "string" && /^[A-Za-z0-9_-]{10,64}$/.test(d) ? d : null;
}

/**
 * Fixed-window counter in Postgres. Returns true if every key is within its limit.
 * Each key is incremented even if another key is over (keeps the query to one round trip).
 */
export async function rateLimit(
  checks: { key: string; limit: number }[],
  windowSec = 60,
): Promise<boolean> {
  await ensureSchema();
  const nowSec = Math.floor(Date.now() / 1000);
  const win = Math.floor(nowSec / windowSec) * windowSec; // window start, epoch seconds
  const keys = checks.map((c) => `${c.key}:${windowSec}`);
  const rows = (await sql().query(
    `INSERT INTO rate_limits (key, win, count)
     SELECT k, $2, 1 FROM unnest($1::text[]) AS k
     ON CONFLICT (key, win) DO UPDATE SET count = rate_limits.count + 1
     RETURNING key, count`,
    [keys, win],
  )) as { key: string; count: number }[];
  if (Math.random() < 0.02) {
    sql()
      .query(`DELETE FROM rate_limits WHERE win < $1`, [nowSec - 7200])
      .catch(() => {});
  }
  const byKey = new Map(rows.map((r) => [r.key, Number(r.count)]));
  return checks.every((c, i) => (byKey.get(keys[i]) ?? 0) <= c.limit);
}

export type BoardRow = {
  id: string;
  slug: string;
  title: string;
  admin_hash: string;
  locked: boolean;
  version: string;
  reset_version: string;
};

export async function getBoard(slug: string): Promise<BoardRow | null> {
  if (!/^[a-z0-9]{4,32}$/.test(slug)) return null;
  await ensureSchema();
  const rows = (await sql()`SELECT * FROM boards WHERE slug = ${slug}`) as BoardRow[];
  return rows[0] ?? null;
}

export async function getColumns(boardId: string) {
  const rows = (await sql()`SELECT id, name FROM board_columns WHERE board_id = ${boardId} ORDER BY position, id`) as {
    id: string;
    name: string;
  }[];
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

export function isAdmin(board: BoardRow, key: string | null | undefined) {
  if (!key || typeof key !== "string" || key.length > 200) return false;
  const a = Buffer.from(hashKey(key), "hex");
  const b = Buffer.from(board.admin_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Blob store id is embedded in the read-write token: vercel_blob_rw_<storeId>_<secret> */
function blobStoreId(): string | null {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  const m = t?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/);
  return m ? m[1].toLowerCase() : null;
}

/** Only accept photo URLs that live in our own Blob store, under this board's folder. */
export function validBlobUrl(raw: unknown, slug: string): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const store = blobStoreId();
    const host = u.hostname.toLowerCase();
    if (!host.endsWith(".public.blob.vercel-storage.com")) return null;
    if (store && host !== `${store}.public.blob.vercel-storage.com`) return null;
    if (!u.pathname.startsWith(`/b/${slug}/`)) return null;
    if (u.search || u.hash) return null;
    return u.toString();
  } catch {
    return null;
  }
}

type PostRow = {
  id: string;
  column_id: string | null;
  author: string | null;
  body: string;
  color: string;
  photos: Photo[];
  likes: number;
  deleted: boolean;
  created_at: string | Date;
};

export function toPost(r: PostRow): Post {
  return {
    id: Number(r.id),
    c: r.column_id == null ? null : Number(r.column_id),
    a: r.author,
    t: r.body,
    k: r.color,
    l: Number(r.likes),
    p: Array.isArray(r.photos) ? r.photos : [],
    at: new Date(r.created_at).getTime(),
  };
}

export function allPhotoUrls(photos: Photo[]): string[] {
  return photos.flatMap((p) => [p.u, p.s]).filter(Boolean);
}
