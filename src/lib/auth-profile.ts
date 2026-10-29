/**
 * Which email a sign-in provider will vouch for.
 *
 * Auth.js links a new sign-in to an existing board only when the emails match, and it
 * refuses (OAuthAccountNotLinked) unless the provider is marked safe for that. Linking is
 * safe only when the provider has verified the address. Discord lets people keep an
 * unverified email, so we hand Auth.js the email only when the provider says it is verified.
 * Without an email an unverified sign-in can neither join nor take over someone else's board:
 * it gets a board of its own.
 */
export function verifiedEmail(email: string | null | undefined, verified: unknown): string | null {
  const ok = verified === true || verified === "true";
  return ok && email ? email : null;
}

type DiscordLike = { email?: string | null; verified?: unknown };
type GoogleLike = { sub: string; name?: string; nickname?: string; preferred_username?: string; email?: string; email_verified?: unknown; picture?: string };

/** Discord's default user fields, with the email kept only when Discord has verified it. */
export function discordUser<T extends { email?: string | null }>(base: T, raw: DiscordLike): T {
  return { ...base, email: verifiedEmail(raw.email, raw.verified) };
}

/** Google's user fields (Auth.js's default for an OIDC provider), with the same email rule. */
export function googleUser(raw: GoogleLike) {
  return {
    id: raw.sub,
    name: raw.name ?? raw.nickname ?? raw.preferred_username,
    email: verifiedEmail(raw.email, raw.email_verified),
    image: raw.picture,
  };
}
