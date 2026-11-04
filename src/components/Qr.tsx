"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR code with the SoulScity logo in the centre (error correction H keeps it scannable). */
export default function Qr({ value, className = "qr", logo = true }: { value: string; className?: string; logo?: boolean }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: logo ? "H" : "M", color: { dark: "#0f3b40", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value, logo]);
  return (
    <div className={`${className} qr-wrap`} role="img" aria-label={`QR code: ${value}`}>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      {logo && svg && (
        <span className="qr-logo" aria-hidden>
          <img src="/logo.png" alt="" />
        </span>
      )}
    </div>
  );
}
