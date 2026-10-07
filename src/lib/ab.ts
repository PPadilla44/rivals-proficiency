/**
 * Split testing without cookies: the anonymous browser id decides the group,
 * so a visitor always lands in the same one.
 */
export type Arm = "a" | "b";

/** Example board rollout, set by the example-board flag in Vercel. */
export type ExampleMode = "off" | "test" | "on";

/** FNV-1a: small, fast, and spreads similar ids evenly. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Which half this visitor is in for an experiment. The experiment name keeps tests independent of each other. */
export function armFor(visitorId: string, experiment: string): Arm {
  return hash(`${experiment}:${visitorId}`) % 2 === 0 ? "a" : "b";
}

/** Whether this visitor gets the example board: everyone when on, the "b" half during the test. */
export function showsExample(mode: ExampleMode, visitorId: string): boolean {
  if (mode === "on") return true;
  if (mode === "test") return armFor(visitorId, "example") === "b";
  return false;
}
