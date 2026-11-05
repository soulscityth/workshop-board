import { list } from "@vercel/blob";
import { ensureSchema, sql } from "@/lib/db";
import { err, json } from "@/lib/server";
import { isTeamRequest } from "@/lib/team";
import { planLimits, track } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_DAYS = 30;

type StorageScan = { at: number; bytes: number; files: number; perBoard: Record<string, { thumb: number; full: number; thumbs: number; fulls: number }>; partial: boolean };
let cache: StorageScan | null = null; // per server instance; list() itself costs Blob operations

async function scanStorage(force: boolean): Promise<StorageScan> {
  if (cache && !force && Date.now() - cache.at < 10 * 60_000) return cache;
  let cursor: string | undefined;
  let bytes = 0;
  let files = 0;
  let pages = 0;
  const perBoard: StorageScan["perBoard"] = {};
  do {
    const res = await list({ cursor, limit: 1000 });
    pages++;
    for (const b of res.blobs) {
      bytes += b.size;
      files++;
      const slug = b.pathname.split("/")[1];
      if (!slug) continue;
      const e = (perBoard[slug] ??= { thumb: 0, full: 0, thumbs: 0, fulls: 0 });
      // thumbnails are uploaded as <random>_s.jpg (plus Blob's own random suffix)
      if (/_s(-[A-Za-z0-9]+)?\.jpe?g$/.test(b.pathname)) {
        e.thumb += b.size;
        e.thumbs++;
      } else {
        e.full += b.size;
        e.fulls++;
      }
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor && pages < 100);
  await track("blob_list", pages);
  cache = { at: Date.now(), bytes, files, perBoard, partial: !!cursor };
  return cache;
}

/** Usage estimate for the team dashboard (last 30 days, Bangkok dates). */
export async function GET(req: Request) {
  if (!isTeamRequest(req)) return err("กรุณาเข้าสู่ระบบ", 401);
  await ensureSchema();
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const db = sql();
  // One-time backfill: photos posted before tracking existed ≈ 2 uploads each (full + thumbnail).
  await db`
    WITH done AS (
      INSERT INTO usage_log (day, kind, n) VALUES ('1970-01-01', 'backfill_done', 1)
      ON CONFLICT DO NOTHING RETURNING 1
    )
    INSERT INTO usage_log (day, kind, n)
    SELECT (created_at AT TIME ZONE 'Asia/Bangkok')::date, 'blob_put', SUM(jsonb_array_length(photos)) * 2
    FROM posts WHERE EXISTS (SELECT 1 FROM done) AND jsonb_array_length(photos) > 0
    GROUP BY 1
    ON CONFLICT (day, kind) DO UPDATE SET n = usage_log.n + EXCLUDED.n`;
  const storage = await scanStorage(force);
  const [ops, views] = await Promise.all([
    db`SELECT kind, SUM(n)::bigint AS n FROM usage_log
       WHERE day > (now() AT TIME ZONE 'Asia/Bangkok')::date - ${WINDOW_DAYS}::int GROUP BY kind`,
    db`SELECT b.slug, COUNT(DISTINCT v.device)::int AS viewers, COALESCE(SUM(v.full_views), 0)::int AS full_views
       FROM board_views v JOIN boards b ON b.id = v.board_id
       WHERE v.day > (now() AT TIME ZONE 'Asia/Bangkok')::date - ${WINDOW_DAYS}::int GROUP BY b.slug`,
  ]);
  const opsBy = Object.fromEntries(ops.map((r) => [r.kind as string, Number(r.n)]));
  const uploads = opsBy.blob_put ?? 0;
  const listings = opsBy.blob_list ?? 0;

  // Data transfer estimate (upper bound): each viewer loads every thumbnail of the board once,
  // plus the full photos people opened, plus zip downloads.
  let transfer = opsBy.zip_bytes ?? 0;
  let viewers = 0;
  let fullViews = 0;
  for (const v of views) {
    const s = storage.perBoard[v.slug as string];
    viewers += Number(v.viewers);
    fullViews += Number(v.full_views);
    if (!s) continue;
    transfer += Number(v.viewers) * s.thumb;
    if (s.fulls) transfer += Number(v.full_views) * (s.full / s.fulls);
  }

  return json(
    {
      windowDays: WINDOW_DAYS,
      limits: planLimits(),
      storage: { bytes: storage.bytes, files: storage.files, partial: storage.partial, scannedAt: storage.at, perBoard: Object.fromEntries(Object.entries(storage.perBoard).map(([k, v]) => [k, v.thumb + v.full])) },
      advanced: { used: uploads + listings, uploads, listings },
      transfer: { estimate: Math.round(transfer), viewers, fullViews, zipBytes: opsBy.zip_bytes ?? 0 },
    },
    200,
    { "Cache-Control": "no-store" },
  );
}
