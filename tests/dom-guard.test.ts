import { describe, expect, it } from "vitest";
import { DOM_GUARD_SCRIPT } from "@/lib/dom-guard";

// A tiny stand-in for the DOM: the real methods throw when the node is not a child.
class FakeNode {
  parentNode: FakeNode | null = null;
  removeChild(child: FakeNode) {
    if (child.parentNode !== this) throw new Error("NotFoundError: removeChild");
    child.parentNode = null;
    return child;
  }
  insertBefore(node: FakeNode, ref: FakeNode | null) {
    if (ref && ref.parentNode !== this) throw new Error("NotFoundError: insertBefore");
    node.parentNode = this;
    return node;
  }
}

describe("DOM guard", () => {
  new Function("Node", DOM_GUARD_SCRIPT)(FakeNode);
  const parent = new FakeNode();
  const other = new FakeNode();

  it("skips removing a node a translator already moved, instead of crashing", () => {
    const moved = new FakeNode();
    moved.parentNode = other;
    expect(() => parent.removeChild(moved)).not.toThrow();
    expect(moved.parentNode).toBe(other);
  });

  it("skips inserting before a node that is gone", () => {
    const gone = new FakeNode();
    const node = new FakeNode();
    expect(() => parent.insertBefore(node, gone)).not.toThrow();
  });

  it("still does the normal work", () => {
    const child = new FakeNode();
    parent.insertBefore(child, null);
    expect(child.parentNode).toBe(parent);
    parent.removeChild(child);
    expect(child.parentNode).toBeNull();
  });
});
