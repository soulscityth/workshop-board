import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS boards (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    admin_hash TEXT NOT NULL,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT NOT NULL DEFAULT 1,
    reset_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS board_columns (
    id BIGSERIAL PRIMARY KEY,
    board_id BIGINT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS board_columns_board_idx ON board_columns(board_id, position)`,
  `CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    board_id BIGINT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id BIGINT REFERENCES board_columns(id) ON DELETE SET NULL,
    author TEXT,
    body TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'white',
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    likes INT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS posts_board_version_idx ON posts(board_id, version)`,
  `CREATE TABLE IF NOT EXISTS post_likes (
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    device TEXT NOT NULL,
    PRIMARY KEY (post_id, device)
  )`,
  // Our own count of Blob operations / traffic, for the usage estimate in /admin
  `CREATE TABLE IF NOT EXISTS usage_log (
    day DATE NOT NULL,
    kind TEXT NOT NULL,
    n BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (day, kind)
  )`,
  // One row per device per board per day — estimates how many people loaded each board
  `CREATE TABLE IF NOT EXISTS board_views (
    board_id BIGINT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    device TEXT NOT NULL,
    day DATE NOT NULL,
    full_views INT NOT NULL DEFAULT 0,
    PRIMARY KEY (board_id, device, day)
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT NOT NULL,
    win BIGINT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (key, win)
  )`,
];

let schemaReady: Promise<void> | null = null;

/** Creates tables on first use per server instance (idempotent). */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = sql();
    schemaReady = db
      .transaction(SCHEMA.map((q) => db.query(q)))
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}
