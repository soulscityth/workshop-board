import { sql } from "@/lib/db";
import { COLOR_KEYS } from "@/lib/colors";
import { cleanDevice, clientIp, err, getBoard, json, LIMITS, rateLimit, toPost, validBlobUrl } from "@/lib/server";
import type { Photo } from "@/lib/types";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return err("ข้อมูลไม่ถูกต้อง");
  }

  const device = cleanDevice(b.device);
  if (!device) return err("ข้อมูลอุปกรณ์ไม่ถูกต้อง");

  const board = await getBoard(slug);
  if (!board) return err("ไม่พบบอร์ดนี้", 404);
  if (board.locked) return err("บอร์ดถูกล็อกแล้ว ไม่สามารถโพสต์เพิ่มได้", 423);

  const ok = await rateLimit([
    { key: `post:d:${device}`, limit: LIMITS.postsPerDevicePerMin },
    { key: `post:ip:${clientIp(req)}`, limit: LIMITS.postsPerIpPerMin },
  ]);
  if (!ok) return err("โพสต์ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่", 429);

  const text = typeof b.text === "string" ? b.text.trim().slice(0, LIMITS.maxTextLength) : "";
  const author =
    typeof b.author === "string" && b.author.trim() ? b.author.trim().slice(0, LIMITS.maxAuthorLength) : null;
  const color = typeof b.color === "string" && COLOR_KEYS.has(b.color) ? b.color : "white";
  const columnId = Number.isInteger(b.column) ? (b.column as number) : null;

  const photos: Photo[] = [];
  for (const p of (Array.isArray(b.photos) ? b.photos : []).slice(0, LIMITS.maxPhotosPerPost)) {
    const u = validBlobUrl(p?.u, slug);
    const s = validBlobUrl(p?.s, slug) ?? u;
    const w = Math.round(Number(p?.w));
    const h = Math.round(Number(p?.h));
    if (!u || !s || !(w > 0 && w < 10000) || !(h > 0 && h < 10000)) return err("ไฟล์รูปไม่ถูกต้อง");
    const sw = Math.round(Number(p?.sw));
    photos.push(sw > 0 && sw <= w ? { u, s, w, h, sw } : { u, s, w, h });
  }
  if (!text && !photos.length) return err("กรุณาเขียนข้อความหรือเพิ่มรูปอย่างน้อย 1 อย่าง");

  const rows = await sql()`
    WITH b AS (
      UPDATE boards SET version = version + 1
      WHERE id = ${board.id} AND NOT locked
      RETURNING id, version
    )
    INSERT INTO posts (board_id, column_id, author, body, color, photos, version)
    SELECT b.id,
           (SELECT id FROM board_columns WHERE id = ${columnId} AND board_id = b.id),
           ${author}, ${text}, ${color}, ${JSON.stringify(photos)}::jsonb, b.version
    FROM b
    RETURNING *`;
  if (!rows.length) return err("บอร์ดถูกล็อกแล้ว ไม่สามารถโพสต์เพิ่มได้", 423);
  return json({ post: toPost(rows[0] as Parameters<typeof toPost>[0]) });
}
