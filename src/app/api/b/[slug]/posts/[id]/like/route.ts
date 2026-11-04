import { sql } from "@/lib/db";
import { cleanDevice, err, getBoard, json, LIMITS, rateLimit } from "@/lib/server";

/** Body: { device, on: boolean }. One like per device per post. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const postId = Number(id);
  let b: { device?: unknown; on?: unknown };
  try {
    b = await req.json();
  } catch {
    return err("ข้อมูลไม่ถูกต้อง");
  }
  const device = cleanDevice(b.device);
  if (!device || !Number.isSafeInteger(postId)) return err("ข้อมูลไม่ถูกต้อง");
  const board = await getBoard(slug);
  if (!board) return err("ไม่พบบอร์ดนี้", 404);
  if (!(await rateLimit([{ key: `like:d:${device}`, limit: LIMITS.likesPerDevicePerMin }])))
    return err("กดถี่เกินไป", 429);

  const db = sql();
  const rows = b.on
    ? await db`
      WITH p AS (SELECT id FROM posts WHERE id = ${postId} AND board_id = ${board.id} AND NOT deleted),
      ins AS (
        INSERT INTO post_likes (post_id, device) SELECT id, ${device} FROM p
        ON CONFLICT DO NOTHING RETURNING post_id
      ),
      bv AS (
        UPDATE boards SET version = version + 1
        WHERE id = ${board.id} AND EXISTS (SELECT 1 FROM ins) RETURNING version
      )
      UPDATE posts SET likes = likes + 1, version = (SELECT version FROM bv)
      WHERE id = ${postId} AND EXISTS (SELECT 1 FROM bv)
      RETURNING likes`
    : await db`
      WITH del AS (
        DELETE FROM post_likes WHERE post_id = ${postId} AND device = ${device}
        AND EXISTS (SELECT 1 FROM posts WHERE id = ${postId} AND board_id = ${board.id} AND NOT deleted)
        RETURNING post_id
      ),
      bv AS (
        UPDATE boards SET version = version + 1
        WHERE id = ${board.id} AND EXISTS (SELECT 1 FROM del) RETURNING version
      )
      UPDATE posts SET likes = GREATEST(likes - 1, 0), version = (SELECT version FROM bv)
      WHERE id = ${postId} AND EXISTS (SELECT 1 FROM bv)
      RETURNING likes`;

  if (rows.length) return json({ likes: Number(rows[0].likes), liked: !!b.on });
  // No change (already liked / not liked): report current count.
  const cur = await db`SELECT likes FROM posts WHERE id = ${postId} AND board_id = ${board.id} AND NOT deleted`;
  if (!cur.length) return err("ไม่พบโพสต์", 404);
  return json({ likes: Number(cur[0].likes), liked: !!b.on });
}
