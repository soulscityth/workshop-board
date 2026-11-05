"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type BoardInfo = { slug: string; title: string; locked: boolean; createdAt: number; posts: number; photos: number; lastPost: number | null };
type Usage = {
  windowDays: number;
  limits: { plan: string; storageBytes: number; simpleOps: number; advancedOps: number; transferBytes: number };
  storage: { bytes: number; files: number; partial: boolean; scannedAt: number; perBoard: Record<string, number> };
  advanced: { used: number; uploads: number; listings: number };
  transfer: { estimate: number; viewers: number; fullViews: number; zipBytes: number };
};

const VERCEL_STORAGE_URL = "https://vercel.com/soul-scity/~/stores";
const num = (n: number) => Math.round(n).toLocaleString("th-TH");

/** One ratio against a limit. Fill = severity (teal → amber → red) on a lighter track of the same hue; icon + text say the state. */
function Meter({ label, used, limit, show, kind, note }: { label: string; used: number; limit: number; show: (n: number) => string; kind: "actual" | "estimate"; note: React.ReactNode }) {
  const pct = limit > 0 ? used / limit : 0;
  const level = pct >= 0.85 ? "crit" : pct >= 0.6 ? "warn" : "ok";
  const status = level === "crit" ? "⛔ ใกล้เต็ม/เกินแล้ว" : level === "warn" ? "⚠ เริ่มเยอะ" : "✓ ปกติ";
  const pctText = pct < 0.001 && used > 0 ? "<0.1%" : `${(pct * 100).toFixed(pct < 0.1 ? 1 : 0)}%`;
  return (
    <div className={`meter meter-${level}`}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-status">{status}</span>
      </div>
      <div className="meter-value">
        <b>{kind === "estimate" ? "≈ " : ""}{show(used)}</b> / {show(limit)} <span className="meter-pct">({pctText})</span>
      </div>
      <div className="meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}
        title={`${show(used)} จาก ${show(limit)} (${pctText})`}>
        <div className="meter-fill" style={{ width: `${Math.min(100, Math.max(used > 0 ? 1.5 : 0, pct * 100))}%` }} />
      </div>
      <p className="meter-note">{note}</p>
    </div>
  );
}

function UsagePanel({ u, onRefresh, refreshing }: { u: Usage; onRefresh: () => void; refreshing: boolean }) {
  const L = u.limits;
  const leftUploads = Math.max(0, L.advancedOps - u.advanced.used);
  const leftStorage = Math.max(0, L.storageBytes - u.storage.bytes);
  const perPhoto = u.storage.files >= 4 ? (u.storage.bytes / u.storage.files) * 2 : 450 * 1024; // full + thumbnail
  const photosByOps = Math.floor(leftUploads / 2);
  const photosByStorage = Math.floor(leftStorage / perPhoto);
  const photos = Math.min(photosByOps, photosByStorage);
  return (
    <section className="usage panel">
      <div className="usage-head">
        <div>
          <h2>การใช้งาน Vercel Blob</h2>
          <p className="muted">แพ็กเกจ {L.plan} · {u.windowDays} วันล่าสุด · พื้นที่อัปเดต {new Date(u.storage.scannedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={onRefresh} disabled={refreshing}>{refreshing ? "กำลังอัปเดต…" : "↻ อัปเดต"}</button>
          <a className="btn btn-sm" href={VERCEL_STORAGE_URL} target="_blank" rel="noreferrer">ตัวเลขจริงใน Vercel ↗</a>
        </div>
      </div>

      <div className="capacity">
        <span className="capacity-big">{num(photos)}</span>
        <span>
          รูปที่ยังอัปโหลดได้ในรอบนี้ (ประมาณ)<br />
          <small>≈ งานขนาด <b>{num(photos / 2)}</b> คน ถ้าคนละ 2 รูป · จำกัดโดย{photosByOps <= photosByStorage ? "จำนวนครั้งอัปโหลด" : "พื้นที่เก็บ"}</small>
        </span>
      </div>

      <div className="meters">
        <Meter label="พื้นที่เก็บรูป (Storage)" kind="actual" used={u.storage.bytes} limit={L.storageBytes} show={fmtBytes}
          note={<>ค่าจริง: {num(u.storage.files)} ไฟล์ (รูปเต็ม + รูปย่อ) · ลบบอร์ดที่จบงานแล้วเพื่อคืนพื้นที่</>} />
        <Meter label="จำนวนครั้งอัปโหลด (Advanced Operations)" kind="estimate" used={u.advanced.used} limit={L.advancedOps} show={num}
          note={<>นับจากแอป: อัปโหลด {num(u.advanced.uploads)} ครั้ง (รูปละ 2 ไฟล์) + เปิดดูรายการไฟล์ {num(u.advanced.listings)} ครั้ง · <b>มักเต็มเป็นอย่างแรก</b></>} />
        <Meter label="ข้อมูลที่ถูกดาวน์โหลด (Data Transfer)" kind="estimate" used={u.transfer.estimate} limit={L.transferBytes} show={fmtBytes}
          note={<>ประมาณแบบสูงสุด: ผู้เปิดบอร์ด {num(u.transfer.viewers)} คน×รูปย่อทั้งบอร์ด + เปิดรูปเต็ม {num(u.transfer.fullViews)} ครั้ง + zip {fmtBytes(u.transfer.zipBytes)}</>} />
      </div>

      <p className="usage-foot">
        Simple Operations (โควตา {num(L.simpleOps)}/เดือน) แอปนับเองไม่ได้ ดูได้ในแดชบอร์ด Vercel ·
        ตัวเลข ≈ เป็นค่าประมาณจากการนับของแอป เริ่มนับตั้งแต่วันที่เพิ่มฟีเจอร์นี้ · รอบรีเซ็ตจริงดูใน Vercel → Usage
      </p>
    </section>
  );
}

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function Brand() {
  return (
    <span className="brand">
      <img src="/logo.png" alt="SoulScity" />
      <span>
        <b>SoulScity Board</b>
        <small>หน้าจัดการบอร์ดสำหรับทีม</small>
      </span>
    </span>
  );
}

function Login({ configured }: { configured: boolean }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/team/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (res?.ok) window.location.reload();
    else {
      setError(data?.error || "เข้าสู่ระบบไม่สำเร็จ");
      setBusy(false);
    }
  }
  return (
    <main className="home">
      <Brand />
      <form className="panel stack" onSubmit={submit}>
        <h1 style={{ fontSize: 22, margin: 0 }}>เข้าสู่ระบบทีม</h1>
        {!configured && <p className="warn">ยังไม่ได้ตั้งรหัสผ่าน: เพิ่ม Environment Variable <b>ADMIN_PASSWORD</b> ในโปรเจกต์ Vercel แล้ว deploy ใหม่</p>}
        <div>
          <label className="label" htmlFor="pw">รหัสผ่านทีม SoulScity</label>
          <input id="pw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !pw}>{busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}</button>
      </form>
    </main>
  );
}

export default function TeamAdmin({ loggedIn, configured }: { loggedIn: boolean; configured: boolean }) {
  const [boards, setBoards] = useState<BoardInfo[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rotated, setRotated] = useState<{ slug: string; link: string } | null>(null);
  const [origin, setOrigin] = useState("");

  const say = (t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? "" : x)), 2600);
  };

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    const [b, s] = await Promise.all([
      fetch("/api/team/boards", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/team/usage${refresh ? "?refresh=1" : ""}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (b) setBoards(b.boards);
    else setBoards([]);
    if (s) setUsage(s);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (loggedIn) void load();
  }, [loggedIn, load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (boards ?? []).filter((b) => !t || b.title.toLowerCase().includes(t) || b.slug.includes(t));
  }, [boards, q]);

  if (!loggedIn) return <Login configured={configured} />;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      say("คัดลอกแล้ว");
    } catch {
      window.prompt("คัดลอกลิงก์นี้", text);
    }
  }

  function download(slug: string, kind: "zip" | "csv") {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/b/${slug}/export/${kind}`;
    document.body.appendChild(form);
    form.submit();
    form.remove();
    say(kind === "zip" ? "กำลังเตรียมไฟล์ zip…" : "กำลังดาวน์โหลด CSV…");
  }

  async function act(slug: string, action: "rotate" | "delete") {
    setBusy(`${slug}:${action}`);
    const res = await fetch(`/api/team/boards/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(null);
    if (!res?.ok) return say(data?.error || "ทำรายการไม่สำเร็จ");
    if (action === "rotate") setRotated({ slug, link: `${origin}/b/${slug}?admin=${data.adminKey}` });
    else {
      say(`ลบบอร์ดแล้ว (ลบไฟล์รูป ${data.removedFiles} ไฟล์)`);
      void load(true);
    }
  }

  function confirmDelete(b: BoardInfo) {
    const typed = window.prompt(`ลบบอร์ด “${b.title}” ถาวร\nโพสต์ ${b.posts} รายการ และรูปทั้งหมดจะถูกลบ ย้อนกลับไม่ได้\n\nพิมพ์ชื่อบอร์ดให้ตรงเพื่อยืนยัน`);
    if (typed == null) return;
    if (typed.trim() !== b.title.trim()) return say("ชื่อไม่ตรง ยกเลิกการลบ");
    void act(b.slug, "delete");
  }

  async function logout() {
    await fetch("/api/team/logout", { method: "POST" }).catch(() => {});
    window.location.reload();
  }

  const totalPosts = (boards ?? []).reduce((a, b) => a + b.posts, 0);

  return (
    <main className="admin">
      <header className="admin-head">
        <Brand />
        <div className="row">
          <Link className="btn btn-primary btn-sm" href="/">+ สร้างบอร์ดใหม่</Link>
          <button className="btn btn-sm" onClick={logout}>ออกจากระบบ</button>
        </div>
      </header>

      <section className="admin-stats">
        <div className="stat"><span>บอร์ดทั้งหมด</span><b>{boards ? boards.length : "…"}</b></div>
        <div className="stat"><span>โพสต์ทั้งหมด</span><b>{boards ? totalPosts.toLocaleString("th-TH") : "…"}</b></div>
        <div className="stat"><span>พื้นที่รูปที่ใช้</span><b>{usage ? fmtBytes(usage.storage.bytes) : "…"}</b><small>{usage ? `${usage.storage.files.toLocaleString("th-TH")} ไฟล์ (รวมรูปย่อ)` : ""}</small></div>
      </section>

      {usage && <UsagePanel u={usage} onRefresh={() => void load(true)} refreshing={refreshing} />}

      {rotated && (
        <div className="panel stack admin-rotated">
          <b>ลิงก์ผู้ดูแลใหม่ของบอร์ด {rotated.slug}</b>
          <div className="linkbox">{rotated.link}</div>
          <p className="warn" style={{ margin: 0 }}>ลิงก์ผู้ดูแลเดิมใช้ไม่ได้แล้ว ระบบจะไม่แสดงลิงก์นี้ซ้ำ กรุณาบันทึกไว้</p>
          <div className="row">
            <button className="btn btn-sm btn-primary" onClick={() => copy(rotated.link)}>คัดลอกลิงก์</button>
            <button className="btn btn-sm" onClick={() => setRotated(null)}>ปิด</button>
          </div>
        </div>
      )}

      <input className="input admin-search" placeholder="ค้นหาชื่อบอร์ด หรือรหัสบอร์ด" value={q} onChange={(e) => setQ(e.target.value)} />

      {!boards ? (
        <p className="muted" style={{ textAlign: "center", padding: 40 }}>กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", padding: 40 }}>{boards.length ? "ไม่พบบอร์ดที่ค้นหา" : "ยังไม่มีบอร์ด"}</p>
      ) : (
        <ul className="admin-list">
          {shown.map((b) => (
            <li key={b.slug} className="admin-card">
              <div className="admin-card-main">
                <div className="admin-card-title">
                  <a href={`/b/${b.slug}`} target="_blank" rel="noreferrer">{b.title}</a>
                  {b.locked && <span className="badge">ล็อกอยู่</span>}
                </div>
                <div className="admin-card-meta">
                  <span>/{b.slug}</span>
                  <span>สร้าง {fmtDate(b.createdAt)}</span>
                  <span>{b.posts} โพสต์ · {b.photos} รูป</span>
                  {usage?.storage.perBoard[b.slug] ? <span>{fmtBytes(usage.storage.perBoard[b.slug])}</span> : null}
                  <span>{b.lastPost ? `โพสต์ล่าสุด ${fmtDate(b.lastPost)}` : "ยังไม่มีโพสต์"}</span>
                </div>
              </div>
              <div className="admin-card-actions">
                <a className="btn btn-sm btn-primary" href={`/b/${b.slug}`} target="_blank" rel="noreferrer">เปิด (ผู้ดูแล)</a>
                <button className="btn btn-sm" onClick={() => copy(`${origin}/b/${b.slug}`)}>ลิงก์ผู้เข้าร่วม</button>
                <button className="btn btn-sm" onClick={() => download(b.slug, "zip")} disabled={!b.photos}>รูป .zip</button>
                <button className="btn btn-sm" onClick={() => download(b.slug, "csv")}>CSV</button>
                <button className="btn btn-sm" disabled={busy === `${b.slug}:rotate`}
                  onClick={() => window.confirm("ออกลิงก์ผู้ดูแลใหม่? ลิงก์ผู้ดูแลเดิมของบอร์ดนี้จะใช้ไม่ได้ทันที") && act(b.slug, "rotate")}>
                  ออกลิงก์ผู้ดูแลใหม่
                </button>
                <button className="btn btn-sm btn-danger" disabled={busy === `${b.slug}:delete`} onClick={() => confirmDelete(b)}>
                  {busy === `${b.slug}:delete` ? "กำลังลบ…" : "ลบบอร์ด"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
