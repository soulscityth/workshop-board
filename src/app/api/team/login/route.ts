import { checkPassword, sessionCookies, signSession, teamConfigured } from "@/lib/team";
import { clientIp, err, rateLimit } from "@/lib/server";

export async function POST(req: Request) {
  if (!teamConfigured()) return err("ยังไม่ได้ตั้งรหัสผ่าน ADMIN_PASSWORD ใน Vercel", 503);
  const ok = await rateLimit([{ key: `team-login:${clientIp(req)}`, limit: 10 }], 900);
  if (!ok) return err("ลองรหัสผ่านบ่อยเกินไป กรุณารอ 15 นาที", 429);
  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {}
  if (!checkPassword(body.password)) return err("รหัสผ่านไม่ถูกต้อง", 403);
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const c of sessionCookies(signSession())) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify({ ok: true }), { headers });
}
