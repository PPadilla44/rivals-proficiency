import { HEROES, type Hero } from "./heroes";
import {
  CHAMPION,
  DEFAULT_POINTS_PER_HOUR,
  LORD,
  MAX_LEVEL,
  estimateLevel,
  hoursToLevel,
  nextMilestone,
  rankLevels,
  tierOf,
  type Estimate,
} from "./proficiency";

export type LevelEntry = { level: number; baselinePlaytimeSec: number | null; approx?: boolean };

export type HeroRow = Hero & {
  /** Level the player set (1 if never set). */
  level: number;
  /** True once the player has entered a level for this hero. */
  touched: boolean;
  /** Only the rank is known (from a screenshot import); the level is that rank's first level. */
  approx: boolean;
  /** Estimate from playtime since the level was set, when stats are linked. */
  estimate: Estimate | null;
  /** The level used for sorting, filtering and progress: the estimate if higher. */
  effective: number;
  /** Hours of play to the next milestone for heroes the player has set: their learned rate when linked, else the default. */
  hoursToNext: number | null;
};

export function buildRows(
  levels: Record<string, LevelEntry>,
  playtime: Record<string, number>,
  opts: { linked: boolean; pointsPerHour: number | null },
): HeroRow[] {
  const rate = opts.pointsPerHour ?? DEFAULT_POINTS_PER_HOUR;
  return HEROES.map((h) => {
    const entry = levels[h.id];
    const level = entry?.level ?? 1;
    let estimate: Estimate | null = null;
    const now = playtime[h.id];
    if (opts.linked && entry && entry.baselinePlaytimeSec != null && now != null) {
      estimate = estimateLevel(level, now - entry.baselinePlaytimeSec, rate);
    }
    const effective = estimate ? estimate.level : level;
    const m = nextMilestone(effective);
    const hoursToNext =
      entry && effective < MAX_LEVEL
        ? hoursToLevel(estimate ?? { level: effective, fraction: 0 }, m.to, rate)
        : null;
    return { ...h, level, touched: !!entry, approx: !!entry?.approx, estimate, effective, hoursToNext };
  });
}

export const GOALS = {
  all: { label: "Any level", test: () => true },
  nearLord: { label: "Near Lord (15 to 19)", test: (l: number) => l >= 15 && l < LORD },
  lord: { label: "Lord or higher", test: (l: number) => l >= LORD },
  nearChamp: { label: "Near Champion (40 to 49)", test: (l: number) => l >= 40 && l < CHAMPION },
  champ: { label: "Champion", test: (l: number) => l >= CHAMPION },
  fresh: { label: "Untouched (Lv 1)", test: (l: number) => l === 1 },
} as const;
export type Goal = keyof typeof GOALS;

export const SORTS = {
  "level-desc": "Level, high to low",
  "level-asc": "Level, low to high",
  lord: "Closest to Lord",
  champ: "Closest to Champion",
  name: "Name A to Z",
  role: "Role",
  release: "Release order",
} as const;
export type Sort = keyof typeof SORTS;

export type Contenders = {
  /** What the answer card is chasing: Lord, or Champion once every started hero has reached Lord. */
  target: number;
  /** The highest level the card could be showing right now. */
  leader: number;
  /** Rank-only heroes whose exact level could change which hero is closest, best first. At most `max`. */
  rows: HeroRow[];
  /** How many more contenders there are beyond the ones listed. */
  more: number;
};

/** The levels a rank-only hero could really be at: its rank's levels, never reaching the target. */
export function exactChoices(row: HeroRow, target: number): number[] {
  const [lo, hi] = rankLevels(tierOf(row.level));
  const out: number[] = [];
  for (let l = lo; l <= Math.min(hi, target - 1); l++) out.push(l);
  return out;
}

/**
 * Which rank-only heroes could change the answer. A screenshot import gives each hero the first level of its
 * rank, so a Centurion hero (15 to 19) shows as 15. A hero is a contender when the top of its rank is higher
 * than the card's current leader, so its real level could put it ahead. Heroes whose level the player typed,
 * heroes with a playtime estimate, heroes at or above the target and heroes at level 1 are left out.
 */
export function closestContenders(rows: HeroRow[], max = 5): Contenders | null {
  const started = rows.filter((r) => r.effective > 1);
  const belowLord = started.filter((r) => r.effective < LORD);
  const target = belowLord.length ? LORD : CHAMPION;
  const group = belowLord.length ? belowLord : started.filter((r) => r.effective >= LORD && r.effective < CHAMPION);
  if (!group.length) return null;
  const leader = Math.max(...group.map((r) => r.effective));
  const all = group
    .filter((r) => r.approx && !r.estimate && rankLevels(tierOf(r.level))[1] > leader)
    .sort((a, b) => b.effective - a.effective || a.order - b.order);
  if (!all.length) return null;
  return { target, leader, rows: all.slice(0, max), more: Math.max(0, all.length - max) };
}
