import { attachmentHeader, authExport, bangkokTime, loadPosts, safeName } from "@/lib/export";

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const board = await authExport(req, slug);
  if (board instanceof Response) return board;
  const posts = await loadPosts(board);

  const esc = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["id", "เวลา", "คอลัมน์", "ชื่อ", "ข้อความ", "สี", "ไลก์", "จำนวนรูป", "ลิงก์รูป"];
  const lines = [header.map(esc).join(",")];
  for (const p of posts) {
    lines.push(
      [p.id, bangkokTime(p.at), p.columnName, p.a ?? "(ไม่ระบุชื่อ)", p.t, p.k, p.l, p.p.length, p.p.map((x) => x.u).join(" ")]
        .map(esc)
        .join(","),
    );
  }
  // BOM so Excel opens Thai text as UTF-8
  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachmentHeader(`${safeName(board.title)}-${slug}.csv`),
      "Cache-Control": "no-store",
    },
  });
}
