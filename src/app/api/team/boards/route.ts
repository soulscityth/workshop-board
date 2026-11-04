import { ensureSchema, sql } from "@/lib/db";
import { err, json } from "@/lib/server";
import { isTeamRequest } from "@/lib/team";

export const dynamic = "force-dynamic";

/** Every board with simple stats, newest first. */
export async function GET(req: Request) {
  if (!isTeamRequest(req)) return err("กรุณาเข้าสู่ระบบ", 401);
  await ensureSchema();
  const rows = await sql()`
    SELECT b.slug, b.title, b.locked, b.created_at,
      COUNT(p.id) FILTER (WHERE NOT p.deleted) AS posts,
      COALESCE(SUM(jsonb_array_length(p.photos)) FILTER (WHERE NOT p.deleted), 0) AS photos,
      MAX(p.created_at) AS last_post
    FROM boards b LEFT JOIN posts p ON p.board_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC`;
  return json(
    {
      boards: rows.map((r) => ({
        slug: r.slug as string,
        title: r.title as string,
        locked: !!r.locked,
        createdAt: new Date(r.created_at as string).getTime(),
        posts: Number(r.posts),
        photos: Number(r.photos),
        lastPost: r.last_post ? new Date(r.last_post as string).getTime() : null,
      })),
    },
    200,
    { "Cache-Control": "no-store" },
  );
}
