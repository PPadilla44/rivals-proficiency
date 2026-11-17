import { describe, expect, it } from "vitest";
import { boardLinkUrl } from "@/lib/board-link-open";
import { EVENT_NAMES } from "@/server/events";

describe("board link address", () => {
  it("joins origin and token", () => {
    expect(boardLinkUrl("https://rivalsproficiency.com", "abc23xyz")).toBe("https://rivalsproficiency.com/b/abc23xyz");
  });
  it("ignores trailing slashes on the origin", () => {
    expect(boardLinkUrl("http://localhost:3000//", "k3k3k3k3")).toBe("http://localhost:3000/b/k3k3k3k3");
  });
  it("records the board_link event", () => {
    expect(EVENT_NAMES).toContain("board_link");
  });
});
