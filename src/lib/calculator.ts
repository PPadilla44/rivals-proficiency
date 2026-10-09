import {
  CHAMPION,
  DEFAULT_POINTS_PER_HOUR,
  LORD,
  MAX_LEVEL,
  RANKS,
  clampLevel,
  pointsBetween,
  rankLevels,
  type RankName,
} from "./proficiency";
import { REWARDS, type Reward } from "./proficiency-rewards";

export type Goal = { level: number; label: string };

/** The goals offered in the picker: every rank from the next one up, plus max level. */
export function goalOptions(current: number): Goal[] {
  const from = clampLevel(current);
  const out: Goal[] = [];
  RANKS.forEach((name, tier) => {
    const [first] = rankLevels(tier);
    if (first > from) out.push({ level: first, label: `${name} (level ${first})` });
  });
  if (from < MAX_LEVEL) out.push({ level: MAX_LEVEL, label: `Max (level ${MAX_LEVEL})` });
  return out;
}

/** Lord if not there yet, then Champion, then max. */
export function defaultGoal(current: number): number {
  const l = clampLevel(current);
  if (l < LORD) return LORD;
  if (l < CHAMPION) return CHAMPION;
  return MAX_LEVEL;
}

export type Stop = {
  level: number;
  rank: RankName;
  /** What to call this stop: the rank, or "Level 70" for the max (Champion already starts at 50). */
  label: string;
  points: number;
  hours: number;
  days: number | null;
};

export type Plan = {
  from: number;
  to: number;
  points: number;
  hours: number;
  /** Calendar days at the given hours per week, or null when no weekly hours are set. */
  days: number | null;
  /** Each rank reached on the way, ending at the goal. */
  stops: Stop[];
  /** Rewards unlocked after the current level, up to and including the goal. */
  rewards: Reward[];
};

export function plan(
  current: number,
  goal: number,
  hoursPerWeek: number | null,
  pointsPerHour: number = DEFAULT_POINTS_PER_HOUR,
): Plan {
  const from = clampLevel(current);
  const to = Math.max(from, clampLevel(goal));
  const perWeek = hoursPerWeek && hoursPerWeek > 0 ? hoursPerWeek : null;
  const at = (level: number) => {
    const points = pointsBetween(from, level);
    const hours = points / pointsPerHour;
    return { points, hours, days: perWeek ? (hours / perWeek) * 7 : null };
  };

  const stops: Stop[] = [];
  RANKS.forEach((rank, tier) => {
    const [first] = rankLevels(tier);
    if (first > from && first < to) stops.push({ level: first, rank, label: rank, ...at(first) });
  });
  const goalRank = RANKS[RANKS.findLastIndex((_, tier) => rankLevels(tier)[0] <= to)];
  const startsRank = RANKS.some((_, tier) => rankLevels(tier)[0] === to);
  stops.push({ level: to, rank: goalRank, label: startsRank ? goalRank : `Level ${to}`, ...at(to) });

  return {
    from,
    to,
    ...at(to),
    stops,
    rewards: REWARDS.filter((r) => r.level > from && r.level <= to),
  };
}

/** "about 19 hours", "about 40 minutes", "about 1 hour". */
export function hoursText(h: number): string {
  if (h <= 0) return "0 hours";
  if (h < 1) {
    const m = Math.max(5, Math.round((h * 60) / 5) * 5);
    return m >= 60 ? "about 1 hour" : `about ${m} minutes`;
  }
  const n = h < 10 ? Math.round(h * 2) / 2 : Math.round(h);
  return `about ${n} ${n === 1 ? "hour" : "hours"}`;
}

/** The finish date for a number of days from `now`, like "Nov 2". Adds the year when it is not this year. */
export function finishDate(days: number, now: Date = new Date()): string {
  // Calendar days, so a daylight saving change cannot land it on the day before.
  const d = new Date(now);
  d.setDate(d.getDate() + Math.ceil(days));
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** "3 days", "2 weeks", "5 months", "about 2 years". */
export function daysText(days: number): string {
  const d = Math.max(1, Math.ceil(days));
  if (d < 14) return `${d} ${d === 1 ? "day" : "days"}`;
  if (d < 70) return `${Math.round(d / 7)} weeks`;
  if (d < 548) return `${Math.round(d / 30.4)} months`;
  const y = Math.round((d / 365.25) * 2) / 2;
  return `about ${y} years`;
}
