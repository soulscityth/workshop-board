export const dynamic = "force-dynamic";

import CreateBoard from "@/components/CreateBoard";

export default function Home() {
  return (
    <main className="home">
      <p className="muted" style={{ margin: 0 }}>บอร์ดเวิร์กช็อป</p>
      <h1>สร้างบอร์ดให้ผู้เข้าร่วมโพสต์โน้ตและรูปจากมือถือ</h1>
      <p className="muted">ผู้เข้าร่วมแค่สแกน QR ก็โพสต์ได้ทันที ไม่ต้องสมัครหรือล็อกอิน</p>
      <CreateBoard requirePassword={!!process.env.CREATE_BOARD_PASSWORD} />
    </main>
  );
}
