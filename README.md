# SoulScity Board · บอร์ดเวิร์กช็อป

**Live:** https://board.soulscity.co.th (also https://workshop-board-iota.vercel.app)

A Padlet-style board for in-person workshops. Participants scan a QR code and post notes and photos from their phones. They don't need an account.

- **Stack:** Next.js 15 (App Router, TypeScript) on Vercel, with Neon Postgres for data and Vercel Blob for photos.
- **Live updates:** each phone checks for changes every ~4 s. There are no websockets.
- **UI:** Thai text, Mitr font, mobile-first, SoulScity CI (deep teal `#0F3B40` with the round S logo).

## Features

| | |
|---|---|
| Boards | Title, optional columns, a public link `/b/[slug]`, a secret admin link `/b/[slug]?admin=[key]`, and a QR code (with a large "show on screen" view) |
| Posting | No login. Nickname is remembered on the device, with an anonymous option. Posts can have text and/or up to 6 photos, a colour and a column |
| Photos | "ถ่ายรูป" (camera) and "เลือกจากคลังภาพ" (gallery) buttons. Photos are resized in the browser to a 1600 px long edge (JPEG 0.8) with a 480 px thumbnail. HEIC is supported and EXIF rotation is fixed, which also strips GPS data. Per-photo progress bar and tap-to-retry. Uploads go straight to Blob. Tap a photo to view it full screen (swipe between photos) |
| Reactions | ♥ like, one per device (can be toggled off) |
| Facilitator | Delete post, lock/unlock, clear board, download all photos (.zip), export CSV (opens correctly in Excel with Thai) |
| Safety | 10 posts/min per device, limits on uploads and likes, image types checked on the server (JPEG/PNG/WebP, 10 MB max), photo URLs must belong to our Blob store and board, admin key is 256-bit random and stored only as a SHA-256 hash |

## Sized for ~400 people in one room

| Concern | How it's handled |
|---|---|
| 400 phones × poll every 4 s ≈ 100 req/s | `GET /api/b/[slug]/feed?since=<version>` returns only changes since a board **version number**. Every client at the same version requests the same URL, so the Vercel CDN serves it from cache (`s-maxage=2`). Postgres sees only a few queries per second. Polling pauses when the tab is hidden and backs off on errors. |
| Photo bandwidth (photo views × 400 viewers) | Cards load the ~40 KB thumbnail, lazily. The full 1600 px photo loads only in the full-screen viewer. Blob files are cached for a year. |
| Shared venue Wi-Fi = one public IP | Rate limits are **per device** (10 posts/min). The per-IP limit is a high ceiling (300/min) so a whole room behind one NAT isn't blocked. |
| Upload spikes | Photos go browser → Blob directly. Our server only signs a short-lived token. |
| Rendering 800+ cards on a phone | Cards that don't change aren't re-rendered, `content-visibility: auto` skips work for off-screen cards, and images are lazy-loaded. |

**Plan note:** Vercel Hobby is for non-commercial use only, so paid client workshops should run on Vercel **Pro**. Neon's free plan is enough for this load because the CDN absorbs most polling.

## Why Postgres (Neon) rather than Redis

The data is relational: boards → columns → posts → likes. "Delete post", "clear board", "CSV export" and "posts changed since version N" are each a single SQL statement. Deleting a board cleans up everything under it automatically. Rate limiting is a small table in the same database, so there is one data service, not two. Redis would only be worth it at thousands of concurrent writers.

## Setup

### 1. Vercel project + storage
1. Import this repo in Vercel (framework: Next.js).
2. **Storage → Create → Blob.** Connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. **Storage → Create → Neon (Marketplace).** Choose the Singapore region (`aws-ap-southeast-1`) and connect it to the project. This adds `DATABASE_URL`.
4. Deploy. Tables are created automatically on the first request.
5. Keep **Deployment Protection** at "Standard" so the production URL is public.

Pushes to `main` deploy to production automatically (Vercel ↔ GitHub link).

Custom domain: `board.soulscity.co.th` (subdomain of the SoulScity zone on Vercel DNS, attached only to this project).

Functions run in `sin1` (Singapore) to sit next to the database (`vercel.json`).

### 2. Environment variables

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon connection string (`POSTGRES_URL` also works) |
| `BLOB_READ_WRITE_TOKEN` | ✅ | From the Blob store |
| `CREATE_BOARD_PASSWORD` | optional | If set, the home page asks for this password before anyone can create a board |

### 3. Local development
```bash
npm install
vercel env pull .env.local   # or copy .env.example and fill it in
npm run dev
```

## Creating a board (facilitator)
1. Open the site's home page. Enter a title and optional columns (e.g. "ความคาดหวัง", "สิ่งที่ได้เรียนรู้"), then tap **สร้างบอร์ด**.
2. You get:
   - **Public link + QR code.** Show it on screen or print it.
   - **Admin link** (`…?admin=…`). Save it somewhere safe; it isn't shown again. This browser also remembers it under "บอร์ดของฉัน".
3. Open the admin link. The key is removed from the address bar right away, so it's safe to project the screen. A **ผู้ดูแล** button appears with QR display, lock/unlock, zip/CSV export and clear board, and each card gets a **ลบ** (delete) button.

## Presenter mode (laptop + projector on an extended screen)
Similar to Canva's presenter view:
1. Open the **admin link** on the laptop, then **ผู้ดูแล → โหมดผู้นำเสนอ** (presenter mode).
2. A second window (`/b/[slug]/present`) opens. In Chrome/Edge it moves itself onto the other screen when allowed. Otherwise drag it to the projector. Click it once to go full screen.
3. The laptop becomes the console:
   - **On screen now**: a live preview of the projector.
   - **Next**: the slide that comes next. New posts jump the queue and are marked ✨.
   - **Modes**: slideshow, board wall, join QR, blank screen.
   - **Board wall**: the preview is the real wall, laid out at the projector's resolution and scaled down. Scroll it with the trackpad and the projector scrolls with it. Click a photo to expand it on the projector (← → for more photos, Esc to close). Scrolling or clicking directly on the projector window also works, and the laptop preview follows.
   - **Filmstrip**: click any post to put it on screen. ✕ deletes the post.
   - **Timer**: time since presenter mode started, with reset.
4. **Shortcuts** (presentation clickers work too): ← → / PageUp PageDown change slides (in board mode they scroll the wall; with a photo expanded they move between photos), Space play/pause, B or `.` blank screen, Esc close photo, S / W / Q switch to slides / wall / QR.

Both windows talk through `BroadcastChannel`, so they must be in the same browser on the same computer. If the projector window is reloaded, it picks up the current screen again.

## Project layout
```
src/app/page.tsx                    home: create board
src/app/b/[slug]/page.tsx           board page
src/app/api/boards                  POST create board
src/app/api/b/[slug]/feed           GET changes since version (CDN-cached)
src/app/api/b/[slug]/posts          POST new post
src/app/api/b/[slug]/posts/[id]/like
src/app/api/b/[slug]/admin          verify / lock / unlock / delete / clear
src/app/api/b/[slug]/export/{csv,zip}
src/app/api/upload                  Blob client-upload token
src/lib/image.ts                    in-browser resize / HEIC / EXIF
src/lib/db.ts                       schema + Neon client
src/app/b/[slug]/present            projector window for presenter mode
src/components/                     Board, Composer, PostCard, Viewer, Qr, Masonry,
                                    Slideshow, Stage, Presenter, Display
```
