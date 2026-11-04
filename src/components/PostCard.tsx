"use client";
import { memo } from "react";
import { colorBg } from "@/lib/colors";
import { frameRatio, thumbWidth, type Photo, type Post } from "@/lib/types";
import { IconHeart } from "./icons";

const rtf = typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl ? new Intl.RelativeTimeFormat("th", { numeric: "auto" }) : null;
export function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "เมื่อสักครู่";
  if (!rtf) return new Date(ms).toLocaleTimeString("th-TH");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

/** Let the browser pick the thumbnail on phones and the full photo on big/projector screens. */
function Img({ ph, sizes }: { ph: Photo; sizes: string }) {
  const sw = thumbWidth(ph);
  return (
    <img
      src={ph.s}
      srcSet={sw < ph.w ? `${ph.s} ${sw}w, ${ph.u} ${ph.w}w` : undefined}
      sizes={sizes}
      alt=""
      loading="lazy"
      decoding="async"
    />
  );
}

type Props = {
  post: Post;
  sizes: string; // CSS width of one card, e.g. "50vw"
  liked: boolean;
  columnName?: string;
  isAdmin: boolean;
  onLike: (p: Post) => void;
  onOpen: (p: Post, index: number) => void;
  onDelete: (p: Post) => void;
};

function PostCard({ post, sizes, liked, columnName, isAdmin, onLike, onOpen, onDelete }: Props) {
  const n = post.p.length;
  const shown = n > 4 ? post.p.slice(0, 4) : post.p;
  const gridClass = n === 0 ? "" : n === 1 ? "n1" : n === 2 ? "n2" : n === 3 ? "n3" : n === 4 ? "n4" : "nmany";
  return (
    <article className="card" style={{ background: colorBg(post.k) }}>
      {n > 0 && (
        <div className={`card-photos ${gridClass}`}>
          {shown.map((ph, i) => (
            <button key={ph.s + i} onClick={() => onOpen(post, i)} aria-label={`ดูรูปที่ ${i + 1} แบบเต็มจอ`}
              style={n === 1 ? { aspectRatio: frameRatio(ph) } : n === 3 && i === 0 ? { gridColumn: "1 / -1", aspectRatio: "2 / 1" } : undefined}>
              <Img ph={ph} sizes={n === 1 || (n === 3 && i === 0) ? sizes : `calc(${sizes} / 2)`} />
              {i === 3 && n > 4 && <span className="more-badge">+{n - 4}</span>}
            </button>
          ))}
        </div>
      )}
      {columnName && <span className="col-tag">{columnName}</span>}
      {post.t && <div className="card-body">{post.t}</div>}
      <div className="card-meta">
        <span className="who">
          {post.a ?? "ไม่ระบุชื่อ"}
          <span className="when">{timeAgo(post.at)}</span>
        </span>
        {isAdmin && (
          <button className="del-btn" onClick={() => onDelete(post)}>ลบ</button>
        )}
        <button className="like-btn" aria-pressed={liked} aria-label={liked ? "เลิกถูกใจ" : "ถูกใจ"} onClick={() => onLike(post)}>
          <IconHeart filled={liked} />
          <span>{post.l > 0 ? post.l : ""}</span>
        </button>
      </div>
    </article>
  );
}

export default memo(PostCard);
