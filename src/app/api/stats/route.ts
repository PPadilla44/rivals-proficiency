import { getDb } from "@/db";
import { getCachedSearch } from "@/app/stats/search-cache";
import { parseRange } from "@/server/dashboard";
import { buildAdminStats, parseView, statsToken, tokenMatches, type SearchPart } from "@/server/admin-stats";
import { searchConsoleConfigured } from "@/server/search-console";

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };

/**
 * The /stats numbers as JSON, for reading them away from the site (for example from a phone, through Claude).
 *
 *   GET /api/stats?view=overview|features|sources|cohorts|problems|search  (default: all)&range=7|30|all  (default 7)
 *   Authorization: Bearer <STATS_TOKEN>
 *
 * Off (404) until STATS_TOKEN is set in Vercel to something at least 24 characters long. Aggregates only, with the
 * same owner exclusion as /stats. The token goes in a header, never in the URL, so it stays out of logs and history.
 */
export async function GET(req: Request) {
  const token = statsToken();
  if (!token || !process.env.DATABASE_URL) return new Response("Not found", { status: 404, headers: HEADERS });
  if (!tokenMatches(req.headers.get("authorization"), token)) {
    return new Response("Unauthorized", { status: 401, headers: { ...HEADERS, "www-authenticate": "Bearer" } });
  }

  const url = new URL(req.url);
  const search = async (): Promise<SearchPart> => {
    if (!searchConsoleConfigured()) return { state: "off" };
    try {
      const { report, daily } = await getCachedSearch();
      return { state: "ok", report, daily };
    } catch (e) {
      console.error("stats api search failed", e);
      return { state: "failed" };
    }
  };

  const data = await buildAdminStats(getDb(), {
    view: parseView(url.searchParams.get("view")),
    range: parseRange(url.searchParams.get("range")),
    search,
  });
  return Response.json(data, { headers: HEADERS });
}
