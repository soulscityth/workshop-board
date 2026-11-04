import { list } from "@vercel/blob";
import { err, json } from "@/lib/server";
import { isTeamRequest } from "@/lib/team";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Total size of all photos in the Blob store, plus a per-board breakdown. */
export async function GET(req: Request) {
  if (!isTeamRequest(req)) return err("กรุณาเข้าสู่ระบบ", 401);
  let cursor: string | undefined;
  let bytes = 0;
  let files = 0;
  const perBoard: Record<string, number> = {};
  let pages = 0;
  do {
    const res = await list({ cursor, limit: 1000 });
    for (const b of res.blobs) {
      bytes += b.size;
      files++;
      const slug = b.pathname.split("/")[1];
      if (slug) perBoard[slug] = (perBoard[slug] ?? 0) + b.size;
    }
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor && ++pages < 100);
  return json({ bytes, files, perBoard, partial: !!cursor }, 200, { "Cache-Control": "no-store" });
}
