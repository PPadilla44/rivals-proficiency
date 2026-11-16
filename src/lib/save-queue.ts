/** Shown when the browser could not reach the server at all (offline, dropped connection). */
export const OFFLINE_SAVE_MESSAGE = "You're offline, so your levels are not saved yet.";

/**
 * Put levels whose save failed back in the queue so they are tried again. A hero the player changed
 * again while the save was running keeps its newer level.
 */
export function requeueFailed(pending: Map<string, number>, failed: ReadonlyArray<{ heroId: string; level: number }>): void {
  for (const u of failed) if (!pending.has(u.heroId)) pending.set(u.heroId, u.level);
}
