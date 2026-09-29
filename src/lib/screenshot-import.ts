import { HEROES, HERO_BY_ID, heroIdFromName } from "./heroes";
import { MAX_LEVEL, RANKS, clampLevel, tierOf } from "./proficiency";

/** One hero as read off a screenshot. Either a level, a rank, or both. */
export type Detection = { name: string; level: number | null; rank: string | null; badge?: string };

export type ProposalStatus = "raise" | "same" | "lower" | "new";

export type Proposal = {
  heroId: string;
  name: string;
  /** Level the screenshot showed, if it showed a number. */
  detectedLevel: number | null;
  /** Rank name the screenshot showed, if it only showed a badge. */
  detectedRank: string | null;
  current: number | null;
  proposed: number;
  status: ProposalStatus;
  /** Pre-checked in the review list. Lowering a level is never pre-checked. */
  selected: boolean;
};

const RANK_INDEX = new Map(RANKS.map((r, i) => [r.toLowerCase(), i]));

/** Levels a rank covers: Agent 1 to 4, Knight 5 to 9, ... Champion 50 to 70. */
export function rankRange(rank: string): [number, number] | null {
  const tier = RANK_INDEX.get(rank.trim().toLowerCase());
  if (tier === undefined) return null;
  const min = Math.max(1, tier * 5);
  const max = tier === RANKS.length - 1 ? MAX_LEVEL : tier * 5 + 4;
  return [min, max];
}

/** Levels read from one screenshot may be merged with others; keep the highest per hero. */
export function mergeDetections(lists: Detection[][]): { byHero: Map<string, Detection>; unmatched: string[] } {
  const byHero = new Map<string, Detection>();
  const unmatched = new Set<string>();
  for (const d of lists.flat()) {
    const id = heroIdFromName(d.name);
    if (!id) {
      if (d.name.trim()) unmatched.add(d.name.trim());
      continue;
    }
    const level = d.level != null && Number.isFinite(d.level) ? clampLevel(d.level) : null;
    const rank = d.rank && rankRange(d.rank) ? d.rank : null;
    if (level == null && rank == null) continue;
    const prev = byHero.get(id);
    if (!prev || score({ level, rank }) > score(prev)) byHero.set(id, { name: HERO_BY_ID.get(id)!.name, level, rank, badge: d.badge });
  }
  return { byHero, unmatched: [...unmatched] };
}

function score(d: { level: number | null; rank: string | null }): number {
  if (d.level != null) return d.level + 0.5; // an exact level beats a rank floor
  return d.rank ? rankRange(d.rank)![0] : 0;
}

/**
 * Turn detections into proposed changes against the player's current levels.
 * An exact level is taken as is. A rank badge alone keeps the current level
 * when it already falls inside that rank, and otherwise moves to the rank's
 * first level.
 */
export function buildProposals(byHero: Map<string, Detection>, current: Record<string, number | undefined>): Proposal[] {
  const out: Proposal[] = [];
  for (const hero of HEROES) {
    const d = byHero.get(hero.id);
    if (!d) continue;
    const cur = current[hero.id] ?? null;
    let proposed: number;
    if (d.level != null) {
      proposed = d.level;
    } else {
      const [min, max] = rankRange(d.rank!)!;
      proposed = cur != null && cur >= min && cur <= max ? cur : min;
    }
    const status: ProposalStatus = cur == null ? "new" : proposed > cur ? "raise" : proposed < cur ? "lower" : "same";
    out.push({
      heroId: hero.id,
      name: hero.name,
      detectedLevel: d.level,
      detectedRank: d.level != null ? null : d.rank,
      current: cur,
      proposed,
      status,
      selected: status === "raise" || status === "new",
    });
  }
  // Changes to save first, then ones to double check, then unchanged.
  const order: Record<ProposalStatus, number> = { raise: 0, new: 0, lower: 1, same: 2 };
  return out.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
}

export function describeDetection(p: Pick<Proposal, "detectedLevel" | "detectedRank">): string {
  if (p.detectedLevel != null) return `Lv ${p.detectedLevel} (${RANKS[tierOf(p.detectedLevel)]})`;
  const r = rankRange(p.detectedRank ?? "");
  return r ? `${p.detectedRank} (Lv ${r[0]} to ${r[1]})` : "Unreadable";
}

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Split a screenshot into overlapping tiles so small rank badges keep their
 * full resolution. Wide screenshots get 2x2 tiles; small ones stay whole.
 * Each tile overlaps its neighbour so a card cut by one edge is whole in the
 * other tile.
 */
export function tileRects(width: number, height: number, maxEdge = 1568): Rect[] {
  if (Math.max(width, height) <= maxEdge * 1.15) return [{ x: 0, y: 0, w: width, h: height }];
  const cols = width >= height ? 2 : 1;
  const rows = width >= height ? 2 : 3;
  const tw = cols === 1 ? width : Math.round(width * 0.54);
  const th = Math.round(height * (rows === 2 ? 0.54 : 0.38));
  const rects: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? 0 : Math.round(((width - tw) * c) / (cols - 1));
      const y = Math.round(((height - th) * r) / (rows - 1));
      rects.push({ x, y, w: tw, h: th });
    }
  }
  return rects;
}
