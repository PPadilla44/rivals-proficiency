import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildProviders } from "@/lib/auth-providers";

type Merged = {
  id: string;
  allowDangerousEmailAccountLinking?: boolean;
  profile: (raw: unknown, tokens: unknown) => Promise<{ email: unknown; image?: unknown }> | { email: unknown; image?: unknown };
};

// The two providers as Auth.js finally sees them, after it merges our settings over its own
// defaults: the verified-email rule has to survive that merge, or linking would trust any email.
let merged: Merged[];
beforeAll(async () => {
  vi.stubEnv("AUTH_DISCORD_ID", "d");
  vi.stubEnv("AUTH_DISCORD_SECRET", "s");
  vi.stubEnv("AUTH_GOOGLE_ID", "g");
  vi.stubEnv("AUTH_GOOGLE_SECRET", "s");
  const configuredProviders = buildProviders({ discord: true, google: true });
  const core = createRequire(createRequire(import.meta.url).resolve("next-auth")).resolve("@auth/core");
  const parse = (await import(pathToFileURL(core.replace(/index\.js$/, "lib/utils/providers.js")).href)) as {
    default: (p: { providerId?: string; config: { providers: unknown[]; basePath?: string }; url: URL }) => { providers: Merged[] };
  };
  merged = parse.default({ config: { providers: configuredProviders, basePath: "/api/auth" }, url: new URL("https://example.test") }).providers;
});
afterAll(() => vi.unstubAllEnvs());

const discordRaw = (email: string, verified: boolean) => ({ id: "1", username: "pablo", global_name: "Pablo", avatar: null, discriminator: "0", email, verified });
const googleRaw = (email: string, verified: boolean) => ({ sub: "g", name: "Pablo", email, email_verified: verified, picture: "p.png" });
const find = (id: string) => merged.find((p) => p.id === id)!;

describe("sign-in providers as configured", () => {
  it("offers Discord and Google, both allowed to link", () => {
    expect(merged.map((p) => p.id).sort()).toEqual(["discord", "google"]);
    expect(find("discord").allowDangerousEmailAccountLinking).toBe(true);
    expect(find("google").allowDangerousEmailAccountLinking).toBe(true);
  });

  it("Discord: hands over the email only when it is verified, and keeps the avatar", async () => {
    expect((await find("discord").profile(discordRaw("a@b.co", true), {})).email).toBe("a@b.co");
    const unverified = await find("discord").profile(discordRaw("a@b.co", false), {});
    expect(unverified.email).toBeNull();
    expect(String(unverified.image)).toContain("cdn.discordapp.com");
  });

  it("Google: hands over the email only when it is verified", async () => {
    expect((await find("google").profile(googleRaw("a@b.co", true), {})).email).toBe("a@b.co");
    expect((await find("google").profile(googleRaw("a@b.co", false), {})).email).toBeNull();
  });
});
