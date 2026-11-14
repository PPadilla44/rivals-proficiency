import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import {
  FEEDBACK_LIMITS,
  countFeedback,
  countFeedbackOpens,
  feedbackPing,
  listFeedback,
  looksAutomated,
  notifyFeedback,
  parseFeedback,
  saveFeedback,
} from "@/server/feedback";
import { buildDigest, feedbackLine, importCheckLine } from "@/server/digest";
import { recordEvent } from "@/server/events";

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values({ id: "u1", name: "Tester" });
  db = pg as unknown as AnyDb;
});

const now = new Date("2026-11-13T10:00:00Z");
const ok = (input: unknown) => {
  const r = parseFeedback(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const idea = (message: string) => ok({ kind: "idea", message });

describe("parseFeedback", () => {
  it("accepts a message, trims it and drops an empty email", () => {
    const v = ok({ kind: "bug", message: "  The Punisher shows level 1  ", email: "  ", device: "mobile", page: "/" });
    expect(v).toEqual({ kind: "bug", message: "The Punisher shows level 1", email: undefined, device: "mobile", page: "/" });
  });
  it("keeps a valid email", () => {
    expect(ok({ kind: "idea", message: "Dark mode please", email: "a@b.co" }).email).toBe("a@b.co");
  });
  it("rejects messages that are too short or too long", () => {
    expect(parseFeedback({ kind: "idea", message: "hi" }).ok).toBe(false);
    expect(parseFeedback({ kind: "idea", message: "   " }).ok).toBe(false);
    expect(parseFeedback({ kind: "idea", message: "x".repeat(FEEDBACK_LIMITS.maxChars) }).ok).toBe(true);
    expect(parseFeedback({ kind: "idea", message: "x".repeat(FEEDBACK_LIMITS.maxChars + 1) }).ok).toBe(false);
  });
  it("rejects a bad email, an unknown kind and a missing body", () => {
    expect(parseFeedback({ kind: "idea", message: "Good idea here", email: "not-an-email" }).ok).toBe(false);
    expect(parseFeedback({ kind: "praise", message: "Good idea here" }).ok).toBe(false);
    expect(parseFeedback(null).ok).toBe(false);
    expect(parseFeedback("hello").ok).toBe(false);
  });
  it("strips control characters", () => {
    expect(ok({ kind: "other", message: "hello\u0000 there\u0007" }).message).toBe("hello there");
  });
});

describe("looksAutomated", () => {
  it("flags a filled hidden field or a form sent in under a second", () => {
    expect(looksAutomated({ website: "http://spam", openedMs: 9000 })).toBe(true);
    expect(looksAutomated({ website: "", openedMs: 400 })).toBe(true);
  });
  it("lets a person through", () => {
    expect(looksAutomated({ website: "", openedMs: 12_000 })).toBe(false);
    expect(looksAutomated(undefined)).toBe(false);
  });
});

describe("saveFeedback", () => {
  it("stores a message with who sent it", async () => {
    expect(await saveFeedback(db, ok({ kind: "bug", message: "Import missed Rogue", device: "desktop", page: "/" }), { visitorId: "visitor-aaaa1", userId: "u1" }, now)).toBe("saved");
    const rows = await listFeedback(db, 7, 50, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "bug", message: "Import missed Rogue", signedIn: true, device: "desktop", page: "/", email: null });
  });
  it("keeps the same words from the same browser once", async () => {
    const who = { visitorId: "visitor-aaaa1" };
    expect(await saveFeedback(db, idea("Add a dark mode"), who, now)).toBe("saved");
    expect(await saveFeedback(db, idea("Add a dark mode"), who, now)).toBe("duplicate");
    expect(await saveFeedback(db, idea("Add a dark mode"), { visitorId: "visitor-bbbb2" }, now)).toBe("saved");
    expect((await listFeedback(db, 7, 50, now)).length).toBe(2);
  });
  it("limits one browser per hour, not others, and frees up after the hour", async () => {
    const who = { visitorId: "visitor-aaaa1" };
    for (let i = 0; i < FEEDBACK_LIMITS.visitorPerHour; i++) expect(await saveFeedback(db, idea(`Idea number ${i}`), who, now)).toBe("saved");
    expect(await saveFeedback(db, idea("One more idea"), who, now)).toBe("visitor_limit");
    expect(await saveFeedback(db, idea("One more idea"), { visitorId: "visitor-bbbb2" }, now)).toBe("saved");
    const later = new Date(now.getTime() + 61 * 60_000);
    expect(await saveFeedback(db, idea("One more idea, later"), who, later)).toBe("saved");
  });
  it("limits the whole site per hour", async () => {
    for (let i = 0; i < FEEDBACK_LIMITS.sitePerHour; i++) {
      expect(await saveFeedback(db, idea(`Site idea ${i}`), { visitorId: `visitor-${String(i).padStart(4, "0")}` }, now)).toBe("saved");
    }
    expect(await saveFeedback(db, idea("Too many today"), { visitorId: "visitor-zzzz9" }, now)).toBe("site_limit");
  });
  it("deletes a person's messages when they delete their account", async () => {
    await saveFeedback(db, idea("From a signed-in player"), { visitorId: "visitor-aaaa1", userId: "u1" }, now);
    await saveFeedback(db, idea("From a guest player"), { visitorId: "visitor-bbbb2" }, now);
    await (db as unknown as { delete: (t: unknown) => { where: (w: unknown) => Promise<unknown> } }).delete(schema.users).where(eq(schema.users.id, "u1"));
    const rows = await listFeedback(db, 7, 50, now);
    expect(rows.map((r) => r.message)).toEqual(["From a guest player"]);
  });
});

describe("listFeedback and countFeedback", () => {
  it("lists newest first, within the window, and counts by kind", async () => {
    await saveFeedback(db, ok({ kind: "bug", message: "Oldest bug report" }), { visitorId: "visitor-aaaa1" }, new Date(now.getTime() - 5 * 3_600_000));
    await saveFeedback(db, ok({ kind: "idea", message: "Newer idea here" }), { visitorId: "visitor-bbbb2" }, new Date(now.getTime() - 3_600_000));
    await saveFeedback(db, ok({ kind: "other", message: "Thirty days old" }), { visitorId: "visitor-cccc3" }, new Date(now.getTime() - 40 * 86_400_000));
    const rows = await listFeedback(db, 30, 50, now);
    expect(rows.map((r) => r.message)).toEqual(["Newer idea here", "Oldest bug report"]);
    expect(await countFeedback(db, new Date(now.getTime() - 86_400_000), now)).toEqual({ total: 2, bug: 1, idea: 1, other: 0 });
  });
});

describe("countFeedbackOpens", () => {
  it("counts each visitor once, only inside the window", async () => {
    const at = (h: number) => new Date(now.getTime() - h * 3_600_000);
    await recordEvent(db, { name: "feedback_open", visitorId: "visitor-aaaa1", props: { from: "header" }, at: at(2) });
    await recordEvent(db, { name: "feedback_open", visitorId: "visitor-aaaa1", props: { from: "footer" }, at: at(1) });
    await recordEvent(db, { name: "feedback_open", visitorId: "visitor-bbbb2", props: { from: "link" }, at: at(3) });
    await recordEvent(db, { name: "feedback_open", visitorId: "visitor-cccc3", at: at(48) });
    await recordEvent(db, { name: "level_set", visitorId: "visitor-dddd4", at: at(1) });
    expect(await countFeedbackOpens(db, new Date(now.getTime() - 86_400_000), now)).toBe(2);
  });
});

describe("events the feedback buttons send", () => {
  it("are accepted and keep their source", async () => {
    expect(await recordEvent(db, { name: "feedback_open", visitorId: "visitor-aaaa1", props: { from: "import" } })).toBe(true);
    expect(await recordEvent(db, { name: "import_check", visitorId: "visitor-aaaa1", props: { result: "off" } })).toBe(true);
  });
});

describe("the Discord ping", () => {
  it("can't mention everyone, break out of the quote or run long", () => {
    const text = feedbackPing({ kind: "bug", message: "@everyone `click` https://x.example\n" + "line\n".repeat(30), hasEmail: true, signedIn: false, device: "mobile" });
    expect(text).not.toMatch(/@everyone/);
    expect(text).toContain("@​everyone");
    expect(text).not.toContain("`");
    expect(text.split("\n").filter((l) => l.startsWith("> ")).length).toBeLessThanOrEqual(6);
    expect(text).toContain("guest, phone, left an email");
    expect(text.length).toBeLessThan(800);
  });
  it("sends one ping per message, then stops after the hourly cap, and never throws", async () => {
    const send = vi.fn(async () => {});
    for (let i = 0; i < FEEDBACK_LIMITS.pingPerHour + 5; i++) {
      await saveFeedback(db, idea(`Ping idea ${i}`), { visitorId: `visitor-${String(i).padStart(4, "0")}` }, now);
      await notifyFeedback(db, { kind: "idea", message: `Ping idea ${i}`, hasEmail: false, signedIn: false }, { send, now });
    }
    expect(send).toHaveBeenCalledTimes(FEEDBACK_LIMITS.pingPerHour);
    const failing = vi.fn(async () => {
      throw new Error("webhook down");
    });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyFeedback(db, { kind: "idea", message: "Late", hasEmail: false, signedIn: false }, { send: failing, now: new Date(now.getTime() + 2 * 3_600_000) })).resolves.toBe(false);
    quiet.mockRestore();
  });
});

describe("the digest", () => {
  it("shows a Feedback section", async () => {
    expect(feedbackLine({ total: 0, bug: 0, idea: 0, other: 0 })).toBe("none");
    expect(feedbackLine({ total: 0, bug: 0, idea: 0, other: 0 }, 4)).toBe("none · 4 opened the form");
    expect(feedbackLine({ total: 1, bug: 1, idea: 0, other: 0 }, 4)).toContain("· 4 opened the form ·");
    expect(feedbackLine({ total: 3, bug: 1, idea: 2, other: 0 })).toContain("3 new (bugs 1, ideas 2, other 0)");
    await saveFeedback(db, ok({ kind: "bug", message: "Something broke" }), { visitorId: "visitor-aaaa1" }, new Date(now.getTime() - 3_600_000));
    const text = await buildDigest(db, { now, search: async () => [] });
    expect(text).toContain("**Feedback**\n1 new (bugs 1, ideas 0, other 0)");
  });
});

describe("the import check line in the digest", () => {
  it("words the answers and never goes negative", () => {
    expect(importCheckLine(0, 0, 0)).toBe('Asked "did it read right?": no answers yet');
    expect(importCheckLine(0, 0, 4)).toBe('Asked "did it read right?": no answers yet');
    expect(importCheckLine(3, 1, 5)).toBe('Asked "did it read right?": looks right 3 \u00b7 something\'s off 1 \u00b7 1 of 5 saves had no answer');
    expect(importCheckLine(2, 0, 2)).toBe('Asked "did it read right?": looks right 2 \u00b7 something\'s off 0');
    expect(importCheckLine(3, 1, 2)).not.toContain("saves had no answer");
  });

  it("counts each person once per answer, inside the window, from real events", async () => {
    const at = (h: number) => new Date(now.getTime() - h * 3_600_000);
    await recordEvent(db, { name: "import_save", visitorId: "visitor-aaaa1", props: { heroes: 9 }, at: at(5) });
    await recordEvent(db, { name: "import_save", visitorId: "visitor-bbbb2", props: { heroes: 9 }, at: at(4) });
    await recordEvent(db, { name: "import_save", visitorId: "visitor-cccc3", props: { heroes: 9 }, at: at(3) });
    await recordEvent(db, { name: "import_check", visitorId: "visitor-aaaa1", props: { result: "right" }, at: at(5) });
    await recordEvent(db, { name: "import_check", visitorId: "visitor-aaaa1", props: { result: "right" }, at: at(4) });
    await recordEvent(db, { name: "import_check", visitorId: "visitor-bbbb2", props: { result: "off" }, at: at(3) });
    await recordEvent(db, { name: "import_check", visitorId: "visitor-dddd4", props: { result: "right" }, at: at(48) });
    const text = await buildDigest(db, { now, search: async () => [] });
    expect(text).toContain('**Import**');
    expect(text).toContain('Asked "did it read right?": looks right 1 \u00b7 something\'s off 1 \u00b7 1 of 3 saves had no answer');
  });
});
