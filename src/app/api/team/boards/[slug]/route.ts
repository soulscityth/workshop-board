import { del, list } from "@vercel/blob";
import { sql } from "@/lib/db";
import { err, getBoard, hashKey, json, newAdminKey } from "@/lib/server";
import { isTeamRequest } from "@/lib/team";

export const maxDuration = 120;

/** Body: { action: "rotate" | "delete" } */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  if (!isTeamRequest(req)) return err("กรุณาเข้าสู่ระบบ", 401);
  const { slug } = await ctx.params;
  const board = await getBoard(slug);
  if (!board) return err("ไม่พบบอร์ดนี้", 404);
  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {}

  if (body.action === "rotate") {
    // New admin link; the old one stops working immediately.
    const adminKey = newAdminKey();
    await sql()`UPDATE boards SET admin_hash = ${hashKey(adminKey)} WHERE id = ${board.id}`;
    return json({ adminKey });
  }

  if (body.action === "delete") {
    // Remove every file under b/<slug>/ (also catches uploads that were never posted), then the board.
    let cursor: string | undefined;
    let removed = 0;
    do {
      const res = await list({ prefix: `b/${slug}/`, cursor, limit: 1000 });
      const urls = res.blobs.map((b) => b.url);
      for (let i = 0; i < urls.length; i += 500) await del(urls.slice(i, i + 500));
      removed += urls.length;
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    await sql()`DELETE FROM boards WHERE id = ${board.id}`;
    return json({ ok: true, removedFiles: removed });
  }

  return err("ไม่รู้จักคำสั่งนี้");
}
