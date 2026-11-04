"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function Qr({ value, className = "qr" }: { value: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);
  return <div className={className} role="img" aria-label={`QR code: ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
