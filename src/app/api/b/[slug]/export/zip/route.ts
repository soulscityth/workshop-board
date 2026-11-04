import { Zip, ZipPassThrough } from "fflate";
import { attachmentHeader, authExport, loadPosts, safeName } from "@/lib/export";

export const maxDuration = 300;

/** Streams every photo on the board into a zip (stored, not recompressed: JPEGs don't shrink). */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const board = await authExport(req, slug);
  if (board instanceof Response) return board;
  const posts = await loadPosts(board);

  const files: { name: string; url: string }[] = [];
  const used = new Set<string>();
  for (const p of posts) {
    p.p.forEach((ph, i) => {
      const folder = p.columnName ? safeName(p.columnName) + "/" : "";
      const ext = (ph.u.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      let name = `${folder}${String(p.id).padStart(5, "0")}_${safeName(p.a ?? "ไม่ระบุชื่อ", 30)}${p.p.length > 1 ? `_${i + 1}` : ""}.${ext}`;
      while (used.has(name)) name = name.replace(/(\.\w+)$/, "_x$1");
      used.add(name);
      files.push({ name, url: ph.u });
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((e, chunk, final) => {
        if (e) return controller.error(e);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      for (const f of files) {
        try {
          const res = await fetch(f.url);
          if (!res.ok || !res.body) throw new Error(String(res.status));
          const entry = new ZipPassThrough(f.name);
          zip.add(entry);
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            entry.push(value);
          }
          entry.push(new Uint8Array(0), true);
        } catch (e) {
          console.error("zip: skip", f.url, e);
        }
      }
      if (!files.length) {
        const readme = new ZipPassThrough("ไม่มีรูปในบอร์ดนี้.txt");
        zip.add(readme);
        readme.push(new TextEncoder().encode("ยังไม่มีรูปภาพในบอร์ดนี้"), true);
      }
      zip.end();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachmentHeader(`${safeName(board.title)}-${slug}-photos.zip`),
      "Cache-Control": "no-store",
    },
  });
}
