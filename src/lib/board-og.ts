import { buildRows } from "./board-model";
import { DEFAULT_BOARD_NAME } from "./board-name";
import { CHAMPION, LORD, RANKS, tierOf } from "./proficiency";

/** What the preview picture of a public board shows. Built from the same data as the page, nothing more. */
export type BoardOg = {
  /** "Pablo's board" or "A player's board" */
  title: string;
  /** "12 heroes set · 5 at Lord or higher" */
  summary: string;
  heroes: { id: string; name: string; level: number; tier: number; rank: string }[];
};

export const OG_HEROES = 4;

export function boardOg(boardName: string | null, levels: Record<string, number>): BoardOg {
  const rows = buildRows(
    Object.fromEntries(Object.entries(levels).map(([id, level]) => [id, { level, baselinePlaytimeSec: null }])),
    {},
    { linked: false, pointsPerHour: null },
  );
  const started = rows.filter((r) => r.level > 1).sort((a, b) => b.level - a.level || a.order - b.order);
  const lord = rows.filter((r) => r.effective >= LORD).length;
  const champs = rows.filter((r) => r.effective >= CHAMPION).length;
  const summary =
    started.length === 0
      ? "No heroes set yet"
      : `${started.length} ${started.length === 1 ? "hero" : "heroes"} set · ${lord} at Lord or higher${champs ? ` · ${champs} at Champion` : ""}`;
  return {
    title: `${boardName ?? DEFAULT_BOARD_NAME}'s board`,
    summary,
    heroes: started.slice(0, OG_HEROES).map((r) => {
      const tier = tierOf(r.effective);
      return { id: r.id, name: r.name, level: r.effective, tier, rank: RANKS[tier] };
    }),
  };
}
