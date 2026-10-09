import { HEROES } from "@/lib/heroes";
import {
  CHAMPION,
  DEFAULT_POINTS_PER_HOUR,
  LORD,
  MAX_LEVEL,
  RANKS,
  pointsBetween,
  pointsToNext,
  rankLevels,
} from "@/lib/proficiency";
import { REWARDS } from "@/lib/proficiency-rewards";
import { DATA_CHECKED, DATA_SEASON } from "@/lib/site";
import { SITE_URL } from "@/lib/site-url";

// Built from the same data as the pages, so it never drifts from them.
export const dynamic = "force-static";

const fmt = (n: number) => n.toLocaleString("en-US");
const hours = (points: number) => Math.round(points / DEFAULT_POINTS_PER_HOUR);

function body(): string {
  const ranks = RANKS.map((name, tier) => {
    const [first, last] = rankLevels(tier);
    return `- ${name}: levels ${first} to ${last}, ${fmt(pointsToNext(first))} points per level, ${fmt(pointsBetween(1, first))} points from level 1`;
  });
  const rewards = REWARDS.filter((r) => r.level > 1).map((r) => `- Level ${r.level}: ${r.what.replace("(hero name)", "+ hero name")}`);

  return `# Proficiency Board

> Free, fan-made Marvel Rivals hero proficiency tracker at ${SITE_URL}. It shows every hero's proficiency rank and level on one board, which heroes are closest to Lord and Champion, and the hours of play left; it can read ranks from screenshots of the in-game Heroes tab. Not affiliated with NetEase or Marvel.

Game data checked against the game on ${DATA_CHECKED} (${DATA_SEASON}), ${HEROES.length} heroes.

## Pages

- [Proficiency tracker](${SITE_URL}/): track every hero's proficiency level; works without an account; signing in with Discord or Google syncs the board across devices and enables the screenshot import.
- [Proficiency calculator](${SITE_URL}/calculator): points, hours and finish date from any level to Lord, Champion or level ${MAX_LEVEL}, with the rewards on the way.
- [Proficiency levels and ranks](${SITE_URL}/ranks): all 11 ranks, points per level, and the reward at every level.

## Key facts

- Each hero has its own proficiency level from 1 to ${MAX_LEVEL}; points earned on one hero never count toward another.
- A new rank starts every 5 levels. Lord is level ${LORD}; Champion is level ${CHAMPION} and covers ${CHAMPION} to ${MAX_LEVEL}.
- Lord takes ${fmt(pointsBetween(1, LORD))} points from level 1, about ${hours(pointsBetween(1, LORD))} hours of play on one hero at about ${DEFAULT_POINTS_PER_HOUR} points an hour.
- Champion takes ${fmt(pointsBetween(1, CHAMPION))} points (about ${hours(pointsBetween(1, CHAMPION))} hours); level ${MAX_LEVEL} takes ${fmt(pointsBetween(1, MAX_LEVEL))} (about ${hours(pointsBetween(1, MAX_LEVEL))} hours).
- Points come from each hero's missions (time played, a role quota for damage, healing or blocking, and KOs). Quick Match and Competitive missions repeat without limit; Conquest and Doom Match missions have a daily limit (official patch notes, April 2025); community guides say the 18v18 Annihilation mode counts as an arcade mode with the same kind of limit. Time alone is worth about 60 points an hour per community guides, so most points come from the quotas.
- Points per level are measured by players; the game does not publish them. Hours are averages: finishing the hero's proficiency missions is faster.
- In game, a hero's level shows on its Hero Profile under the Proficiency tab, one hero at a time.

## Ranks

${ranks.join("\n")}

## Rewards (the same track for every hero, with that hero's art)

${rewards.join("\n")}
`;
}

export function GET() {
  return new Response(body(), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
