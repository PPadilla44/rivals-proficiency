import NextAuth, { type NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { SERVER_VISITOR, recordEvent } from "@/server/events";

// Only offer providers that are configured, so one is enough to run.
const providers: NextAuthConfig["providers"] = [];
if (process.env.AUTH_DISCORD_ID) providers.push(Discord);
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);

export const providerList = providers.map((p) => {
  const id = typeof p === "function" ? p().id : p.id;
  return { id, name: id === "discord" ? "Discord" : "Google" };
});

/**
 * Accounts need a database, a secret and at least one provider. Until all
 * three are set, the site runs in guest mode instead of erroring.
 */
export const authConfigured = Boolean(process.env.DATABASE_URL && process.env.AUTH_SECRET && providers.length);

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "database" },
  // Show sign-in problems on the board instead of the bare Auth.js page.
  pages: { error: "/" },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user.id) return;
      try {
        await recordEvent(getDb(), {
          name: "sign_in",
          visitorId: SERVER_VISITOR,
          userId: user.id,
          props: { new_user: Boolean(isNewUser), provider: account?.provider ?? null },
        });
      } catch (e) {
        console.error("sign-in event failed", e);
      }
    },
  },
  trustHost: true,
}));

export async function requireUserId(): Promise<string> {
  if (!authConfigured) throw new Error("Sign in is not available on this server yet.");
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Sign in to save your board.");
  return id;
}
