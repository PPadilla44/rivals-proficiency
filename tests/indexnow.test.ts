import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { INDEXED_PATHS, submitIndexNowOnce } from "@/server/indexnow";
import { INDEXNOW_KEY } from "@/lib/site";
import { readFileSync } from "node:fs";

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  db = pg as unknown as AnyDb;
});

const ok = () => vi.fn(async () => new Response(null, { status: 202 }));

describe("IndexNow", () => {
  it("serves the key file search engines check", () => {
    expect(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8")).toBe(INDEXNOW_KEY);
  });

  it("submits every indexed page once per commit", async () => {
    const f = ok();
    expect(await submitIndexNowOnce(db, { commit: "abc123def4567890", fetchImpl: f })).toMatchObject({ submitted: true });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.key).toBe(INDEXNOW_KEY);
    expect(body.urlList).toHaveLength(INDEXED_PATHS.length);

    expect(await submitIndexNowOnce(db, { commit: "abc123def4567890", fetchImpl: f })).toMatchObject({
      submitted: false,
      reason: "already submitted",
    });
    expect(f).toHaveBeenCalledTimes(1);

    await submitIndexNowOnce(db, { commit: "ffff000011112222", fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("tries again next time when the engine refuses", async () => {
    const bad = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await submitIndexNowOnce(db, { commit: "abc123def4567890", fetchImpl: bad })).toMatchObject({ submitted: false, status: 403 });
    const f = ok();
    expect(await submitIndexNowOnce(db, { commit: "abc123def4567890", fetchImpl: f })).toMatchObject({ submitted: true });
  });

  it("does nothing outside a deployment", async () => {
    const f = ok();
    expect(await submitIndexNowOnce(db, { commit: "", fetchImpl: f })).toMatchObject({ submitted: false });
    expect(f).not.toHaveBeenCalled();
  });
});
