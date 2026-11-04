import "server-only";
import { sql } from "./db";
import { getBoard, getColumns, isAdmin, toPost, type BoardRow } from "./server";

/** Export endpoints are submitted as an HTML form POST so the browser downloads the file directly. */
export async function authExport(req: Request, slug: string): Promise<BoardRow | Response> {
  const board = await getBoard(slug);
  if (!board) return new Response("ไม่พบบอร์ดนี้", { status: 404 });
  let key: string | null = req.headers.get("x-admin-key");
  if (!key) {
    try {
      const form = await req.formData();
      key = String(form.get("key") ?? "");
    } catch {}
  }
  if (!isAdmin(board, key)) return new Response("ลิงก์ผู้ดูแลไม่ถูกต้อง", { status: 403 });
  return board;
}

export async function loadPosts(board: BoardRow) {
  const [columns, rows] = await Promise.all([
    getColumns(board.id),
    sql()`SELECT * FROM posts WHERE board_id = ${board.id} AND NOT deleted ORDER BY id`,
  ]);
  const colName = new Map(columns.map((c) => [c.id, c.name]));
  return rows.map((r) => {
    const p = toPost(r as Parameters<typeof toPost>[0]);
    return { ...p, columnName: p.c != null ? colName.get(p.c) ?? "" : "" };
  });
}

export function safeName(s: string, max = 40) {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, max) || "untitled";
}

export function bangkokTime(ms: number) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(ms));
}

export function attachmentHeader(filename: string) {
  return `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
