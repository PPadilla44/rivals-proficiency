import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";

vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("preview sign-in", () => {
  it("creates a fresh test user with a session", async () => {
    const { createPreviewSession } = await import("@/server/preview-login");
    const now = new Date("2026-10-04T12:00:00Z");
    const a = await createPreviewSession(db, now);
    const b = await createPreviewSession(db, now);
    expect(a.userId).not.toBe(b.userId);
    expect(a.expires.getTime()).toBe(now.getTime() + 7 * 86_400_000);
    const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, a.token));
    expect(rows[0]?.userId).toBe(a.userId);
  });

  it("is off in production and refuses to sign in", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    const m = await import("@/server/preview-login");
    expect(m.previewLoginEnabled).toBe(false);
    await expect(m.previewSignIn(db)).rejects.toThrow();
    expect(await db.select().from(schema.users)).toHaveLength(0);
  });

  it("is on for preview deployments only", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await import("@/server/preview-login")).previewLoginEnabled).toBe(true);
    vi.resetModules();
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "development");
    expect((await import("@/server/preview-login")).previewLoginEnabled).toBe(false);
  });
});
