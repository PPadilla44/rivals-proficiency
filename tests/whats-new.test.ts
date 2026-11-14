import { describe, expect, it } from "vitest";
import { WHATS_NEW, WHATS_NEW_UPDATED, formatWhatsNewDate } from "@/lib/whats-new";

describe("what's new entries", () => {
  it("has valid ISO dates, newest first", () => {
    for (const e of WHATS_NEW) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(`${e.date}T12:00:00Z`).getTime())).toBe(false);
    }
    const dates = WHATS_NEW.map((e) => e.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(WHATS_NEW_UPDATED).toBe(dates[0]);
  });

  it("has a title and text on every entry, and no em dashes", () => {
    for (const e of WHATS_NEW) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.text.trim().length).toBeGreaterThan(0);
      expect(`${e.title}${e.text}`).not.toContain("—");
    }
  });

  it("formats dates the same in every time zone", () => {
    expect(formatWhatsNewDate("2026-11-14")).toBe("Nov 14, 2026");
  });
});
