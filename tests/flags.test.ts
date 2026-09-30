import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminEmail, parseFlagMode, playtimeSyncEnabledFor, playtimeSyncMode } from "@/lib/flags";

afterEach(() => vi.unstubAllEnvs());

describe("flag modes", () => {
  it("parses common spellings and falls back otherwise", () => {
    expect(parseFlagMode("ON", "off")).toBe("on");
    expect(parseFlagMode("everyone", "off")).toBe("on");
    expect(parseFlagMode("false", "on")).toBe("off");
    expect(parseFlagMode(" admins ", "off")).toBe("admin");
    expect(parseFlagMode(undefined, "admin")).toBe("admin");
    expect(parseFlagMode("maybe", "off")).toBe("off");
  });

  it("matches admin emails case-insensitively", () => {
    vi.stubEnv("ADMIN_EMAILS", "Me@Example.com, other@x.io");
    expect(isAdminEmail("me@example.com")).toBe(true);
    expect(isAdminEmail("OTHER@X.IO")).toBe(true);
    expect(isAdminEmail("stranger@x.io")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe("playtime sync flag", () => {
  it("is off without an API key, whatever the flag says", () => {
    vi.stubEnv("MARVEL_RIVALS_API_KEY", "");
    vi.stubEnv("FEATURE_PLAYTIME_SYNC", "on");
    expect(playtimeSyncMode()).toBe("off");
    expect(playtimeSyncEnabledFor("anyone@x.io")).toBe(false);
  });

  it("defaults to admins only once the key is set", () => {
    vi.stubEnv("MARVEL_RIVALS_API_KEY", "k");
    vi.stubEnv("FEATURE_PLAYTIME_SYNC", "");
    vi.stubEnv("ADMIN_EMAILS", "me@example.com");
    expect(playtimeSyncMode()).toBe("admin");
    expect(playtimeSyncEnabledFor("me@example.com")).toBe(true);
    expect(playtimeSyncEnabledFor("friend@example.com")).toBe(false);
    expect(playtimeSyncEnabledFor(undefined)).toBe(false);
  });

  it("opens to everyone when on, and closes when off", () => {
    vi.stubEnv("MARVEL_RIVALS_API_KEY", "k");
    vi.stubEnv("FEATURE_PLAYTIME_SYNC", "on");
    expect(playtimeSyncEnabledFor("friend@example.com")).toBe(true);
    vi.stubEnv("FEATURE_PLAYTIME_SYNC", "off");
    vi.stubEnv("ADMIN_EMAILS", "me@example.com");
    expect(playtimeSyncEnabledFor("me@example.com")).toBe(false);
  });
});
