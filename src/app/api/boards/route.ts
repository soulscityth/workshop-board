import { sql } from "@/lib/db";
import { clientIp, err, hashKey, json, LIMITS, newAdminKey, newSlug, rateLimit } from "@/lib/server";

export async function POST(req: Request) {
  let body: { title?: unknown; columns?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("ข้อมูลไม่ถูกต้อง");
  }

  const required = process.env.CREATE_BOARD_PASSWORD;
  if (required && body.password !== required) return err("รหัสสำหรับสร้างบอร์ดไม่ถูกต้อง", 403);

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return err("กรุณาใส่ชื่อบอร์ด");
  const columns = (Array.isArray(body.columns) ? body.columns : [])
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 12);

  const ok = await rateLimit([{ key: `board:${clientIp(req)}`, limit: LIMITS.boardsPerIpPerHour }], 3600);
  if (!ok) return err("สร้างบอร์ดบ่อยเกินไป กรุณารอสักครู่", 429);

  const slug = newSlug();
  const adminKey = newAdminKey();
  const db = sql();
  const rows = (await db`INSERT INTO boards (slug, title, admin_hash) VALUES (${slug}, ${title}, ${hashKey(adminKey)}) RETURNING id`) as { id: string }[];
  const boardId = rows[0].id;
  if (columns.length) {
    await db.query(
      `INSERT INTO board_columns (board_id, name, position)
       SELECT $1, name, ord::int FROM unnest($2::text[]) WITH ORDINALITY AS t(name, ord)`,
      [boardId, columns],
    );
  }
  return json({ slug, adminKey });
}
