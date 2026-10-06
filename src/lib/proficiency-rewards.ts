/**
 * What each proficiency level unlocks. Read from the in-game reward track
 * (Adam Warlock, Season 10, October 2026). Every hero has the same track with
 * its own art; titles end with the hero's name.
 */
export type RewardKind = "avatar" | "nameplate" | "spray" | "title" | "ko" | "medal" | "frame" | "currency";

export type Reward = { level: number; kind: RewardKind; what: string };

export const REWARD_KIND_LABEL: Record<RewardKind, string> = {
  avatar: "Avatar",
  nameplate: "Nameplate",
  spray: "Spray",
  title: "Title",
  ko: "KO prompt",
  medal: "Avatar medal",
  frame: "Avatar frame",
  currency: "Currency",
};

export const REWARDS: Reward[] = [
  { level: 1, kind: "ko", what: "Default KO prompt and hero avatar" },
  { level: 3, kind: "nameplate", what: "Hero nameplate" },
  { level: 5, kind: "spray", what: "Hero spray" },
  { level: 8, kind: "title", what: "Title: Fantastic (hero name)" },
  { level: 10, kind: "ko", what: "Purple KO prompt" },
  { level: 13, kind: "currency", what: "100 Unstable Molecules" },
  { level: 15, kind: "ko", what: "Gold KO prompt" },
  { level: 18, kind: "currency", what: "100 Units" },
  { level: 20, kind: "avatar", what: "Lord avatar" },
  { level: 22, kind: "currency", what: "100 Unstable Molecules" },
  { level: 24, kind: "nameplate", what: "Pink nameplate" },
  { level: 25, kind: "medal", what: "Avatar medal" },
  { level: 27, kind: "currency", what: "100 Units" },
  { level: 29, kind: "title", what: "Title: Uncanny (hero name)" },
  { level: 30, kind: "frame", what: "Purple avatar frame" },
  { level: 32, kind: "currency", what: "100 Unstable Molecules" },
  { level: 34, kind: "nameplate", what: "Gold nameplate" },
  { level: 35, kind: "medal", what: "Purple avatar medal" },
  { level: 37, kind: "currency", what: "100 Units" },
  { level: 39, kind: "title", what: "Title: Amazing (hero name)" },
  { level: 40, kind: "frame", what: "Gold avatar frame" },
  { level: 42, kind: "currency", what: "100 Unstable Molecules" },
  { level: 44, kind: "currency", what: "100 Units" },
  { level: 45, kind: "medal", what: "Pink avatar medal" },
  { level: 47, kind: "currency", what: "100 Unstable Molecules" },
  { level: 49, kind: "currency", what: "100 Units" },
  { level: 50, kind: "avatar", what: "Animated Lord avatar" },
  { level: 55, kind: "medal", what: "Red avatar medal" },
  { level: 60, kind: "title", what: "Title: Immortal (hero name)" },
  { level: 65, kind: "nameplate", what: "Animated nameplate" },
  { level: 70, kind: "title", what: "Title: Legendary (hero name)" },
];
