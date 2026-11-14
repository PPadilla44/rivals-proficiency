import type { HeroRow } from "./board-model";
import { CHAMPION, LORD, RANKS, tierOf } from "./proficiency";
import { DATA_SEASON } from "./site";

/**
 * The "Share my board" picture: which boards get it, which heroes go on it, and where
 * everything sits on the 1080x1080 card. Plain logic, so it can be tested without a browser;
 * share-draw.ts turns it into pixels.
 */

/** The button shows once the board has this many heroes at Lord or higher: a card worth posting. */
export const SHARE_MIN_LORD = 3;
/** Players pick 3 to 5 heroes for the card. */
export const PICK_MIN = 3;
export const PICK_MAX = 5;
export const CARD_SIZE = 1080;

export function lordCount(rows: HeroRow[]): number {
  return rows.filter((r) => r.effective >= LORD).length;
}

export function shareEligible(rows: HeroRow[]): boolean {
  return lordCount(rows) >= SHARE_MIN_LORD;
}

/** Heroes that can go on the card (any with a level set above 1), highest first. */
export function shareCandidates(rows: HeroRow[]): HeroRow[] {
  return rows
    .filter((r) => r.touched && r.effective > 1)
    .sort((a, b) => b.effective - a.effective || a.name.localeCompare(b.name));
}

/** The top five, ticked when the sheet opens. */
export function defaultPicks(rows: HeroRow[]): string[] {
  return shareCandidates(rows)
    .slice(0, PICK_MAX)
    .map((r) => r.id);
}

/** Tick or untick a hero, keeping between PICK_MIN and PICK_MAX picked. Returns the same list if not allowed. */
export function togglePick(picks: string[], id: string): string[] {
  if (picks.includes(id)) return picks.length > PICK_MIN ? picks.filter((p) => p !== id) : picks;
  return picks.length < PICK_MAX ? [...picks, id] : picks;
}

/** Can this hero's box be changed right now? (Full at five, or down to three.) */
export function pickLocked(picks: string[], id: string): boolean {
  return picks.includes(id) ? picks.length <= PICK_MIN : picks.length >= PICK_MAX;
}

export type CardHero = {
  id: string;
  name: string;
  level: number;
  /** Only the rank is known (from a screenshot), so the level is the rank's first: shown as "20+". */
  approx: boolean;
  tier: number;
  rank: string;
};

export type CardData = {
  heroes: CardHero[];
  lordPlus: number;
  champions: number;
  tracked: number;
  /** "Season 10.5 · Nov 2026" */
  stamp: string;
};

/** Everything the card shows. Counts describe the whole board, not just the picked heroes. */
export function cardData(rows: HeroRow[], picks: string[], now = new Date()): CardData {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const heroes = picks
    .map((id) => byId.get(id))
    .filter((r): r is HeroRow => !!r)
    .sort((a, b) => b.effective - a.effective || a.name.localeCompare(b.name))
    .map((r) => {
      const tier = tierOf(r.effective);
      return { id: r.id, name: r.name, level: r.effective, approx: r.approx && !r.estimate, tier, rank: RANKS[tier] };
    });
  return {
    heroes,
    lordPlus: lordCount(rows),
    champions: rows.filter((r) => r.effective >= CHAMPION).length,
    tracked: rows.filter((r) => r.touched && r.effective > 1).length,
    stamp: `${DATA_SEASON} · ${now.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
  };
}

export function levelText(h: CardHero): string {
  return h.approx ? `${h.level}+` : String(h.level);
}

/** Lord to Guardian are gold, Champion purple, below Lord grey (the site's own rule). */
export function tierStyle(tier: number): "base" | "lord" | "champ" {
  return tier >= 10 ? "champ" : tier >= 4 ? "lord" : "base";
}

export type RowBox = { y: number; h: number; portrait: number; name: number; level: number; badge: number };

/**
 * Where each hero row goes. The rows share the space between the header and the footer;
 * with fewer heroes they grow, up to a limit, and the group is centred in that space.
 */
export function rowBoxes(n: number): RowBox[] {
  const top = 288;
  const bottom = 950;
  const gap = 12;
  const count = Math.max(1, Math.min(PICK_MAX, n));
  const h = Math.min(190, Math.floor((bottom - top - gap * (count - 1)) / count));
  const used = h * count + gap * (count - 1);
  const start = top + Math.floor((bottom - top - used) / 2);
  const grow = (h - 120) / 70; // 0 at five rows, 1 at the tallest
  const portrait = Math.round(h - 28);
  return Array.from({ length: count }, (_, i) => ({
    y: start + i * (h + gap),
    h,
    portrait,
    name: Math.round(40 + 12 * grow),
    level: Math.round(56 + 16 * grow),
    badge: Math.round(52 + 12 * grow),
  }));
}

export const SHARE_FILE_NAME = "proficiency-board.png";
