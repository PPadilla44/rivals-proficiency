export type WhatsNewEntry = {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: string;
  text: string;
};

/**
 * Changes players can see, newest first. Add an entry to any change that shows up on the
 * site. Leave out behind-the-scenes work (tracking, digests, search titles).
 */
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    date: "2026-11-16",
    title: "A calmer home page",
    text: "One card at the top tells you which hero is closest to Lord. There is one gold button per screen, and the search, Filter and Sort sit in a single bar.",
  },
  {
    date: "2026-11-16",
    title: "Sign in from the top bar",
    text: "Sign in and your account menu are in the top bar on every page, with the Discord and Google logos on the buttons. Feedback is a plain link there too.",
  },
  {
    date: "2026-11-16",
    title: "Windows that behave",
    text: "Sign in, import, Share and Feedback open as sheets you can close with the X, Escape or a tap outside. If you have typed something, it asks before throwing it away.",
  },
  {
    date: "2026-11-16",
    title: "Your first tap counts",
    text: "Tapping a level on the sample board now sets that level on your own board instead of starting over.",
  },
  {
    date: "2026-11-16",
    title: "Easier to add the levels from this browser",
    text: "If you saved levels as a guest and then sign in, a clear card offers to add them to your account.",
  },
  {
    date: "2026-11-14",
    title: "Clearer sample board on phones",
    text: "First-time visitors on a phone now see a plain note that the sample board isn't theirs, and a pointer to the screenshot import.",
  },
  {
    date: "2026-11-14",
    title: "A bigger, clearer screenshot import",
    text: "The import opens in its own window with numbered steps, a larger picture of the right screen, and a drop box you can click or tap.",
  },
  {
    date: "2026-11-14",
    title: "The home page stops jumping while it loads",
    text: "The board no longer shifts around in the first moment, especially if you have saved levels.",
  },
  {
    date: "2026-11-13",
    title: "Nightcrawler and Season 11",
    text: "Nightcrawler (Strategist) is on the board with his official portrait, and the ranks and rewards were checked against the Season 11 patch.",
  },
  {
    date: "2026-11-12",
    title: "Feedback button, and a check after importing",
    text: "There is a Feedback button in the top bar on every page. After you save an import, you can tell me if it read your heroes right.",
  },
  {
    date: "2026-10-29",
    title: "Discord and Google sign-ins join up",
    text: "Signing in with Discord and then Google (or the other way round) with the same verified email now lands on the same board instead of an error.",
  },
];

/** The newest entry's date, for the sitemap. */
export const WHATS_NEW_UPDATED = WHATS_NEW[0].date;

export function formatWhatsNewDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
