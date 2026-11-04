import type { Metadata, Viewport } from "next";
import { Mitr } from "next/font/google";
import "./globals.css";

const mitr = Mitr({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: "บอร์ดเวิร์กช็อป",
  description: "บอร์ดโพสต์โน้ตและรูปภาพร่วมกันในเวิร์กช็อป ไม่ต้องสมัครสมาชิก",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f2ea",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={mitr.className}>{children}</body>
    </html>
  );
}
