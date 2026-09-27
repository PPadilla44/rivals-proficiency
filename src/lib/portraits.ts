import { heroIdFromName } from "./heroes";

const API = "https://marvelrivalsapi.com/api/v1/heroes";
const IMAGE_BASE = "https://marvelrivalsapi.com/rivals";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Map hero id to a portrait URL from the stats API's hero list. Images are
 * linked from their server, never copied into this repo. Returns an empty map
 * when the API is not configured or unreachable; cards then show monograms.
 */
export async function getHeroPortraits(): Promise<Record<string, string>> {
  const key = process.env.MARVEL_RIVALS_API_KEY;
  if (!key) return {};
  try {
    const res = await fetch(API, {
      headers: { "x-api-key": key, accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return {};
    return parsePortraits(await res.json());
  } catch {
    return {};
  }
}

export function parsePortraits(body: unknown): Record<string, string> {
  const list = Array.isArray(body) ? body : isObj(body) && Array.isArray(body.heroes) ? body.heroes : [];
  const out: Record<string, string> = {};
  for (const h of list) {
    if (!isObj(h) || typeof h.name !== "string") continue;
    const id = heroIdFromName(h.name);
    const raw = [h.imageUrl, h.image, h.icon].find((v): v is string => typeof v === "string" && v.length > 0);
    if (!id || !raw || out[id]) continue;
    out[id] = /^https?:\/\//.test(raw) ? raw : `${IMAGE_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
  }
  return out;
}
