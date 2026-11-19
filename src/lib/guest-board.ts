import { HEROES } from "./heroes";
import { MAX_LEVEL } from "./proficiency";

/** Where a guest's levels live in this browser. Board.tsx and the calculator both use this one key. */
export const GUEST_LEVELS_KEY = "proficiency-board-v1";
/** Set by the calculator just before it opens the board, so the board can say what happened. */
export const CALC_NOTICE_KEY = "pb-calc-landed";
/** A notice older than this is stale (a tab left open, a back button) and is ignored. */
export const CALC_NOTICE_MAX_AGE_MS = 2 * 60_000;

export type AddResult = "added" | "exists" | "bad";

export type AddOutcome = {
  result: AddResult;
  /** The text to store when a hero was added, else null: nothing is written. */
  next: string | null;
  /** The level already stored for the hero, when result is "exists". */
  existing?: number;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A level the calculator may carry over: a known hero and a whole level above 1 (level 1 is nothing to save). */
export function validAdd(heroId: unknown, level: unknown): boolean {
  return (
    typeof heroId === "string" &&
    HEROES.some((h) => h.id === heroId) &&
    typeof level === "number" &&
    Number.isInteger(level) &&
    level >= 2 &&
    level <= MAX_LEVEL
  );
}

/**
 * Adds one hero to a guest's saved levels without touching anything else. `raw` is exactly what is in storage now.
 * Never overwrites: a hero that is already there stays as it is. Never writes over data it does not understand:
 * anything except a plain object of plain numbers is reported as "bad" and left alone.
 */
export function addHeroIfMissing(raw: string | null, heroId: string, level: number): AddOutcome {
  if (!validAdd(heroId, level)) return { result: "bad", next: null };
  let levels: Record<string, unknown> = {};
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { result: "bad", next: null };
    }
    if (!isPlainObject(parsed) || !isPlainObject(parsed.levels)) return { result: "bad", next: null };
    levels = parsed.levels;
    if (!Object.values(levels).every((v) => typeof v === "number" && Number.isFinite(v))) return { result: "bad", next: null };
  }
  if (Object.prototype.hasOwnProperty.call(levels, heroId)) return { result: "exists", next: null, existing: levels[heroId] as number };
  return { result: "added", next: JSON.stringify({ levels: { ...levels, [heroId]: level } }) };
}

export type CalcNotice = {
  /** Which button was pressed: add the hero, or just open the board. */
  via: "add" | "open";
  hero?: string;
  level?: number;
  result?: AddResult | "failed";
  existing?: number;
  at: number;
};

/** Reads the calculator's note to the board. Returns null for anything missing, malformed or stale. */
export function parseCalcNotice(raw: string | null, now: number): CalcNotice | null {
  if (!raw) return null;
  try {
    const n = JSON.parse(raw) as Partial<CalcNotice>;
    if (!isPlainObject(n)) return null;
    if (n.via !== "add" && n.via !== "open") return null;
    if (typeof n.at !== "number" || now - n.at < 0 || now - n.at > CALC_NOTICE_MAX_AGE_MS) return null;
    if (n.via === "open") return { via: "open", at: n.at };
    if (!validAdd(n.hero, n.level)) return null;
    const result = n.result === "added" || n.result === "exists" || n.result === "bad" || n.result === "failed" ? n.result : undefined;
    if (!result) return null;
    const existing = typeof n.existing === "number" && Number.isFinite(n.existing) ? n.existing : undefined;
    return { via: "add", hero: n.hero, level: n.level, result, existing, at: n.at };
  } catch {
    return null;
  }
}
