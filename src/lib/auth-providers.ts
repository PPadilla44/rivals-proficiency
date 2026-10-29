import type { NextAuthConfig } from "next-auth";
import Discord, { type DiscordProfile } from "next-auth/providers/discord";
import Google, { type GoogleProfile } from "next-auth/providers/google";
import { discordUser, googleUser } from "@/lib/auth-profile";

// Discord started sending an "iss" value on its sign-in callback (Oct 2026).
// Auth.js checks it against the provider's issuer, and its built-in Discord
// provider has none, so every Discord sign-in failed. "https://discord.com"
// is the issuer Discord publishes. The endpoints are all set explicitly, so
// this adds no extra request.
export const DISCORD_ISSUER = "https://discord.com";

/**
 * The sign-in providers to offer: only those with credentials set, so one is enough to run.
 *
 * Signing in with the other provider on the same email used to fail (OAuthAccountNotLinked).
 * Both providers now link to the existing board, but only when the provider has verified the
 * email (see src/lib/auth-profile.ts); an unverified email is dropped and gets a board of its own.
 */
export function buildProviders(has: { discord: boolean; google: boolean }): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];
  if (has.discord) {
    const defaults = Discord({});
    providers.push(
      Discord({
        issuer: DISCORD_ISSUER,
        allowDangerousEmailAccountLinking: true,
        profile: (raw: DiscordProfile) => discordUser(defaults.profile!(raw, {}) as { email?: string | null }, raw),
      }),
    );
  }
  if (has.google) {
    providers.push(Google({ allowDangerousEmailAccountLinking: true, profile: (raw: GoogleProfile) => googleUser(raw) }));
  }
  return providers;
}
