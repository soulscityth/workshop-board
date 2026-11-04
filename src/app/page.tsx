export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import CreateBoard from "@/components/CreateBoard";
import { TEAM_COOKIE, verifySession } from "@/lib/team";

export default async function Home() {
  const team = verifySession((await cookies()).get(TEAM_COOKIE)?.value);
  return (
    <main className="home">
      <span className="brand">
        <img src="/logo.png" alt="SoulScity" />
        <span>
          <b>SoulScity Board</b>
          <small>บอร์ดเวิร์กช็อป โดย SoulScity Learning</small>
        </span>
      </span>
      <div className="home-hero">
        <h1>สร้างบอร์ดให้ผู้เข้าร่วมโพสต์โน้ตและรูปจากมือถือ</h1>
        <p>ผู้เข้าร่วมแค่สแกน QR ก็โพสต์ได้ทันที ไม่ต้องสมัครหรือล็อกอิน</p>
      </div>
      <CreateBoard requirePassword={!!process.env.CREATE_BOARD_PASSWORD && !team} />
      {team && <p className="home-foot"><a href="/admin">→ ไปหน้าจัดการบอร์ดทั้งหมด</a></p>}
      <p className="home-foot">© SoulScity Learning · บริษัท โซล-ไซ-ตี้ เลิร์นนิ่ง จำกัด</p>
    </main>
  );
}
