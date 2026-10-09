import { and, eq, sql } from "drizzle-orm";
import { events } from "@/db/schema";
import { INDEXNOW_KEY } from "@/lib/site";
import { SITE_URL } from "@/lib/site-url";
import type { AnyDb } from "./board";
import { SERVER_VISITOR, recordEvent } from "./events";

/** Pages worth telling search engines about. Keep in step with the sitemap. */
export const INDEXED_PATHS = ["/", "/calculator", "/ranks"];

type Fetch = typeof fetch;

/**
 * Tell IndexNow engines (Bing, and through it ChatGPT search, Copilot and
 * DuckDuckGo) that the pages changed. Runs from the daily cron and only does
 * anything once per deployed commit, so unchanged pages are never resubmitted.
 */
export async function submitIndexNowOnce(
  db: AnyDb,
  opts: { commit?: string; fetchImpl?: Fetch } = {},
): Promise<{ submitted: boolean; reason?: string; status?: number }> {
  const commit = opts.commit ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (!commit) return { submitted: false, reason: "no commit" };
  const [seen] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.name, "indexnow"), sql`${events.props}->>'commit' = ${commit.slice(0, 12)}`))
    .limit(1);
  if (seen) return { submitted: false, reason: "already submitted" };

  const host = new URL(SITE_URL).host;
  const res = await (opts.fetchImpl ?? fetch)("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: INDEXED_PATHS.map((p) => `${SITE_URL}${p}`),
    }),
  });
  // 200 and 202 both mean accepted.
  const ok = res.status === 200 || res.status === 202;
  if (ok) {
    await recordEvent(db, {
      name: "indexnow",
      visitorId: SERVER_VISITOR,
      props: { commit: commit.slice(0, 12), urls: INDEXED_PATHS.length },
    });
  }
  return { submitted: ok, status: res.status, reason: ok ? undefined : "rejected" };
}
