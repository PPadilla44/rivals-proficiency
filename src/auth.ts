import NextAuth, { type NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

// Only offer providers that are configured, so one is enough to run.
const providers: NextAuthConfig["providers"] = [];
if (process.env.AUTH_DISCORD_ID) providers.push(Discord);
if (process.env.AUTH_GOOGLE_ID) providers.push(Google);

export const providerList = providers.map((p) => {
  const id = typeof p === "function" ? p().id : p.id;
  return { id, name: id === "discord" ? "Discord" : "Google" };
});

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "database" },
  trustHost: true,
}));

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Sign in to save your board.");
  return id;
}
