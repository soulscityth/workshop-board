import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ALLOWED_IMAGE_TYPES, cleanDevice, clientIp, err, getBoard, LIMITS, rateLimit } from "@/lib/server";

/**
 * Issues short-lived client-upload tokens for Vercel Blob.
 * The browser uploads directly to Blob; this route only validates and signs.
 */
export async function POST(req: Request) {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return err("ข้อมูลไม่ถูกต้อง");
  }
  const ip = clientIp(req);
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { slug?: string; device?: string } = {};
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {}
        const device = cleanDevice(payload.device);
        const slug = typeof payload.slug === "string" ? payload.slug : "";
        if (!device) throw new Error("invalid device");
        if (!pathname.startsWith(`b/${slug}/`) || !/^b\/[a-z0-9]+\/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$/.test(pathname))
          throw new Error("invalid path");
        const board = await getBoard(slug);
        if (!board) throw new Error("board not found");
        if (board.locked) throw new Error("board locked");
        const ok = await rateLimit([
          { key: `up:d:${device}`, limit: LIMITS.uploadsPerDevicePerMin },
          { key: `up:ip:${ip}`, limit: LIMITS.uploadsPerIpPerMin },
        ]);
        if (!ok) throw new Error("rate limited");
        return {
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          maximumSizeInBytes: LIMITS.maxUploadBytes,
          addRandomSuffix: true,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload error";
    const status = msg === "rate limited" ? 429 : msg === "board locked" ? 423 : 400;
    return err(msg, status);
  }
}
