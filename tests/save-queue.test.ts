import { describe, expect, it } from "vitest";
import { OFFLINE_SAVE_MESSAGE, requeueFailed } from "@/lib/save-queue";

describe("requeueFailed", () => {
  it("puts levels from a failed save back in the queue", () => {
    const pending = new Map<string, number>();
    requeueFailed(pending, [
      { heroId: "hulk", level: 23 },
      { heroId: "thor", level: 41 },
    ]);
    expect([...pending]).toEqual([
      ["hulk", 23],
      ["thor", 41],
    ]);
  });

  it("keeps a newer level the player set while the save was running", () => {
    const pending = new Map<string, number>([["hulk", 25]]);
    requeueFailed(pending, [
      { heroId: "hulk", level: 23 },
      { heroId: "thor", level: 41 },
    ]);
    expect(pending.get("hulk")).toBe(25);
    expect(pending.get("thor")).toBe(41);
  });

  it("does nothing when nothing failed", () => {
    const pending = new Map<string, number>([["hulk", 25]]);
    requeueFailed(pending, []);
    expect([...pending]).toEqual([["hulk", 25]]);
  });

  it("has a plain message for the offline case", () => {
    expect(OFFLINE_SAVE_MESSAGE).toContain("not saved yet");
  });
});
