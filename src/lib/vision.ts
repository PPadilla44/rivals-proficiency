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

export class VisionError extends Error {}

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

const resultSchema = z.object({
  is_proficiency_screen: z.boolean(),
  heroes: z.array(
    z.object({
      name: z.string(),
      badge: z.string().optional(),
      level: z.number().int().nullable().catch(null),
      rank: z.string().nullable().catch(null),
    }),
  ),
});

export type VisionResult = { isProficiencyScreen: boolean; heroes: Detection[] };

/** Some models send nested fields as JSON strings; unwrap them. */
function unwrap(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export function parseToolInput(input: unknown): VisionResult {
  const obj = unwrap(input) as Record<string, unknown> | null;
  const r = resultSchema.parse({
    ...obj,
    heroes: unwrap(obj?.heroes),
    is_proficiency_screen: obj?.is_proficiency_screen === true || obj?.is_proficiency_screen === "true",
  });
  return {
    isProficiencyScreen: r.is_proficiency_screen,
    heroes: r.heroes.map((h) => ({ name: h.name, level: h.level, rank: h.rank, badge: h.badge })),
  };
}

export type ImagePart = { mediaType: string; base64: string };

/** Read one screenshot, sent as one or more overlapping tiles. */
export async function readScreenshot(tiles: ImagePart[], model = MODEL): Promise<VisionResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new VisionError("Screenshot import is not set up on this server yet.");

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
    throw new VisionError("Could not reach the screenshot reader. Try again in a minute.");
  }
  if (!res.ok) {
    console.error("vision error", res.status, (await res.text().catch(() => "")).slice(0, 500));
    throw new VisionError(res.status === 429 || res.status === 529 ? "The screenshot reader is busy. Try again in a minute." : "The screenshot reader failed. Try again.");
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
  } catch {
    const parts = (body.content ?? []).filter((c) => c.type !== "thinking");
    console.error("vision unreadable", model, body.stop_reason, JSON.stringify(parts).slice(0, 800));
    throw new VisionError("Could not read that screenshot. Try a full-screen capture.");
  }
}
