import Link from "next/link";

export default function NotFound() {
  return (
    <main className="home" style={{ textAlign: "center", paddingTop: 80 }}>
      <img src="/logo.png" alt="SoulScity" width={72} height={72} style={{ margin: "0 auto", borderRadius: 999 }} />
      <h1>ไม่พบบอร์ดนี้</h1>
      <p className="muted">ลิงก์อาจไม่ถูกต้อง หรือบอร์ดถูกลบไปแล้ว ลองสแกน QR อีกครั้ง</p>
      <Link className="btn" href="/">กลับหน้าแรก</Link>
    </main>
  );
}
