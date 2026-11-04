export type Photo = { u: string; s: string; w: number; h: number };

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
