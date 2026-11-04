"use client";
import { useEffect, useState } from "react";
import Qr from "./Qr";
import { getJSON, setJSON } from "@/lib/storage";

type Mine = { slug: string; title: string; adminKey: string; at: number };
const PRESETS = ["ความคาดหวัง", "สิ่งที่ได้เรียนรู้", "คำถาม", "สิ่งที่จะนำไปใช้"];

export default function CreateBoard({ requirePassword }: { requirePassword: boolean }) {
  const [title, setTitle] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [colInput, setColInput] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Mine | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    setMine(getJSON<Mine[]>("wb:myboards", []));
  }, []);

  const addCol = (name: string) => {
    const n = name.trim();
    if (n && !columns.includes(n) && columns.length < 12) setColumns([...columns, n]);
    setColInput("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("กรุณาใส่ชื่อบอร์ด");
    setBusy(true);
    try {
      const cols = colInput.trim() ? [...columns, colInput.trim()] : columns;
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, columns: cols, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "สร้างบอร์ดไม่สำเร็จ");
      const item: Mine = { slug: data.slug, title: title.trim(), adminKey: data.adminKey, at: Date.now() };
      const next = [item, ...mine.filter((m) => m.slug !== item.slug)].slice(0, 30);
      setJSON("wb:myboards", next);
      setMine(next);
      setCreated(item);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างบอร์ดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      window.prompt("คัดลอกลิงก์นี้", text);
    }
  }

  if (created) {
    const pub = `${origin}/b/${created.slug}`;
    const admin = `${pub}?admin=${created.adminKey}`;
    return (
      <div className="panel stack">
        <h2 style={{ margin: 0, fontSize: 22 }}>สร้างบอร์ด “{created.title}” แล้ว 🎉</h2>
        <Qr value={pub} />
        <div>
          <span className="label">ลิงก์สำหรับผู้เข้าร่วม (แชร์ได้)</span>
          <div className="linkbox">{pub}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => copy(pub, "pub")}>{copied === "pub" ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}</button>
          </div>
        </div>
        <div>
          <span className="label">ลิงก์ผู้ดูแล (เก็บเป็นความลับ)</span>
          <div className="linkbox">{admin}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => copy(admin, "admin")}>{copied === "admin" ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์ผู้ดูแล"}</button>
          </div>
          <p className="warn" style={{ marginTop: 10 }}>
            ⚠️ ใครมีลิงก์ผู้ดูแลจะลบโพสต์ ล็อก และล้างบอร์ดได้ กรุณาบันทึกลิงก์นี้ไว้ ระบบจะไม่แสดงซ้ำ (เบราว์เซอร์นี้จะจำไว้ให้ในรายการ “บอร์ดของฉัน”)
          </p>
        </div>
        <a className="btn btn-primary btn-block" href={`/b/${created.slug}?admin=${created.adminKey}`}>เปิดบอร์ด (โหมดผู้ดูแล)</a>
        <button className="btn btn-ghost btn-block" onClick={() => { setCreated(null); setTitle(""); setColumns([]); }}>สร้างบอร์ดใหม่อีกอัน</button>
      </div>
    );
  }

  return (
    <>
      <form className="panel stack" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="title">ชื่อบอร์ด</label>
          <input id="title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น เวิร์กช็อปการออกแบบการเรียนรู้" />
        </div>
        <div>
          <span className="label">คอลัมน์ (ไม่บังคับ)</span>
          {columns.length > 0 && (
            <div className="chips" style={{ marginBottom: 8 }}>
              {columns.map((c) => (
                <button type="button" key={c} className="chip" style={{ borderStyle: "solid" }} onClick={() => setColumns(columns.filter((x) => x !== c))} aria-label={`ลบคอลัมน์ ${c}`}>
                  {c} ✕
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <input className="input" value={colInput} maxLength={60} onChange={(e) => setColInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCol(colInput); } }} placeholder="พิมพ์ชื่อคอลัมน์" />
            <button type="button" className="btn" onClick={() => addCol(colInput)}>เพิ่ม</button>
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {PRESETS.filter((p) => !columns.includes(p)).map((p) => (
              <button type="button" key={p} className="chip" onClick={() => addCol(p)}>+ {p}</button>
            ))}
          </div>
        </div>
        {requirePassword && (
          <div>
            <label className="label" htmlFor="pw">รหัสสำหรับสร้างบอร์ด</label>
            <input id="pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "กำลังสร้าง…" : "สร้างบอร์ด"}</button>
      </form>

      {mine.length > 0 && (
        <div className="panel myboards">
          <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>บอร์ดของฉัน (ในเครื่องนี้)</h2>
          {mine.map((m) => (
            <a key={m.slug} href={`/b/${m.slug}?admin=${m.adminKey}`}>
              <span>{m.title}</span>
              <span className="muted" style={{ fontSize: 13, flex: "none" }}>{new Date(m.at).toLocaleDateString("th-TH")}</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
