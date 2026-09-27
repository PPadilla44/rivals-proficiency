import { heroIdFromName } from "./heroes";

const BASE = "https://marvelrivalsapi.com/api/v1";

export class RivalsApiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "not_found"
      | "private"
      | "unauthorized"
      | "rate_limited"
      | "upstream",
  ) {
    super(message);
  }
}

export type HeroPlaytime = {
  heroId: string;
  playtimeSec: number;
};

export type PlayerStats = {
  uid: string;
  name: string;
  heroes: HeroPlaytime[];
  /** Hero names the API returned that we could not match to the roster. */
  unmatched: string[];
};

type Fetcher = typeof fetch;

function apiKey(): string {
  const key = process.env.MARVEL_RIVALS_API_KEY;
  if (!key) {
    throw new RivalsApiError(
      "Stats sync is not set up on this server yet.",
      "not_configured",
    );
  }
  return key;
}

async function call(path: string, fetcher: Fetcher = fetch): Promise<unknown> {
  const res = await fetcher(`${BASE}${path}`, {
    headers: { "x-api-key": apiKey(), accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) throw new RivalsApiError("No player found with that name or UID.", "not_found");
  if (res.status === 401 || res.status === 403)
    throw new RivalsApiError("The stats service rejected our API key.", "unauthorized");
  if (res.status === 429)
    throw new RivalsApiError("The stats service is busy. Try again in a few minutes.", "rate_limited");
  if (!res.ok) throw new RivalsApiError(`The stats service returned ${res.status}.`, "upstream");
  return res.json();
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

/** Resolve a username to a UID. Numeric input is treated as a UID already. */
export async function resolvePlayer(
  query: string,
  fetcher?: Fetcher,
): Promise<{ uid: string; name: string }> {
  const q = query.trim();
  if (/^\d{5,}$/.test(q)) {
    const stats = await fetchPlayerStats(q, fetcher);
    return { uid: stats.uid, name: stats.name };
  }
  const body = await call(`/find-player/${encodeURIComponent(q)}`, fetcher);
  if (!isObj(body) || body.uid == null) {
    throw new RivalsApiError("No player found with that name.", "not_found");
  }
  return { uid: String(body.uid), name: String(body.name ?? q) };
}

/** Ask the stats service to refresh a player. It allows one request per 30 minutes. */
export async function requestPlayerUpdate(uid: string, fetcher?: Fetcher): Promise<void> {
  await call(`/player/${encodeURIComponent(uid)}/update`, fetcher);
}

export async function fetchPlayerStats(uid: string, fetcher?: Fetcher): Promise<PlayerStats> {
  const body = await call(`/player/${encodeURIComponent(uid)}`, fetcher);
  return parsePlayerStats(body, uid);
}

/**
 * Pull per-hero playtime out of a player stats response. Ranked and unranked
 * lists are summed. Defensive about shape because the API is unofficial.
 */
export function parsePlayerStats(body: unknown, fallbackUid: string): PlayerStats {
  if (!isObj(body)) throw new RivalsApiError("Unexpected response from the stats service.", "upstream");
  const player = isObj(body.player) ? body.player : {};
  const isPrivate = body.isPrivate === true || player.isPrivate === true;

  const totals = new Map<string, number>();
  const unmatched = new Set<string>();
  for (const listKey of ["heroes_ranked", "heroes_unranked"]) {
    const list = body[listKey];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!isObj(entry)) continue;
      const name = typeof entry.hero_name === "string" ? entry.hero_name : "";
      if (!name) continue;
      const id = heroIdFromName(name);
      if (!id) {
        unmatched.add(name);
        continue;
      }
      totals.set(id, (totals.get(id) ?? 0) + num(entry.play_time));
    }
  }

  if (isPrivate && totals.size === 0) {
    throw new RivalsApiError(
      "This profile is private in game. Turn on a public career profile in Marvel Rivals settings, then sync again.",
      "private",
    );
  }

  return {
    uid: String(body.uid ?? player.uid ?? fallbackUid),
    name: String(body.name ?? player.name ?? player.nickname ?? ""),
    heroes: [...totals].map(([heroId, playtimeSec]) => ({ heroId, playtimeSec: Math.round(playtimeSec) })),
    unmatched: [...unmatched],
  };
}
