import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminEmail, playtimeSyncEnabled } from "@/lib/flags";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("admin emails", () => {
  it("match case-insensitively", () => {
    vi.stubEnv("ADMIN_EMAILS", "Me@Example.com, other@x.io");
    expect(isAdminEmail("me@example.com")).toBe(true);
    expect(isAdminEmail("OTHER@X.IO")).toBe(true);
    expect(isAdminEmail("stranger@x.io")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe("playtime sync gate", () => {
  const me = { id: "u1", email: "me@example.com" };

  it("never checks the flag without the API key", async () => {
    vi.stubEnv("MARVEL_RIVALS_API_KEY", "");
    const evaluate = vi.fn(async () => true);
    expect(await playtimeSyncEnabled(me, evaluate)).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("never checks the flag for guests", async () => {
    vi.stubEnv("MARVEL_RIVALS_API_KEY", "k");
    const evaluate = vi.fn(async () => true);
    expect(await playtimeSyncEnabled(null, evaluate)).toBe(false);
    expect(await playtimeSyncEnabled({ id: null }, evaluate)).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("follows the flag for signed-in users", async () => {
    vi.stubEnv("MARVEL_RIVALS_API_KEY", "k");
    expect(await playtimeSyncEnabled(me, async () => true)).toBe(true);
    expect(await playtimeSyncEnabled(me, async () => false)).toBe(false);
  });

  it("keeps admins on and others off if the flag service fails", async () => {
    vi.stubEnv("MARVEL_RIVALS_API_KEY", "k");
    vi.stubEnv("ADMIN_EMAILS", "me@example.com");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = async () => {
      throw new Error("down");
    };
    expect(await playtimeSyncEnabled(me, boom)).toBe(true);
    expect(await playtimeSyncEnabled({ id: "u2", email: "friend@x.io" }, boom)).toBe(false);
  });
});
