/** Rules for the optional name shown on a public board link. Shared by the server and the settings form. */

export const BOARD_NAME_MAX = 30;

export type NameResult = { ok: true; name: string | null } | { ok: false; error: string };

// Anything that looks like a link, a handle or an address: the page is public, so it must not carry ads or contact details.
const LOOKS_LIKE_LINK = /(https?:|www\.|\/\/|@|\b[a-z0-9-]+\.(com|net|org|gg|tv|io|me|co|ly|app|xyz)\b)/i;

/** Trim, collapse spaces and drop control characters. An empty name means "no name". */
export function cleanBoardName(input: unknown): NameResult {
  if (input == null) return { ok: true, name: null };
  if (typeof input !== "string") return { ok: false, error: "That name is not valid." };
  const name = input
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { ok: true, name: null };
  if ([...name].length > BOARD_NAME_MAX) return { ok: false, error: `Keep it to ${BOARD_NAME_MAX} characters or fewer.` };
  if (LOOKS_LIKE_LINK.test(name)) return { ok: false, error: "Leave out links and handles. A plain name is enough." };
  return { ok: true, name };
}

/** What the page shows when the player left the name empty. */
export const DEFAULT_BOARD_NAME = "A player";
