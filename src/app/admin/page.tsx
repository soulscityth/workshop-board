import type { Metadata } from "next";
import { cookies } from "next/headers";
import TeamAdmin from "@/components/TeamAdmin";
import { TEAM_COOKIE, teamConfigured, verifySession } from "@/lib/team";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "จัดการบอร์ด · SoulScity Board", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const loggedIn = verifySession((await cookies()).get(TEAM_COOKIE)?.value);
  return <TeamAdmin loggedIn={loggedIn} configured={teamConfigured()} />;
}
