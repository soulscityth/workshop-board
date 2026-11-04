import { sql } from "@/lib/db";
import { getBoard, getColumns, toPost } from "@/lib/server";
import type { FeedResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Polled by every participant every ~4s.
 * The response depends only on (slug, since), and all clients converge on the same
 * `since`, so the Vercel CDN can serve most polls from cache (s-maxage=2).
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const board = await getBoard(slug);
  if (!board) return Response.json({ error: "not found" }, { status: 404, headers: cdn(10) });

  const sinceRaw = Number(new URL(req.url).searchParams.get("since") || 0);
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? Math.floor(sinceRaw) : 0;
  const version = Number(board.version);
  const reset = since === 0 || since < Number(board.reset_version) || since > version;

  const db = sql();
  const [columns, rows] = await Promise.all([
    getColumns(board.id),
    reset
      ? db`SELECT * FROM posts WHERE board_id = ${board.id} AND NOT deleted ORDER BY id`
      : db`SELECT * FROM posts WHERE board_id = ${board.id} AND version > ${since} ORDER BY id`,
  ]);

  const posts = [];
  const deleted: number[] = [];
  for (const r of rows as Parameters<typeof toPost>[0][]) {
    if (r.deleted) deleted.push(Number(r.id));
    else posts.push(toPost(r));
  }

  const body: FeedResponse = {
    version,
    reset,
    board: { slug: board.slug, title: board.title, locked: board.locked, columns },
    posts,
    deleted,
  };
  return Response.json(body, { headers: cdn(2) });
}

function cdn(seconds: number) {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
  };
}
