export const KOFI_URL = "https://ko-fi.com/pablopadilla";
export const FEEDBACK_URL = "https://github.com/PPadilla44/rivals-proficiency/issues/new/choose";

/**
 * When the game data on the site (ranks, points, rewards, roster) was last
 * checked against the game. Bump both when you re-check after a patch: the
 * date shows on the guides, in structured data and in the sitemap.
 */
export const DATA_CHECKED = "2026-10-09";
export const DATA_SEASON = "Season 10.5";

/** "Oct 9, 2026" */
export const DATA_CHECKED_TEXT = new Date(`${DATA_CHECKED}T12:00:00Z`).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * IndexNow key (Bing, Yandex, Seznam, Naver). Public by design: search engines
 * fetch /<key>.txt to confirm the site owns it. Not a secret.
 */
export const INDEXNOW_KEY = "48d6ec118c8a0b43cf6a2b9a508b2145";
