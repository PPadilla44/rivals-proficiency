/** Buttons announce themselves on the window; one host in the layout opens the Board link dialog. */
export const BOARD_LINK_OPEN_EVENT = "pb:board-link";

export type BoardLinkSource = "menu" | "share";

/** The address a public board lives at. Pass the site origin, with or without a trailing slash. */
export function boardLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/b/${token}`;
}

/** Open the Board link dialog from any button. */
export function openBoardLink(from: BoardLinkSource): void {
  try {
    window.dispatchEvent(new CustomEvent(BOARD_LINK_OPEN_EVENT, { detail: { from } }));
  } catch {}
}
