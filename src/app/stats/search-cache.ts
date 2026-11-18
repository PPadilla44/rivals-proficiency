import { unstable_cache } from "next/cache";
import { getSearchDaily, getSearchReport } from "@/server/search-console";

/** Google's numbers move once a day, so /stats reads them at most every 6 hours. */
export const SEARCH_CACHE_SECONDS = 6 * 60 * 60;

/**
 * The 7-day totals and the per-day clicks, cached across requests. A failure
 * throws, so a bad answer is never cached and the next load tries again.
 * (unstable_cache is the caching call that works without turning on Cache Components, which this site does not use.)
 */
export const getCachedSearch = unstable_cache(
  async () => {
    const [report, daily] = await Promise.all([getSearchReport(), getSearchDaily({ days: 60 })]);
    return { report, daily };
  },
  ["stats-search-v1"],
  { revalidate: SEARCH_CACHE_SECONDS },
);
