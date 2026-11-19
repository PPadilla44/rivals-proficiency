import { describe, expect, it } from "vitest";
import { GUEST_LEVELS_KEY } from "@/lib/guest-board";
import { SAVED_BOARD_SCRIPT } from "@/lib/saved-board-flag";

/** Run the script against a fake page and storage; returns the attributes it set. */
function run(store: Record<string, string>, throwOnRead = false) {
  const attrs: Record<string, string> = {};
  const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  const localStorage = {
    getItem: (k: string) => {
      if (throwOnRead) throw new Error("blocked");
      return store[k] ?? null;
    },
  };
  new Function("document", "localStorage", SAVED_BOARD_SCRIPT)(document, localStorage);
  return attrs;
}

describe("saved board flag", () => {
  it("marks a page with saved levels", () => {
    expect(run({ "proficiency-board-v1": JSON.stringify({ levels: { hulk: 22 } }) })).toEqual({ "data-saved-board": "1" });
  });

  it("leaves a first visit, an empty board and bad data alone", () => {
    expect(run({})).toEqual({});
    expect(run({ "proficiency-board-v1": JSON.stringify({ levels: {} }) })).toEqual({});
    expect(run({ "proficiency-board-v1": "not json" })).toEqual({});
    expect(run({ "proficiency-board-v1": JSON.stringify({ levels: 5 }) })).toEqual({});
  });

  it("marks a dismissed import card", () => {
    expect(run({ "pb-import-card-hidden": "1" })).toEqual({ "data-card-hidden": "1" });
  });

  it("marks a visitor who already finished the example board", () => {
    expect(run({ "pb-example-done": "1" })).toEqual({ "data-example-done": "1" });
  });

  it("never throws when storage is blocked", () => {
    expect(run({}, true)).toEqual({});
  });

  it("uses the same keys as the board", async () => {
    const fs = await import("node:fs");
    // The board and the calculator both take the levels key from guest-board.ts; the page script must read the same one.
    expect(fs.readFileSync("src/components/Board.tsx", "utf8")).toContain("const LS_LEVELS = GUEST_LEVELS_KEY");
    expect(fs.readFileSync("src/components/Calculator.tsx", "utf8")).toContain("const LS_LEVELS = GUEST_LEVELS_KEY");
    expect(SAVED_BOARD_SCRIPT).toContain(`localStorage.getItem("${GUEST_LEVELS_KEY}")`);
    expect(fs.readFileSync("src/components/ScreenshotImport.tsx", "utf8")).toContain('LS_CARD = "pb-import-card-hidden"');
    expect(fs.readFileSync("src/components/Board.tsx", "utf8")).toContain('const LS_EXAMPLE_DONE = "pb-example-done"');
  });
});
