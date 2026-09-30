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
