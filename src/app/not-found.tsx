import Link from "next/link";

export default function NotFound() {
  return (
    <main className="home" style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 56 }}>🧐</div>
      <h1>ไม่พบบอร์ดนี้</h1>
      <p className="muted">ลิงก์อาจไม่ถูกต้อง หรือบอร์ดถูกลบไปแล้ว ลองสแกน QR อีกครั้ง</p>
      <Link className="btn" href="/">กลับหน้าแรก</Link>
    </main>
  );
}
