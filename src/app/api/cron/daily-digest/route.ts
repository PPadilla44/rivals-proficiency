import { getDb } from "@/db";
import { screenshotDailyCap } from "@/flags";
import { buildDigest, sendDailyDigest } from "@/server/digest";
import { submitIndexNowOnce } from "@/server/indexnow";

/**
 * Daily digest to the alert channel, called by Vercel Cron (see vercel.json).
 *
 * When CRON_SECRET is set in Vercel, Vercel sends it with the cron request and
 * anything else is refused. Without it, the route still cannot be abused much:
 * at most one scheduled digest goes out every 12 hours, and the reply never includes the numbers.
 */
export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) return new Response("Not configured", { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getDb();
  const cap = await screenshotDailyCap().catch(() => undefined);

  // Previews are behind Vercel sign-in: show the text there for checking, and send nothing.
  if (process.env.VERCEL_ENV !== "production") {
    return new Response(await buildDigest(db, { cap }), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const result = await sendDailyDigest(db, { cap });
  // Once per deployed commit: tell Bing and other IndexNow engines the pages changed.
  const indexNow = await submitIndexNowOnce(db).catch((e) => ({ submitted: false, reason: String(e).slice(0, 80) }));
  return Response.json({ sent: result.sent, reason: result.reason ?? null, indexNow });
}
