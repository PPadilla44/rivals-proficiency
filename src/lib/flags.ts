/**
 * Feature flags, read from environment variables so they change with a
 * Vercel env edit and a redeploy, no code change.
 */

/** Who sees a flagged feature. */
export type FlagMode = "off" | "admin" | "on";

export function parseFlagMode(value: string | undefined, fallback: FlagMode): FlagMode {
  const v = value?.trim().toLowerCase();
  if (v === "off" || v === "false" || v === "0") return "off";
  if (v === "on" || v === "true" || v === "1" || v === "everyone") return "on";
  if (v === "admin" || v === "admins") return "admin";
  return fallback;
}

/** Accounts listed in ADMIN_EMAILS (comma separated), by sign-in email. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/**
 * Playtime sync through MarvelRivalsAPI.com. FEATURE_PLAYTIME_SYNC is
 * off, admin (only ADMIN_EMAILS accounts) or on (everyone); it defaults to
 * admin so a newly added API key can be tried on your own account first.
 * Without MARVEL_RIVALS_API_KEY it is off whatever the flag says.
 */
export function playtimeSyncMode(): FlagMode {
  if (!process.env.MARVEL_RIVALS_API_KEY) return "off";
  return parseFlagMode(process.env.FEATURE_PLAYTIME_SYNC, "admin");
}

export function playtimeSyncEnabledFor(email: string | null | undefined): boolean {
  const mode = playtimeSyncMode();
  return mode === "on" || (mode === "admin" && isAdminEmail(email));
}
