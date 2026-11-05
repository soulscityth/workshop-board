import "server-only";
import { ensureSchema, sql } from "./db";

/**
 * Usage tracking for the /admin estimate. Vercel doesn't expose Blob usage to the app,
 * so we count what this app does itself:
 *  - blob_put:  one per upload token issued (≈ one upload() = one Blob "advanced operation")
 *  - blob_list: one per list() page (also an advanced operation)
 *  - zip_bytes: bytes read from Blob while building zip downloads (Blob data transfer)
 */
export type UsageKind = "blob_put" | "blob_list" | "zip_bytes";

export async function track(kind: UsageKind, n = 1) {
  if (!n) return;
  try {
    await ensureSchema();
    await sql()`
      INSERT INTO usage_log (day, kind, n) VALUES ((now() AT TIME ZONE 'Asia/Bangkok')::date, ${kind}, ${n})
      ON CONFLICT (day, kind) DO UPDATE SET n = usage_log.n + EXCLUDED.n`;
  } catch (e) {
    console.error("usage track failed", e); // never break the real request over a counter
  }
}

/** Limits of the Vercel plan. Defaults = Hobby (as shown on the Blob store dashboard). Override with env vars. */
export function planLimits() {
  const n = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);
  return {
    plan: process.env.VERCEL_PLAN_NAME || "Hobby",
    storageBytes: n(process.env.BLOB_LIMIT_STORAGE_GB, 1) * 1024 ** 3,
    simpleOps: n(process.env.BLOB_LIMIT_SIMPLE_OPS, 10_000),
    advancedOps: n(process.env.BLOB_LIMIT_ADVANCED_OPS, 2_000),
    transferBytes: n(process.env.BLOB_LIMIT_TRANSFER_GB, 10) * 1024 ** 3,
  };
}
