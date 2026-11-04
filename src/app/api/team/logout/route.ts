import { sessionCookies } from "@/lib/team";

export async function POST() {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const c of sessionCookies(null)) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify({ ok: true }), { headers });
}
