"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BoardMeta, type FeedResponse, type Photo, type Post } from "@/lib/types";
import { deviceId, getJSON, sessionGet, sessionSet, setJSON } from "@/lib/storage";
import PostCard from "./PostCard";
import Composer from "./Composer";
import Viewer from "./Viewer";
import Qr from "./Qr";
import { IconLock, IconMenu, IconPlay, IconPlus, IconQr } from "./icons";
import Slideshow from "./Slideshow";
import Masonry from "./Masonry";

const POLL_MS = 4000;

function useColumnCount() {
  const [n, setN] = useState(2);
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setN(w < 340 ? 1 : w < 720 ? 2 : w < 1040 ? 3 : w < 1360 ? 4 : 5);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return n;
}

export default function Board({ slug, initialTitle }: { slug: string; initialTitle: string }) {
  const [meta, setMeta] = useState<BoardMeta>({ slug, title: initialTitle, locked: false, columns: [] });
  const [posts, setPosts] = useState<Map<number, Post>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [filter, setFilter] = useState<number | "all">("all");
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewer, setViewer] = useState<{ photos: Photo[]; i: number } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState("");
  const [device, setDevice] = useState("");
  const [origin, setOrigin] = useState("");
  const version = useRef(0);
  const likeHold = useRef(new Map<number, { likes: number; until: number }>());
  const cols = useColumnCount();

  const showToast = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? "" : x)), 2600);
  }, []);

  // ---- device, liked set, admin key (stripped from the address bar) ----
  useEffect(() => {
    setDevice(deviceId());
    setOrigin(window.location.origin);
    setLiked(new Set(getJSON<number[]>(`wb:liked:${slug}`, [])));
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("admin");
    if (fromUrl) {
      sessionSet(`wb:admin:${slug}`, fromUrl);
      url.searchParams.delete("admin");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    const key = fromUrl || sessionGet(`wb:admin:${slug}`);
    if (key) {
      fetch(`/api/b/${slug}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": key },
        body: JSON.stringify({ action: "verify" }),
      })
        .then((r) => {
          if (r.ok) setAdminKey(key);
          else showToast("ลิงก์ผู้ดูแลไม่ถูกต้อง");
        })
        .catch(() => {});
    }
  }, [slug, showToast]);

  // ---- polling ----
  const apply = useCallback((data: FeedResponse) => {
    setMeta(data.board);
    const now = Date.now();
    setPosts((prev) => {
      const next = data.reset ? new Map<number, Post>() : new Map(prev);
      if (!data.reset && data.posts.length === 0 && data.deleted.length === 0) return prev;
      for (const p of data.posts) {
        const hold = likeHold.current.get(p.id);
        const old = prev.get(p.id);
        let np = hold && hold.until > now ? { ...p, l: hold.likes } : p;
        // keep object identity when nothing changed → memoised cards don't re-render
        if (old && old.l === np.l && old.t === np.t && old.k === np.k && old.c === np.c && old.p.length === np.p.length) np = old;
        next.set(p.id, np);
      }
      for (const id of data.deleted) next.delete(id);
      return next;
    });
    version.current = data.version;
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let failures = 0;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/b/${slug}/feed?since=${version.current}`);
        if (res.status === 404) {
          showToast("บอร์ดนี้ถูกลบแล้ว");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        apply(await res.json());
        failures = 0;
        setOffline(false);
        setLoaded(true);
      } catch {
        failures++;
        if (failures >= 2) setOffline(true);
      }
      const backoff = failures ? Math.min(30000, POLL_MS * 2 ** failures) : POLL_MS;
      timer = window.setTimeout(tick, backoff + Math.random() * 800);
    };
    void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slug, apply, showToast]);

  // ---- actions ----
  const onPosted = useCallback((p: Post) => {
    setPosts((prev) => new Map(prev).set(p.id, p));
    showToast("โพสต์แล้ว 🎉");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [showToast]);

  const onLike = useCallback(
    async (p: Post) => {
      const on = !liked.has(p.id);
      const nextLiked = new Set(liked);
      if (on) nextLiked.add(p.id);
      else nextLiked.delete(p.id);
      setLiked(nextLiked);
      setJSON(`wb:liked:${slug}`, [...nextLiked].slice(-2000));
      const optimistic = Math.max(0, p.l + (on ? 1 : -1));
      likeHold.current.set(p.id, { likes: optimistic, until: Date.now() + 8000 });
      setPosts((prev) => (prev.has(p.id) ? new Map(prev).set(p.id, { ...prev.get(p.id)!, l: optimistic }) : prev));
      try {
        const res = await fetch(`/api/b/${slug}/posts/${p.id}/like`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device: deviceId(), on }),
        });
        if (!res.ok) throw new Error();
        const d = await res.json();
        likeHold.current.set(p.id, { likes: d.likes, until: Date.now() + 8000 });
        setPosts((prev) => (prev.has(p.id) ? new Map(prev).set(p.id, { ...prev.get(p.id)!, l: d.likes }) : prev));
      } catch {
        likeHold.current.delete(p.id);
        setLiked((s) => {
          const r = new Set(s);
          if (on) r.delete(p.id);
          else r.add(p.id);
          return r;
        });
        setPosts((prev) => (prev.has(p.id) ? new Map(prev).set(p.id, { ...prev.get(p.id)!, l: p.l }) : prev));
        showToast("กดถูกใจไม่สำเร็จ");
      }
    },
    [liked, slug, showToast],
  );

  const admin = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      if (!adminKey) return false;
      const res = await fetch(`/api/b/${slug}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ action, ...extra }),
      }).catch(() => null);
      if (!res?.ok) {
        showToast("ทำรายการไม่สำเร็จ");
        return false;
      }
      return true;
    },
    [adminKey, slug, showToast],
  );

  const onDelete = useCallback(
    async (p: Post) => {
      if (!window.confirm("ลบโพสต์นี้?")) return;
      if (await admin("delete", { postId: p.id })) {
        setPosts((prev) => {
          const n = new Map(prev);
          n.delete(p.id);
          return n;
        });
        showToast("ลบแล้ว");
      }
    },
    [admin, showToast],
  );

  const onOpen = useCallback((p: Post, i: number) => setViewer({ photos: p.p, i }), []);

  function download(kind: "csv" | "zip") {
    if (!adminKey) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/b/${slug}/export/${kind}`;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "key";
    input.value = adminKey;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    form.remove();
    setMenuOpen(false);
    showToast(kind === "zip" ? "กำลังเตรียมไฟล์ zip… (บอร์ดใหญ่อาจใช้เวลาสักครู่)" : "กำลังดาวน์โหลด CSV…");
  }

  async function toggleLock() {
    const action = meta.locked ? "unlock" : "lock";
    if (await admin(action)) {
      setMeta((m) => ({ ...m, locked: !m.locked }));
      showToast(action === "lock" ? "ล็อกบอร์ดแล้ว" : "ปลดล็อกแล้ว");
    }
    setMenuOpen(false);
  }

  async function clearBoard() {
    if (!window.confirm("ล้างบอร์ด: ลบโพสต์และรูปทั้งหมด ไม่สามารถย้อนกลับได้")) return;
    if (!window.confirm("ยืนยันอีกครั้ง — ลบทุกโพสต์ในบอร์ดนี้?")) return;
    setMenuOpen(false);
    if (await admin("clear")) {
      setPosts(new Map());
      showToast("ล้างบอร์ดแล้ว");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("คัดลอกแล้ว");
    } catch {
      window.prompt("คัดลอกลิงก์นี้", text);
    }
  }

  // ---- layout ----
  const colName = useMemo(() => new Map(meta.columns.map((c) => [c.id, c.name])), [meta.columns]);
  const counts = useMemo(() => {
    const m = new Map<number | null, number>();
    for (const p of posts.values()) m.set(p.c, (m.get(p.c) ?? 0) + 1);
    return m;
  }, [posts]);
  const visible = useMemo(() => {
    const arr = [...posts.values()].filter((p) => filter === "all" || p.c === filter);
    arr.sort((a, b) => b.id - a.id);
    return arr;
  }, [posts, filter]);
  const publicUrl = `${origin}/b/${slug}`;
  const isAdmin = !!adminKey;
  const filterValid = filter === "all" || meta.columns.some((c) => c.id === filter);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <h1 className="board-title">{meta.title}</h1>
          {meta.locked && <span className="muted" title="บอร์ดถูกล็อก"><IconLock /></span>}
          <button className="icon-btn" onClick={() => setSlideshow(true)} aria-label="เล่นสไลด์โชว์" title="สไลด์โชว์"><IconPlay /></button>
          <button className="icon-btn" onClick={() => setQrOpen(true)} aria-label="แสดง QR code"><IconQr /></button>
          {isAdmin && (
            <button className="btn btn-sm" onClick={() => setMenuOpen(true)} aria-label="เมนูผู้ดูแล">
              <IconMenu /> ผู้ดูแล
            </button>
          )}
        </div>
        {meta.columns.length > 0 && (
          <nav className="tabs" aria-label="คอลัมน์">
            <button className="tab" aria-pressed={filter === "all" || !filterValid} onClick={() => setFilter("all")}>
              ทั้งหมด<span className="count">{posts.size}</span>
            </button>
            {meta.columns.map((c) => (
              <button key={c.id} className="tab" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
                {c.name}<span className="count">{counts.get(c.id) ?? 0}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      {meta.locked && <div className="status-strip locked">🔒 บอร์ดถูกล็อก ไม่รับโพสต์ใหม่</div>}
      {offline && <div className="status-strip offline">การเชื่อมต่อขัดข้อง กำลังลองใหม่…</div>}

      {loaded && visible.length === 0 ? (
        <div className="empty">
          <div className="big">📝</div>
          <p>ยังไม่มีโพสต์{filter !== "all" && filterValid ? "ในคอลัมน์นี้" : ""}<br />กดปุ่ม “โพสต์” ด้านล่างเพื่อเริ่มเลย</p>
        </div>
      ) : !loaded ? (
        <div className="empty"><p>กำลังโหลด…</p></div>
      ) : (
        <main className="masonry">
          <Masonry
            items={visible}
            cols={cols}
            render={(p, wide, width) => (
              <PostCard
                post={p}
                wide={wide}
                sizes={`${Math.round(width)}px`}
                liked={liked.has(p.id)}
                columnName={filter === "all" && p.c != null ? colName.get(p.c) : undefined}
                isAdmin={isAdmin}
                onLike={onLike}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            )}
          />
        </main>
      )}

      <button className="fab" onClick={() => setComposerOpen(true)} disabled={meta.locked || !device}>
        {meta.locked ? <><IconLock /> ล็อกแล้ว</> : <><IconPlus /> โพสต์</>}
      </button>

      {device && (
        <Composer
          open={composerOpen}
          slug={slug}
          device={device}
          columns={meta.columns}
          defaultColumn={filter === "all" ? null : filter}
          locked={meta.locked}
          onClose={() => setComposerOpen(false)}
          onPosted={onPosted}
        />
      )}

      {viewer && <Viewer photos={viewer.photos} start={viewer.i} onClose={() => setViewer(null)} />}

      {qrOpen && (
        <div className="overlay" style={{ alignItems: "center" }} onClick={() => setQrOpen(false)}>
          <div className="present" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>{meta.title}</h2>
            <p className="muted" style={{ margin: "0 0 12px" }}>สแกนเพื่อเข้าร่วมบอร์ด</p>
            {origin && <Qr value={publicUrl} />}
            <div className="url">{publicUrl.replace(/^https?:\/\//, "")}</div>
            <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
              <button className="btn btn-sm" onClick={() => copy(publicUrl)}>คัดลอกลิงก์</button>
              <button className="btn btn-sm btn-primary" onClick={() => setQrOpen(false)}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {menuOpen && isAdmin && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setMenuOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="เมนูผู้ดูแล">
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h2>เมนูผู้ดูแล</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setMenuOpen(false)}>ปิด</button>
            </div>
            <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>{posts.size} โพสต์ · แตะ “ลบ” บนการ์ดเพื่อลบโพสต์</p>
            <div className="admin-menu">
              <button className="btn" onClick={() => { setMenuOpen(false); setQrOpen(true); }}>📱 แสดง QR ขึ้นจอ</button>
              <button className="btn" onClick={() => { setMenuOpen(false); setSlideshow(true); }}>▶️ เล่นสไลด์โชว์ (ขึ้นจอโปรเจกเตอร์)</button>
              <button className="btn" onClick={toggleLock}>{meta.locked ? "🔓 ปลดล็อกบอร์ด (เปิดรับโพสต์)" : "🔒 ล็อกบอร์ด (หยุดรับโพสต์)"}</button>
              <button className="btn" onClick={() => download("zip")}>🗂️ ดาวน์โหลดรูปทั้งหมด (.zip)</button>
              <button className="btn" onClick={() => download("csv")}>📄 ส่งออกโพสต์เป็น CSV</button>
              <button className="btn" onClick={() => copy(publicUrl)}>🔗 คัดลอกลิงก์ผู้เข้าร่วม</button>
              <button className="btn" onClick={() => adminKey && copy(`${publicUrl}?admin=${adminKey}`)}>🔑 คัดลอกลิงก์ผู้ดูแล</button>
              <button className="btn btn-danger" onClick={clearBoard}>🗑️ ล้างบอร์ด (ลบทุกโพสต์)</button>
            </div>
          </div>
        </div>
      )}

      {slideshow && (
        <Slideshow
          posts={visible}
          title={filter !== "all" && filterValid ? `${meta.title} · ${colName.get(filter as number) ?? ""}` : meta.title}
          publicUrl={publicUrl}
          onClose={() => setSlideshow(false)}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
