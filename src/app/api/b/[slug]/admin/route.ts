import { del } from "@vercel/blob";
import { sql } from "@/lib/db";
import { allPhotoUrls, err, getBoard, isAdmin, json } from "@/lib/server";
import type { Photo } from "@/lib/types";

export const maxDuration = 60;

/** Body: { action: "verify" | "lock" | "unlock" | "delete" | "clear", postId? }. Header: x-admin-key */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const board = await getBoard(slug);
  if (!board) return err("ไม่พบบอร์ดนี้", 404);
  if (!isAdmin(board, req.headers.get("x-admin-key"))) return err("ลิงก์ผู้ดูแลไม่ถูกต้อง", 403);

  let b: { action?: string; postId?: unknown };
  try {
    b = await req.json();
  } catch {
    return err("ข้อมูลไม่ถูกต้อง");
  }
  const db = sql();

  switch (b.action) {
    case "verify":
      return json({ ok: true });

    case "lock":
    case "unlock": {
      const locked = b.action === "lock";
      await db`UPDATE boards SET locked = ${locked}, version = version + 1 WHERE id = ${board.id}`;
      return json({ ok: true, locked });
    }

    case "delete": {
      const postId = Number(b.postId);
      if (!Number.isSafeInteger(postId)) return err("ข้อมูลไม่ถูกต้อง");
      const rows = (await db`
        WITH bv AS (UPDATE boards SET version = version + 1 WHERE id = ${board.id} RETURNING version),
        old AS (SELECT id, photos FROM posts WHERE id = ${postId} AND board_id = ${board.id} AND NOT deleted)
        UPDATE posts p SET deleted = TRUE, body = '', author = NULL, photos = '[]'::jsonb,
          version = (SELECT version FROM bv)
        FROM old WHERE p.id = old.id
        RETURNING old.photos`) as { photos: Photo[] }[];
      const urls = rows.flatMap((r) => allPhotoUrls(r.photos));
      if (urls.length) await del(urls).catch((e) => console.error("blob delete failed", e));
      return json({ ok: true });
    }

    case "clear": {
      const rows = (await db`SELECT photos FROM posts WHERE board_id = ${board.id} AND NOT deleted`) as {
        photos: Photo[];
      }[];
      await db.transaction([
        db`DELETE FROM posts WHERE board_id = ${board.id}`,
        db`UPDATE boards SET version = version + 1, reset_version = version + 1 WHERE id = ${board.id}`,
      ]);
      const urls = rows.flatMap((r) => allPhotoUrls(r.photos));
      for (let i = 0; i < urls.length; i += 500) {
        await del(urls.slice(i, i + 500)).catch((e) => console.error("blob delete failed", e));
      }
      return json({ ok: true });
    }
  }
  return err("ไม่รู้จักคำสั่งนี้");
}
