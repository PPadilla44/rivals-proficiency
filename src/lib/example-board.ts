import type { BoardData } from "@/server/board";
import { heroIdFromName } from "./heroes";

/**
 * A believable roster shown to first-time visitors so they can see what a
 * filled-in board does before entering anything. It is never saved.
 */
const EXAMPLE: [name: string, level: number][] = [
  ["Hela", 50],
  ["Luna Snow", 47],
  ["Doctor Strange", 41],
  ["Invisible Woman", 33],
  ["Cloak & Dagger", 28],
  ["Moon Knight", 24],
  ["Magneto", 21],
  ["The Punisher", 19],
  ["Namor", 18],
  ["Rocket Raccoon", 16],
  ["Star-Lord", 14],
  ["Loki", 12],
  ["Mantis", 11],
  ["Thor", 9],
  ["Storm", 7],
  ["Scarlet Witch", 6],
  ["Hulk", 5],
  ["Psylocke", 4],
  ["Groot", 3],
  ["Iron Man", 2],
];

export const EXAMPLE_LEVELS: Record<string, number> = Object.fromEntries(
  EXAMPLE.flatMap(([name, level]) => {
    const id = heroIdFromName(name);
    return id ? [[id, level]] : [];
  }),
);

export const EXAMPLE_BOARD: BoardData = {
  levels: Object.fromEntries(Object.entries(EXAMPLE_LEVELS).map(([id, level]) => [id, { level, baselinePlaytimeSec: null }])),
  playtime: {},
  link: null,
};
