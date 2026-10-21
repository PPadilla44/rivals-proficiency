import { z } from "zod";
import { HEROES } from "./heroes";
import { RANKS } from "./proficiency";
import { RANK_LEGEND_JPEG_BASE64 } from "./rank-legend";
import type { Detection } from "./screenshot-import";

/** Reads hero proficiency off a Marvel Rivals screenshot with Claude's vision model. */

export const visionConfigured = !!process.env.ANTHROPIC_API_KEY;

// Opus read all 54 rank badges on the Heroes tab fixtures correctly; Sonnet 5
// and Haiku 4.5 confused the small winged badges (39 and 42 of 54).
const MODEL = process.env.SCREENSHOT_MODEL ?? "claude-opus-5-5";

/** Why a read failed. "budget" means the Anthropic spend limit or credit ran out. */
export type VisionErrorCode = "not_configured" | "unreachable" | "busy" | "budget" | "failed" | "unreadable";

export class VisionError extends Error {
  constructor(
    message: string,
    public readonly code: VisionErrorCode = "failed",
  ) {
    super(message);
  }
}

/** Anthropic answers a spent budget or credit with a 4xx whose message says so. */
export function isBudgetError(status: number, body: string): boolean {
  return [400, 402, 403, 429].includes(status) && /credit balance|usage limit|spend limit|billing/i.test(body);
}

/** Models that accept a forced tool choice. */
const FORCE_TOOL = /haiku-4-5/;

const TOOL = {
  name: "report_heroes",
  description: "Report every hero card visible in the screenshot with its proficiency rank badge.",
  input_schema: {
    type: "object",
    properties: {
      is_proficiency_screen: {
        type: "boolean",
        description: "True if this is a Marvel Rivals screen that shows hero proficiency (for example the Heroes tab).",
      },
      heroes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Hero name as printed on the card." },
            badge: {
              type: "string",
              description: "Short description of the rank badge under the name: main color, shape, and whether it has wings.",
            },
            rank: { type: ["string", "null"], enum: [...RANKS, null], description: "The rank whose reference badge matches, or null if unsure." },
            level: { type: ["integer", "null"], description: "Proficiency level number, only if a number is printed. Usually null." },
          },
          required: ["name", "badge", "rank", "level"],
        },
      },
    },
    required: ["is_proficiency_screen", "heroes"],
  },
} as const;

const SYSTEM = `You read screenshots from the game Marvel Rivals and report each hero's proficiency rank.

The first image is a labeled reference of the ${RANKS.length} proficiency rank badges, lowest to highest: ${RANKS.join(", ")}. The images after it are the player's screenshot, sometimes split into overlapping tiles.

On the Heroes tab each hero card shows the hero name, and directly under the name a small rank badge. Ignore the yellow bookmark icon next to some badges (it marks favorites) and the role icon at the right of the name.

How to tell badges apart:
- Agent: bronze or brown chevron shield. Knight: the same shield in silver or gray.
- Captain: teal crystal cross, no wings. Centurion: small pale blue star, no wings. Lord: gold star, no wings.
- Winged badges, by color: Count teal, Colonel blue, Warrior purple, Elite orange, Guardian pink. Champion: large red and gold badge with big gold wings.

Rules:
- Report every hero card you can see, using names from this list: ${HEROES.map((h) => h.name).join(", ")}. The game may print "Bruce Banner" for Hulk.
- Describe the badge first, then choose the rank whose reference badge matches best. Compare colors carefully: teal versus blue, orange (Elite) versus pink (Guardian) versus purple (Warrior).
- Only give a level when a level number is actually printed. Never guess numbers.
- Answer only by calling report_heroes once with every hero.`;

const heroSchema = z.object({
  name: z.string().min(1),
  badge: z.string().optional().catch(undefined),
  // "59" counts as 59; anything else that isn't a whole number means the level wasn't read.
  level: z
    .preprocess((v) => (typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v), z.number().int().nullable())
    .catch(null),
  rank: z.string().nullable().catch(null),
});

export type VisionResult = { isProficiencyScreen: boolean; heroes: Detection[] };

/**
 * Some models send nested fields as JSON strings; unwrap them. A list sent as a string may
 * also carry trailing commas or be cut off mid-item, so repair those before giving up.
 */
function unwrap(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const attempts = [v, v.replace(/,\s*([\]}])/g, "$1")];
  const lastItem = v.lastIndexOf("}");
  if (v.trimStart().startsWith("[") && lastItem > 0) attempts.push(v.slice(0, lastItem + 1).replace(/,\s*([\]}])/g, "$1") + "]");
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {}
  }
  return v;
}

/** Why the reply could not be used, for the log. */
export class UnusableReply extends Error {}

export function parseToolInput(input: unknown): VisionResult {
  const obj = unwrap(input) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") throw new UnusableReply("reply is not an object");
  const list = unwrap(obj.heroes);
  if (!Array.isArray(list)) {
    throw new UnusableReply(`heroes is ${typeof list}: ${typeof list === "string" ? list.slice(-200) : ""}`);
  }
  // One card the model couldn't name must not throw away every hero it did read.
  const heroes: Detection[] = [];
  for (const item of list) {
    const h = heroSchema.safeParse(item);
    if (h.success) heroes.push({ name: h.data.name, level: h.data.level, rank: h.data.rank, badge: h.data.badge });
  }
  if (list.length && !heroes.length) throw new UnusableReply(`none of ${list.length} heroes was usable: ${JSON.stringify(list[0]).slice(0, 200)}`);
  return {
    isProficiencyScreen: obj.is_proficiency_screen === true || obj.is_proficiency_screen === "true",
    heroes,
  };
}

export type ImagePart = { mediaType: string; base64: string };

/** Read one screenshot, sent as one or more overlapping tiles. */
export async function readScreenshot(tiles: ImagePart[], model = MODEL): Promise<VisionResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new VisionError("Screenshot import is not set up on this server yet.", "not_configured");

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [TOOL],
        // Newer models reject a forced tool choice; they are told to call it.
        tool_choice: FORCE_TOOL.test(model) ? { type: "tool", name: TOOL.name } : { type: "auto" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Reference: the rank badges, labeled." },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: RANK_LEGEND_JPEG_BASE64 } },
              {
                type: "text",
                text:
                  tiles.length > 1
                    ? `Screenshot, split into ${tiles.length} overlapping tiles (left to right, top to bottom). A card may appear in two tiles; report each hero once, using the tile where its badge is fully visible.`
                    : "Screenshot:",
              },
              ...tiles.map((t) => ({ type: "image", source: { type: "base64", media_type: t.mediaType, data: t.base64 } })),
              { type: "text", text: `Report every hero card and its rank badge by calling ${TOOL.name}.` },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new VisionError("Could not reach the screenshot reader. Try again in a minute.", "unreachable");
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 500);
    console.error("vision error", res.status, text);
    if (isBudgetError(res.status, text)) {
      throw new VisionError("Screenshot imports are paused for now. You can still set levels by hand.", "budget");
    }
    if (res.status === 429 || res.status === 529) throw new VisionError("The screenshot reader is busy. Try again in a minute.", "busy");
    throw new VisionError("The screenshot reader failed. Try again.", "failed");
  }
  const body = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; name?: string; input?: unknown; text?: string }[];
  };
  const call = body.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
  try {
    if (call) return parseToolInput(call.input);
    // Fall back to a JSON object written as text.
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return parseToolInput(JSON.parse(json));
  } catch (e) {
    const parts = (body.content ?? []).filter((c) => c.type !== "thinking");
    const raw = JSON.stringify(parts);
    // The reason first, then both ends of the reply: the middle is rarely where it breaks.
    console.error("vision unreadable", model, body.stop_reason, e instanceof Error ? e.message : e, raw.slice(0, 400), "...", raw.slice(-600));
    throw new VisionError("Could not read that screenshot. Try a full-screen capture.", "unreadable");
  }
}
