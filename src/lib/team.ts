import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * SoulScity team login for /admin. One shared password (ADMIN_PASSWORD env var).
 * A signed, httpOnly cookie gives admin rights on every board. Changing the password signs everyone out.
 */
export const TEAM_COOKIE = "wb_team";
export const TEAM_FLAG = "wb_team_ui"; // readable by JS so the board page knows to ask the server
export const TEAM_DAYS = 14;

function secret(): Buffer | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? createHash("sha256").update(`wb-team:${pw}`).digest() : null;
}

export const teamConfigured = () => !!process.env.ADMIN_PASSWORD;

export function checkPassword(input: unknown): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || typeof input !== "string" || input.length > 200) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(pw).digest();
  return timingSafeEqual(a, b);
}

export function signSession(): string {
  const s = secret();
  if (!s) throw new Error("ADMIN_PASSWORD not set");
  const exp = Date.now() + TEAM_DAYS * 86400_000;
  const sig = createHmac("sha256", s).update(String(exp)).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifySession(token: string | undefined | null): boolean {
  const s = secret();
  if (!s || !token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  const want = createHmac("sha256", s).update(String(exp)).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return false;
  }
  return got.length === want.length && timingSafeEqual(got, want);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** For route handlers. */
export function isTeamRequest(req: Request): boolean {
  return verifySession(readCookie(req.headers.get("cookie"), TEAM_COOKIE));
}

export function sessionCookies(value: string | null): string[] {
  const maxAge = value ? TEAM_DAYS * 86400 : 0;
  const v = value ?? "";
  return [
    `${TEAM_COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    `${TEAM_FLAG}=${value ? "1" : ""}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  ];
}
