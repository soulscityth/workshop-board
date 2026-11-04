"use client";
import { forwardRef, useEffect, useState } from "react";
import type { Column, Post } from "@/lib/types";
import Masonry from "./Masonry";
import PostCard, { timeAgo } from "./PostCard";
import Qr from "./Qr";

export type Zoom = { post: Post; i: number } | null;

export const colsForWidth = (w: number) => (w < 340 ? 1 : w < 720 ? 2 : w < 1040 ? 3 : w < 1360 ? 4 : 5);
const noop = () => {};

type Props = {
  posts: Post[]; // filtered, newest first
  columns: Column[];
  filter: number | "all";
  title: string;
  publicUrl: string;
  width: number; // layout width of the screen this wall is drawn for
  onScroll?: (top: number) => void;
  onOpen?: (p: Post, i: number) => void;
};

/** The live board as shown on the projector (also rendered, scaled, inside the presenter console). */
const BoardWall = forwardRef<HTMLDivElement, Props>(function BoardWall(
  { posts, columns, filter, title, publicUrl, width, onScroll, onOpen },
  ref,
) {
  const colName = new Map(columns.map((c) => [c.id, c.name]));
  return (
    <div className="display-board">
      <div className="wall-scroll" ref={ref} onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}>
        <header className="display-board-head">
          <h1>{title}{filter !== "all" && colName.get(filter) ? ` · ${colName.get(filter)}` : ""}</h1>
          {publicUrl && (
            <div className="display-board-join">
              <span>สแกนเพื่อโพสต์<br /><b>{publicUrl.replace(/^https?:\/\//, "")}</b></span>
              <Qr value={publicUrl} className="display-board-qr" />
            </div>
          )}
        </header>
        <div className="masonry">
          {posts.length === 0 ? (
            <p className="wall-empty">ยังไม่มีโพสต์ — สแกน QR เพื่อเริ่มโพสต์</p>
          ) : (
            <Masonry
              items={posts}
              cols={Math.max(3, colsForWidth(width))}
              render={(p, wide, w) => (
                <PostCard post={p} wide={wide} sizes={`${Math.round(w)}px`} liked={false}
                  columnName={filter === "all" && p.c != null ? colName.get(p.c) : undefined}
                  isAdmin={false} onLike={noop} onOpen={onOpen ?? noop} onDelete={noop} />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
});
export default BoardWall;

/** A photo expanded over the board (projector + console preview). */
export function ZoomView({ zoom, onClose }: { zoom: NonNullable<Zoom>; onClose?: () => void }) {
  const ph = zoom.post.p[zoom.i];
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [ph?.u]);
  if (!ph) return null;
  const p = zoom.post;
  return (
    <div className="zoom-view" onClick={onClose}>
      <img className="ss-bg" src={ph.s} alt="" aria-hidden />
      <img key={ph.u} className="zoom-img" src={ph.u} alt="" onLoad={() => setLoaded(true)}
        style={loaded ? undefined : { backgroundImage: `url("${ph.s}")` }} />
      <div className="ss-caption">
        {p.t && <p className="ss-text">{p.t}</p>}
        <p className="ss-who">
          {p.a ?? "ไม่ระบุชื่อ"} · {timeAgo(p.at)}
          {p.p.length > 1 && ` · รูป ${zoom.i + 1}/${p.p.length}`}
          {p.l > 0 && ` · ♥ ${p.l}`}
        </p>
      </div>
    </div>
  );
}
