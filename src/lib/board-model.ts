import { HEROES, type Hero } from "./heroes";
import {
  CHAMPION,
  DEFAULT_POINTS_PER_HOUR,
  LORD,
  MAX_LEVEL,
  estimateLevel,
  hoursToLevel,
  nextMilestone,
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
  /** Hours of play to the next milestone, when an earn rate is known. */
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
      opts.linked && entry && effective < MAX_LEVEL
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
