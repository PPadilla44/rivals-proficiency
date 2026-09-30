/** Helpers shared by feature flags and admin-only pages. */

/** Accounts listed in ADMIN_EMAILS (comma separated), by sign-in email. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export type Viewer = { id?: string | null; email?: string | null } | null | undefined;

/**
 * Whether playtime sync is on for this viewer. Sync needs the stats API key
 * and an account, so the flag is only checked (and only counts toward the
 * Vercel Flags quota) for signed-in users once the key is set. `evaluate`
 * reads the Vercel flag; if that fails, admins keep access and everyone else
 * stays off.
 */
export async function playtimeSyncEnabled(viewer: Viewer, evaluate: () => Promise<boolean>): Promise<boolean> {
  if (!process.env.MARVEL_RIVALS_API_KEY || !viewer?.id) return false;
  try {
    return await evaluate();
  } catch (e) {
    console.error("playtime-sync flag failed", e);
    return isAdminEmail(viewer.email);
  }
}
