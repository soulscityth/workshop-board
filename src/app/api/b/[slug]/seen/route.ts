import { sql } from "@/lib/db";
import { cleanDevice, getBoard } from "@/lib/server";

/**
 * Tiny beacon: "this device opened this board today" (+ how many full-size photos it opened).
 * Used only to estimate Blob data transfer in /admin.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let b: { device?: unknown; full?: unknown } = {};
  try {
    b = JSON.parse(await req.text());
  } catch {}
  const device = cleanDevice(b.device);
  const full = Math.max(0, Math.min(500, Math.floor(Number(b.full) || 0)));
  if (!device) return new Response(null, { status: 204 });
  const board = await getBoard(slug);
  if (!board) return new Response(null, { status: 204 });
  await sql()`
    INSERT INTO board_views (board_id, device, day, full_views)
    VALUES (${board.id}, ${device}, (now() AT TIME ZONE 'Asia/Bangkok')::date, ${full})
    ON CONFLICT (board_id, device, day) DO UPDATE SET full_views = board_views.full_views + EXCLUDED.full_views`;
  return new Response(null, { status: 204 });
}
