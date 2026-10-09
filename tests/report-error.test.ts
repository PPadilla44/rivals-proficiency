import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { getProblems, reportProblem } from "@/server/alerts";
import { BROWSER_ERRORS_PER_HOUR, authErrorInfo, isControlFlow, reportBrowserError } from "@/server/report-error";

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
});

const t0 = new Date("2026-10-09T17:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);
const sender = () => vi.fn<(content: string) => Promise<void>>(async () => {});

describe("server errors", () => {
  it("ignores redirects, 404s and rendering bailouts", () => {
    expect(isControlFlow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/;307;" }))).toBe(true);
    expect(isControlFlow(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toBe(true);
    expect(isControlFlow(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("alerts once an hour per route, so a second broken page still pings", async () => {
    const send = sender();
    const r = (route: string, min: number) =>
      reportProblem(db, "page_error", `render ${route}: boom`, { now: at(min), send, group: route });
    expect((await r("/app/ranks/page", 0)).alerted).toBe(true);
    expect((await r("/app/ranks/page", 5)).alerted).toBe(false);
    expect((await r("/app/calculator/page", 6)).alerted).toBe(true);
    expect((await r("/app/ranks/page", 61)).alerted).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("keeps grouping working for long route names", async () => {
    const send = sender();
    const long = "/app/api/cron/daily-digest/route-with-a-very-long-name";
    expect((await reportProblem(db, "page_error", "x", { now: at(0), send, group: long })).alerted).toBe(true);
    expect((await reportProblem(db, "page_error", "x", { now: at(1), send, group: long })).alerted).toBe(false);
  });

  it("puts a readable message in the alert and a short one in /stats", async () => {
    const send = sender();
    const msg = "render /app/ranks/page: Cannot read properties of undefined (reading 'level')";
    await reportProblem(db, "page_error", msg, { now: at(0), send, group: "/app/ranks/page" });
    expect(send.mock.calls[0][0]).toContain(msg);
    const [row] = await getProblems(db, 1, at(1));
    expect(row.lastDetail).toBe(msg.slice(0, 40));
  });
});

describe("sign-in errors", () => {
  const authError = (type: string, message: string, cause?: object) =>
    Object.assign(new Error(message), { type, cause });

  it("reports the failure we had: Discord rejected on the issuer check", () => {
    const e = authError("CallbackRouteError", "Read more at https://errors.authjs.dev#callbackrouteerror", {
      err: new Error('unexpected "iss" (issuer) response parameter value'),
      provider: "discord",
      expected: "https://authjs.dev",
    });
    expect(authErrorInfo(e)).toEqual({
      type: "CallbackRouteError",
      provider: "discord",
      message: 'unexpected "iss" (issuer) response parameter value',
    });
  });

  it("ignores a player cancelling and bots poking the endpoint", () => {
    expect(authErrorInfo(authError("AccessDenied", "denied"))).toBeNull();
    expect(authErrorInfo(authError("MissingCSRF", "csrf"))).toBeNull();
    expect(authErrorInfo(authError("UnknownAction", "nope"))).toBeNull();
    expect(authErrorInfo(authError("OAuthCallbackError", "access_denied: The user cancelled"))).toBeNull();
  });
});

describe("browser crashes", () => {
  it("records them per page and stops at the hourly cap", async () => {
    for (let i = 0; i < BROWSER_ERRORS_PER_HOUR; i++) {
      expect(await reportBrowserError(db, "x is undefined", "/calculator?a=1", at(i * 0.1))).toBe(true);
    }
    expect(await reportBrowserError(db, "x is undefined", "/calculator", at(3))).toBe(false);
    const [row] = await getProblems(db, 1, at(4));
    expect(row).toMatchObject({ kind: "browser_error", count: BROWSER_ERRORS_PER_HOUR, lastDetail: "/calculator: x is undefined" });
    expect(await reportBrowserError(db, "x is undefined", "/calculator", at(65))).toBe(true);
  });
});
