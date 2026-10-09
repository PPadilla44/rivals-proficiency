import { describe, expect, it } from "vitest";
import { daysText, defaultGoal, finishDate, goalOptions, hoursText, plan } from "@/lib/calculator";
import { pointsBetween } from "@/lib/proficiency";

describe("calculator plan", () => {
  it("level 1 to Lord is 6,100 points, about 19 hours", () => {
    const p = plan(1, 20, null);
    expect(p.points).toBe(6100);
    expect(p.points).toBe(pointsBetween(1, 20));
    expect(Math.round(p.hours)).toBe(19);
    expect(p.days).toBeNull();
  });

  it("lists every rank on the way and ends at the goal", () => {
    const p = plan(7, 20, null);
    expect(p.stops.map((s) => [s.level, s.rank])).toEqual([
      [10, "Captain"],
      [15, "Centurion"],
      [20, "Lord"],
    ]);
    expect(p.stops.at(-1)!.points).toBe(p.points);
  });

  it("a goal inside a rank is named after that rank", () => {
    const p = plan(20, 29, null);
    expect(p.stops.at(-1)).toMatchObject({ level: 29, rank: "Count", label: "Level 29" });
  });

  it("calls the max goal Level 70, not a second Champion", () => {
    const labels = plan(1, 70, null).stops.map((s) => s.label);
    expect(labels.slice(-2)).toEqual(["Champion", "Level 70"]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(plan(55, 70, null).stops.map((s) => s.label)).toEqual(["Level 70"]);
  });

  it("never repeats a stop for any level and goal", () => {
    for (let from = 1; from < 70; from++)
      for (const g of goalOptions(from)) {
        const labels = plan(from, g.level, 5).stops.map((s) => s.label);
        expect(new Set(labels).size).toBe(labels.length);
        expect(plan(from, g.level, 5).stops.at(-1)!.level).toBe(g.level);
      }
  });

  it("turns hours per week into days", () => {
    const p = plan(1, 20, 7);
    expect(p.days).toBeCloseTo(p.hours, 5);
  });

  it("only counts rewards after the current level, up to the goal", () => {
    const p = plan(8, 20, null);
    expect(p.rewards[0].level).toBe(10);
    expect(p.rewards.at(-1)!.level).toBe(20);
  });

  it("a goal at or below the current level needs nothing", () => {
    const p = plan(30, 20, 5);
    expect(p.points).toBe(0);
    expect(p.to).toBe(30);
  });
});

describe("goals", () => {
  it("offers the ranks above the current level, then max", () => {
    const g = goalOptions(48).map((o) => o.level);
    expect(g).toEqual([50, 70]);
    expect(goalOptions(70)).toEqual([]);
  });
  it("defaults to Lord, then Champion, then max", () => {
    expect(defaultGoal(3)).toBe(20);
    expect(defaultGoal(20)).toBe(50);
    expect(defaultGoal(55)).toBe(70);
  });
});

describe("text", () => {
  it("rounds hours readably", () => {
    expect(hoursText(0.3)).toBe("about 20 minutes");
    expect(hoursText(1)).toBe("about 1 hour");
    expect(hoursText(4.3)).toBe("about 4.5 hours");
    expect(hoursText(19.06)).toBe("about 19 hours");
  });
  it("rounds days readably", () => {
    expect(daysText(0.2)).toBe("1 day");
    expect(daysText(9)).toBe("9 days");
    expect(daysText(30)).toBe("4 weeks");
    expect(daysText(200)).toBe("7 months");
    expect(daysText(500)).toBe("16 months");
    expect(daysText(2100)).toBe("about 5.5 years");
  });
  it("adds the year only when it changes", () => {
    const now = new Date(2026, 9, 9);
    expect(finishDate(24, now)).toBe("Nov 2");
    expect(finishDate(100, now)).toBe("Jan 17, 2027");
  });
});
