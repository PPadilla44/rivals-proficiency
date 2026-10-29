import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { getDb } from "@/db";
import { discordUser, googleUser, verifiedEmail } from "@/lib/auth-profile";

// Auth.js's own sign-in step, run against a real (in-memory) database. It is not part of the
// package's public exports, so it is loaded from next-auth's copy of @auth/core by path. If an
// upgrade moves it, this test fails and the linking rules need checking again.
const nextAuthRequire = createRequire(createRequire(import.meta.url).resolve("next-auth"));
const corePath = nextAuthRequire.resolve("@auth/core");
const { handleLoginOrRegister } = (await import(
  pathToFileURL(corePath.replace(/index\.js$/, "lib/actions/callback/handle-login.js")).href
)) as {
  handleLoginOrRegister: (
    sessionToken: string | undefined,
    profile: unknown,
    account: unknown,
    options: unknown,
  ) => Promise<{ user: { id: string }; isNewUser: boolean }>;
};

let pg: ReturnType<typeof drizzle<typeof schema>>;
let options: unknown;
beforeEach(async () => {
  pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  options = {
    adapter: DrizzleAdapter(pg as unknown as ReturnType<typeof getDb>, {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    jwt: {},
    events: {},
    session: { strategy: "database", generateSessionToken: () => crypto.randomUUID(), maxAge: 3600 },
    provider: { allowDangerousEmailAccountLinking: true, account: () => ({}) },
  };
});

const account = (provider: string, id: string) => ({ provider, type: "oauth", providerAccountId: id });
const google = (email: string, verified: boolean) =>
  googleUser({ sub: "g-1", name: "Pablo", email, email_verified: verified, picture: "p.png" });
const discord = (email: string, verified: boolean) =>
  discordUser({ id: "d-1", name: "Pablo", email, image: "d.png" }, { email, verified });
const accountsOf = async (userId: string) =>
  (await pg.select().from(schema.accounts).where(eq(schema.accounts.userId, userId))).map((a) => a.provider).sort();

describe("which email a provider vouches for", () => {
  it("keeps it only when the provider says it is verified", () => {
    expect(verifiedEmail("a@b.co", true)).toBe("a@b.co");
    expect(verifiedEmail("a@b.co", "true")).toBe("a@b.co");
    expect(verifiedEmail("a@b.co", false)).toBeNull();
    expect(verifiedEmail("a@b.co", undefined)).toBeNull();
    expect(verifiedEmail(null, true)).toBeNull();
  });

  it("leaves the rest of the profile alone", () => {
    expect(discord("a@b.co", false)).toEqual({ id: "d-1", name: "Pablo", email: null, image: "d.png" });
    expect(google("a@b.co", true)).toEqual({ id: "g-1", name: "Pablo", email: "a@b.co", image: "p.png" });
  });
});

describe("signing in with the other provider on the same email", () => {
  it("opens the same board when both emails are verified (Google first, then Discord)", async () => {
    const first = await handleLoginOrRegister(undefined, google("a@b.co", true), account("google", "g-1"), options);
    const second = await handleLoginOrRegister(undefined, discord("a@b.co", true), account("discord", "d-1"), options);
    expect(first.isNewUser).toBe(true);
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(await accountsOf(first.user.id)).toEqual(["discord", "google"]);
    expect(await pg.select().from(schema.users)).toHaveLength(1);
  });

  it("works the other way round (Discord first, then Google)", async () => {
    const first = await handleLoginOrRegister(undefined, discord("a@b.co", true), account("discord", "d-1"), options);
    const second = await handleLoginOrRegister(undefined, google("a@b.co", true), account("google", "g-1"), options);
    expect(second.user.id).toBe(first.user.id);
  });

  it("never joins a board through an unverified email, and does not error", async () => {
    const owner = await handleLoginOrRegister(undefined, google("a@b.co", true), account("google", "g-1"), options);
    const other = await handleLoginOrRegister(undefined, discord("a@b.co", false), account("discord", "d-1"), options);
    expect(other.isNewUser).toBe(true);
    expect(other.user.id).not.toBe(owner.user.id);
    expect(await accountsOf(owner.user.id)).toEqual(["google"]);
  });

  it("keeps two unverified sign-ins separate", async () => {
    const a = await handleLoginOrRegister(undefined, discord("a@b.co", false), account("discord", "d-1"), options);
    const b = await handleLoginOrRegister(undefined, discord("a@b.co", false), account("discord", "d-2"), options);
    expect(a.user.id).not.toBe(b.user.id);
  });

  it("returns the same user on a repeat sign-in", async () => {
    const first = await handleLoginOrRegister(undefined, google("a@b.co", true), account("google", "g-1"), options);
    const again = await handleLoginOrRegister(undefined, google("a@b.co", true), account("google", "g-1"), options);
    expect(again.user.id).toBe(first.user.id);
    expect(again.isNewUser).toBe(false);
  });
});
