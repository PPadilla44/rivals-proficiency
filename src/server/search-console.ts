import { createSign } from "node:crypto";

/**
 * Google Search Console numbers for the daily digest.
 *
 * Needs GOOGLE_SERVICE_ACCOUNT_JSON (the service account's JSON key file, as
 * one value) in the environment, and that service account added as a user on
 * the Search Console property. Without it, the digest leaves this section out.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DOMAIN = "rivalsproficiency.com";

type Fetch = typeof fetch;
type Key = { client_email: string; private_key: string };

export const searchConsoleConfigured = () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function readKey(): Key {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "";
  const key = JSON.parse(raw) as Partial<Key>;
  if (!key.client_email || !key.private_key) throw new Error("service account key is missing client_email or private_key");
  return { client_email: key.client_email, private_key: key.private_key };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The signed request Google exchanges for a short-lived access token. */
export function signJwt(key: Key, now = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 600 }));
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(key.private_key);
  return `${head}.${claims}.${b64url(signature)}`;
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return (await res.json()) as T;
}

type Row = { keys?: string[]; clicks: number; impressions: number; position: number };
export type SearchTotals = { clicks: number; impressions: number; position: number | null };
export type SearchReport = {
  /** Inclusive dates (YYYY-MM-DD) of the 7 days reported. */
  from: string;
  to: string;
  now: SearchTotals;
  before: SearchTotals;
  queries: { query: string; clicks: number; impressions: number; position: number }[];
  pages: { path: string; clicks: number; impressions: number }[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);
const totals = (rows: Row[] | undefined): SearchTotals => {
  const r = rows?.[0];
  return r ? { clicks: r.clicks, impressions: r.impressions, position: r.position } : { clicks: 0, impressions: 0, position: null };
};

/** The last 7 days of search data ending yesterday, next to the 7 days before. */
export async function getSearchReport(opts: { now?: Date; fetchFn?: Fetch } = {}): Promise<SearchReport> {
  const now = opts.now ?? new Date();
  const f = opts.fetchFn ?? fetch;
  const signal = () => AbortSignal.timeout(8_000);

  const token = await json<{ access_token: string }>(
    await f(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(readKey(), now) }),
      signal: signal(),
    }),
    "Google sign-in",
  );
  const auth = { authorization: `Bearer ${token.access_token}` };

  // The property is either a domain property or a URL one; use whichever this account can see.
  let site = process.env.GSC_SITE_URL;
  if (!site) {
    const list = await json<{ siteEntry?: { siteUrl: string }[] }>(await f(`${API}/sites`, { headers: auth, signal: signal() }), "Search Console sites");
    site = list.siteEntry?.map((s) => s.siteUrl).find((u) => u.includes(DOMAIN));
    if (!site) throw new Error("this service account has no access to the Search Console property yet");
  }

  const at = (daysAgo: number) => day(new Date(now.getTime() - daysAgo * 86_400_000));
  const query = async (startDate: string, endDate: string, dimensions: string[], rowLimit: number) =>
    (
      await json<{ rows?: Row[] }>(
        await f(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          // "all" includes the most recent days, which Google still marks as preliminary.
          body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, dataState: "all" }),
          signal: signal(),
        }),
        "Search Console query",
      )
    ).rows;

  const [from, to] = [at(7), at(1)];
  const [cur, prev, queries, pages] = await Promise.all([
    query(from, to, [], 1),
    query(at(14), at(8), [], 1),
    query(from, to, ["query"], 5),
    query(from, to, ["page"], 5),
  ]);
  return {
    from,
    to,
    now: totals(cur),
    before: totals(prev),
    queries: (queries ?? []).map((r) => ({ query: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position })),
    pages: (pages ?? []).map((r) => ({
      path: (r.keys?.[0] ?? "").replace(/^https?:\/\/[^/]+/, "") || "/",
      clicks: r.clicks,
      impressions: r.impressions,
    })),
  };
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The digest's Google Search section. */
export function searchLines(r: SearchReport): string[] {
  const pos = r.now.position == null ? "none" : r.now.position.toFixed(1);
  return [
    `**Google Search** · 7 days, ${shortDate(r.from)} to ${shortDate(r.to)} (previous 7 days in brackets)`,
    `Clicks ${r.now.clicks} (${r.before.clicks}) · shown ${r.now.impressions} times (${r.before.impressions}) · average position ${pos}`,
    ...r.queries.map((q) => `• "${q.query}": ${q.clicks} clicks of ${q.impressions}, position ${q.position.toFixed(1)}`),
    r.pages.length ? `Pages: ${r.pages.map((p) => `${p.path} ${p.clicks} of ${p.impressions}`).join(", ")}` : `Pages: no data`,
  ];
}

/** Lines for the digest, or a one-line note if Google could not be read. Empty when not set up. */
export async function searchSection(opts: { now?: Date; fetchFn?: Fetch } = {}): Promise<string[]> {
  if (!searchConsoleConfigured()) return [];
  try {
    return searchLines(await getSearchReport(opts));
  } catch (e) {
    console.error("search console failed", e);
    return [`**Google Search**`, `Could not be read today (${e instanceof Error ? e.message.slice(0, 120) : "unknown error"})`];
  }
}
