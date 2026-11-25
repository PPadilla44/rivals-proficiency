import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { recordEvent } from "@/server/events";
import { MIN_TOKEN_LENGTH, buildAdminStats, parseView, statsToken, tokenMatches } from "@/server/admin-stats";

let db: AnyDb;
vi.mock("@/db", () => ({ getDb: () => db }));
// unstable_cache needs the Next runtime, which tests do not have.
vi.mock("@/app/stats/search-cache", () => ({ getCachedSearch: async () => ({ report: { fake: true }, daily: [] }) }));

const TOKEN = "t".repeat(MIN_TOKEN_LENGTH) + "-secret";
const old = { admins: process.env.ADMIN_EMAILS, token: process.env.STATS_TOKEN, db: process.env.DATABASE_URL, g: process.env.GOOGLE_SERVICE_ACCOUNT_JSON };

beforeEach(async () => {
  process.env.ADMIN_EMAILS = "boss@example.com";
  process.env.STATS_TOKEN = TOKEN;
  process.env.DATABASE_URL = "postgres://test";
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values([
    { id: "boss", name: "Boss Person", email: "boss@example.com" },
    { id: "u1", name: "Player One", email: "player1@example.com" },
  ]);
  db = pg as unknown as AnyDb;
});
afterEach(() => {
  const restore = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  restore("ADMIN_EMAILS", old.admins);
  restore("STATS_TOKEN", old.token);
  restore("DATABASE_URL", old.db);
  restore("GOOGLE_SERVICE_ACCOUNT_JSON", old.g);
});

const now = new Date("2026-11-20T20:00:00Z");
const ev = (name: string, visitorId: string, when: string, extra: Record<string, unknown> = {}) =>
  recordEvent(db, { name: name as never, visitorId, at: new Date(when), ...extra } as never);

async function seed() {
  await ev("visit", "visitor-aaaa-1111", "2026-11-19T20:00:00Z", { props: { device: "mobile", ref: "google.com" } });
  await ev("level_set", "visitor-aaaa-1111", "2026-11-19T20:05:00Z");
  await ev("identify", "visitor-aaaa-1111", "2026-11-19T20:06:00Z", { userId: "u1" });
  await ev("visit", "visitor-bbbb-2222", "2026-11-19T21:00:00Z", { props: { device: "desktop", ref: "direct" } });
  // The owner's browser: must not be counted anywhere.
  await ev("visit", "owner-phone-9999", "2026-11-19T22:00:00Z", { props: { device: "mobile", ref: "direct" } });
  await ev("level_set", "owner-phone-9999", "2026-11-19T22:05:00Z");
  await ev("identify", "owner-phone-9999", "2026-11-19T22:06:00Z", { userId: "boss" });
}

describe("stats token", () => {
  it("is off when unset or shorter than the minimum", () => {
    expect(statsToken({})).toBeNull();
    expect(statsToken({ STATS_TOKEN: "short" })).toBeNull();
    expect(statsToken({ STATS_TOKEN: "x".repeat(MIN_TOKEN_LENGTH) })).toBe("x".repeat(MIN_TOKEN_LENGTH));
  });

  it("matches only an exact Bearer header", () => {
    expect(tokenMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(tokenMatches(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenMatches(`Bearer ${TOKEN.slice(1)}`, TOKEN)).toBe(false);
    expect(tokenMatches(TOKEN, TOKEN)).toBe(false);
    expect(tokenMatches(`bearer ${TOKEN}`, TOKEN)).toBe(false);
    expect(tokenMatches("Bearer ", TOKEN)).toBe(false);
    expect(tokenMatches(null, TOKEN)).toBe(false);
  });

  it("reads the view, with every unknown value meaning all", () => {
    expect(parseView("features")).toBe("features");
    expect(parseView("visitors")).toBe("all");
    expect(parseView(null)).toBe("all");
  });
});

describe("buildAdminStats", () => {
  it("returns only the view asked for", async () => {
    await seed();
    const one = await buildAdminStats(db, { view: "features", range: "7", now });
    expect(Object.keys(one).sort()).toEqual(["features", "generatedAt", "range"]);
    const all = await buildAdminStats(db, { view: "all", range: "7", now, search: async () => ({ state: "off" }) });
    expect(Object.keys(all).sort()).toEqual(["cohorts", "features", "generatedAt", "overview", "problems", "range", "search", "sources"]);
  });

  it("matches the dashboard and leaves the owner out", async () => {
    await seed();
    const { overview } = await buildAdminStats(db, { view: "overview", range: "7", now });
    expect(overview?.now.visitors).toBe(2);
    expect(overview?.now.interacted).toBe(1);
    expect(overview?.ownerVisitorsLeftOut).toBeGreaterThan(0);
  });

  it("holds no emails, names or visitor ids", async () => {
    await seed();
    const all = await buildAdminStats(db, { view: "all", range: "all", now, search: async () => ({ state: "off" }) });
    const text = JSON.stringify(all).toLowerCase();
    for (const secret of ["example.com", "boss person", "player one", "visitor-aaaa", "visitor-bbbb", "owner-phone"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("GET /api/stats", () => {
  const call = async (headers: Record<string, string> = {}, query = "") => {
    const { GET } = await import("@/app/api/stats/route");
    return GET(new Request(`https://example.test/api/stats${query}`, { headers }));
  };

  it("is a 404 until a long enough token is set", async () => {
    delete process.env.STATS_TOKEN;
    expect((await call({ authorization: `Bearer ${TOKEN}` })).status).toBe(404);
    process.env.STATS_TOKEN = "too-short";
    expect((await call({ authorization: "Bearer too-short" })).status).toBe(404);
  });

  it("refuses a missing or wrong token the same way", async () => {
    const none = await call();
    const wrong = await call({ authorization: "Bearer nope" });
    expect([none.status, wrong.status]).toEqual([401, 401]);
    expect(await none.text()).toBe(await wrong.text());
    expect(none.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("does not accept the token in the URL", async () => {
    expect((await call({}, `?token=${TOKEN}`)).status).toBe(401);
  });

  it("answers with JSON that is never cached or indexed", async () => {
    await seed();
    const res = await call({ authorization: `Bearer ${TOKEN}` }, "?view=overview&range=7");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const body = await res.json();
    expect(body.overview.range).toBe("7");
    expect(body.features).toBeUndefined();
  });

  it("says when Search Console is not set up instead of failing", async () => {
    const res = await call({ authorization: `Bearer ${TOKEN}` }, "?view=search");
    expect((await res.json()).search).toEqual({ state: "off" });
  });

  it("serves GET only", async () => {
    const route = await import("@/app/api/stats/route");
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["GET"]);
  });
});
