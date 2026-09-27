export type Role = "V" | "D" | "S" | "M";

export type Hero = {
  id: string;
  name: string;
  role: Role;
  /** Release order, 0 = first launch hero listed. */
  order: number;
  /** Alternate names the stats API or players may use. */
  aliases?: string[];
};

export const ROLE_LABEL: Record<Role, string> = {
  V: "Vanguard",
  D: "Duelist",
  S: "Strategist",
  M: "Multi-role",
};

export const ROLE_SORT: Record<Role, number> = { V: 0, D: 1, S: 2, M: 3 };

type Row = [name: string, role: Role, aliases?: string[]];

// Launch roster (6 Dec 2024), then every post-launch hero in unlock order.
// 54 heroes as of Season 10 (11 Sep 2026).
const ROSTER: Row[] = [
  ["Captain America", "V"],
  ["Doctor Strange", "V"],
  ["Groot", "V"],
  ["Hulk", "V", ["Bruce Banner"]],
  ["Magneto", "V"],
  ["Peni Parker", "V"],
  ["Thor", "V"],
  ["Venom", "V"],
  ["Black Panther", "D"],
  ["Black Widow", "D"],
  ["Hawkeye", "D"],
  ["Hela", "D"],
  ["Iron Fist", "D"],
  ["Iron Man", "D"],
  ["Magik", "D"],
  ["Moon Knight", "D"],
  ["Namor", "D"],
  ["Psylocke", "D"],
  ["The Punisher", "D", ["Punisher"]],
  ["Scarlet Witch", "D"],
  ["Spider-Man", "D", ["Spider Man", "Spiderman"]],
  ["Squirrel Girl", "D"],
  ["Star-Lord", "D", ["Star Lord", "Starlord"]],
  ["Storm", "D"],
  ["Winter Soldier", "D"],
  ["Wolverine", "D"],
  ["Adam Warlock", "S"],
  ["Cloak & Dagger", "S", ["Cloak and Dagger"]],
  ["Jeff the Land Shark", "S", ["Jeff"]],
  ["Loki", "S"],
  ["Luna Snow", "S"],
  ["Mantis", "S"],
  ["Rocket Raccoon", "S", ["Rocket"]],
  ["Mister Fantastic", "D", ["Mr. Fantastic", "Mr Fantastic"]],
  ["Invisible Woman", "S"],
  ["Human Torch", "D"],
  ["The Thing", "V", ["Thing"]],
  ["Emma Frost", "V"],
  ["Ultron", "S"],
  ["Phoenix", "D"],
  ["Blade", "D"],
  ["Angela", "V"],
  ["Daredevil", "D"],
  ["Gambit", "S"],
  ["Rogue", "V"],
  ["Deadpool", "M"],
  ["Elsa Bloodstone", "D"],
  ["White Fox", "S"],
  ["Black Cat", "D"],
  ["Devil Dinosaur", "V"],
  ["Cyclops", "D"],
  ["Jubilee", "S", ["Jubilation Lee"]],
  ["The Hood", "V", ["Hood"]],
  ["Gorr the God Butcher", "D", ["Gorr"]],
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const HEROES: Hero[] = ROSTER.map(([name, role, aliases], order) => ({
  id: slugify(name),
  name,
  role,
  order,
  aliases,
}));

export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));

export function isHeroId(id: string): boolean {
  return HERO_BY_ID.has(id);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const NAME_INDEX = new Map<string, string>();
for (const h of HEROES) {
  NAME_INDEX.set(normalize(h.name), h.id);
  for (const a of h.aliases ?? []) NAME_INDEX.set(normalize(a), h.id);
}

/** Map a hero name as the stats API spells it to our hero id. */
export function heroIdFromName(name: string): string | undefined {
  const n = normalize(name);
  return NAME_INDEX.get(n) ?? NAME_INDEX.get(n.replace(/^the /, ""));
}
