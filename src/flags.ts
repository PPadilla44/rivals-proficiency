import { dedupe, flag } from "flags/next";
import { vercelAdapter } from "@flags-sdk/vercel";
import { auth, authConfigured } from "@/auth";
import { isAdminEmail } from "@/lib/flags";

/**
 * Feature flags managed in the Vercel dashboard (project → Flags). Targeting
 * rules can use the user entity below; `admin` is true for ADMIN_EMAILS.
 */
type Entities = { user?: { id: string; email: string; admin: boolean } };

const identify = dedupe(async (): Promise<Entities> => {
  const session = authConfigured ? await auth() : null;
  const u = session?.user;
  if (!u?.id) return {};
  return { user: { id: u.id, email: u.email ?? "", admin: isAdminEmail(u.email) } };
});

/** Playtime sync through MarvelRivalsAPI.com: account linking, sync and estimates. */
export const playtimeSyncFlag = flag<boolean, Entities>({
  key: "playtime-sync",
  adapter: vercelAdapter(),
  identify,
  defaultValue: false,
  description: "Playtime sync through MarvelRivalsAPI.com",
  options: [
    { value: false, label: "Off" },
    { value: true, label: "On" },
  ],
});

/**
 * Most screenshot reads the whole site may make in 24 hours, so a traffic
 * spike can't run through the Anthropic budget. Raise or lower it in the
 * dashboard; only read when someone imports.
 */
export const screenshotDailyCapFlag = flag<number>({
  key: "screenshot-daily-cap",
  adapter: vercelAdapter(),
  defaultValue: 100,
  description: "Site-wide screenshot reads per 24 hours",
  options: [
    { value: 50, label: "50 (about $3 a day)" },
    { value: 100, label: "100 (about $6 a day)" },
    { value: 200, label: "200 (about $12 a day)" },
    { value: 400, label: "400 (about $24 a day)" },
  ],
});

/** The cap, falling back to 100 if the flag service can't be reached. */
export async function screenshotDailyCap(): Promise<number> {
  try {
    const v = await screenshotDailyCapFlag();
    return Number.isFinite(v) && v > 0 ? v : 100;
  } catch (e) {
    console.error("screenshot-daily-cap flag failed", e);
    return 100;
  }
}
