/** u = full image, s = thumbnail, w/h = full size, sw = thumbnail width (absent on older posts) */
export type Photo = { u: string; s: string; w: number; h: number; sw?: number };

/** Width of the thumbnail; older posts used a 480px-long-edge thumbnail. */
export const thumbWidth = (p: Photo) => p.sw ?? Math.round((p.w * 480) / Math.max(p.w, p.h));
/** Display frame: every portrait gets the same 3:4 box, every landscape 4:3, near-square 1:1. */
export const frameRatio = (p: Photo) => (p.h > p.w * 1.1 ? "3 / 4" : p.w > p.h * 1.1 ? "4 / 3" : "1 / 1");
export const frameHeightPerWidth = (p: Photo) => (p.h > p.w * 1.1 ? 4 / 3 : p.w > p.h * 1.1 ? 3 / 4 : 1);

export type Post = {
  id: number;
  c: number | null; // column id
  a: string | null; // author (null = anonymous)
  t: string; // text
  k: string; // color key
  l: number; // likes
  p: Photo[];
  at: number; // created_at ms
};

export type Column = { id: number; name: string };

export type BoardMeta = {
  slug: string;
  title: string;
  locked: boolean;
  columns: Column[];
};

export type FeedResponse = {
  version: number;
  reset: boolean;
  board: BoardMeta;
  posts: Post[];
  deleted: number[];
};
