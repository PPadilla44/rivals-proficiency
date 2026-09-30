import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { getProblems, reportProblem } from "@/server/alerts";
import { isBudgetError } from "@/lib/vision";

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
});

const t0 = new Date("2026-10-09T17:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

describe("problem alerts", () => {
  it("alerts once per hour per kind and counts every occurrence", async () => {
    const send = vi.fn<(content: string) => Promise<void>>(async () => {});
    expect((await reportProblem(db, "import_failed", "busy", { now: at(0), send })).alerted).toBe(true);
    expect((await reportProblem(db, "import_failed", "busy", { now: at(10), send })).alerted).toBe(false);
    expect((await reportProblem(db, "server_error", "boom", { now: at(11), send })).alerted).toBe(true);
    expect((await reportProblem(db, "import_failed", "failed", { now: at(61), send })).alerted).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0]).toContain("Screenshot reader failed (failed). 2 in the last hour.");

    const rows = await getProblems(db, 7, at(62));
    expect(rows.map((r) => [r.kind, r.count, r.lastDetail])).toEqual([
      ["import_failed", 3, "failed"],
      ["server_error", 1, "boom"],
    ]);
  });

  it("throttles unknown hero names per name, once a day", async () => {
    const send = vi.fn<(content: string) => Promise<void>>(async () => {});
    expect((await reportProblem(db, "unknown_hero", "Blue Marvel", { now: at(0), send })).alerted).toBe(true);
    expect((await reportProblem(db, "unknown_hero", "blue marvel", { now: at(120), send })).alerted).toBe(false);
    expect((await reportProblem(db, "unknown_hero", "Nova", { now: at(121), send })).alerted).toBe(true);
    expect((await reportProblem(db, "unknown_hero", "Blue Marvel", { now: at(24 * 60 + 1), send })).alerted).toBe(true);
  });

  it("never throws when the alert channel fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const send = vi.fn<(content: string) => Promise<void>>(async () => {
      throw new Error("webhook down");
    });
    expect(await reportProblem(db, "import_budget", undefined, { now: at(0), send })).toEqual({ alerted: false });
    expect((await getProblems(db, 7, at(1)))[0]).toMatchObject({ kind: "import_budget", count: 1 });
  });
});

describe("budget errors", () => {
  it("recognises a spent Anthropic budget", () => {
    expect(isBudgetError(400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}')).toBe(true);
    expect(isBudgetError(400, '{"error":{"message":"You have reached your specified workspace API usage limits."}}')).toBe(true);
    expect(isBudgetError(429, '{"error":{"type":"rate_limit_error","message":"Number of requests has exceeded your rate limit"}}')).toBe(false);
    expect(isBudgetError(500, "credit balance")).toBe(false);
  });
});
