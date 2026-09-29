import { z } from "zod";
import { HEROES } from "./heroes";
import { RANKS } from "./proficiency";
import { RANK_LEGEND_JPEG_BASE64 } from "./rank-legend";
import type { Detection } from "./screenshot-import";

/** Reads hero proficiency off a Marvel Rivals screenshot with Claude's vision model. */

export const visionConfigured = !!process.env.ANTHROPIC_API_KEY;

const MODEL = process.env.SCREENSHOT_MODEL ?? "claude-haiku-4-5-20251001";

export class VisionError extends Error {}

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

The first image is a labeled reference of the ${RANKS.length} proficiency rank badges, lowest to highest: ${RANKS.join(", ")}. The second image is the player's screenshot.

On the Heroes tab each hero card shows the hero name, and directly under the name a small rank badge. Ignore the yellow bookmark icon next to some badges (it marks favorites) and the role icon at the right of the name.

How to tell badges apart:
- Agent: bronze or brown chevron shield. Knight: the same shield in silver or gray.
- Captain: small pale blue star, no wings. Centurion: teal crystal cross, no wings. Lord: gold star, no wings.
- Winged badges, by color: Count teal, Colonel blue, Warrior purple, Elite pink, Guardian orange. Champion: large red and gold badge with big gold wings.

Rules:
- Report every hero card you can see, using names from this list: ${HEROES.map((h) => h.name).join(", ")}. The game may print "Bruce Banner" for Hulk.
- Describe the badge first, then choose the rank whose reference badge matches best. Compare colors carefully: teal versus blue, pink versus purple versus orange.
- Only give a level when a level number is actually printed. Never guess numbers.`;

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

export function parseToolInput(input: unknown): VisionResult {
  const r = resultSchema.parse(input);
  return {
    isProficiencyScreen: r.is_proficiency_screen,
    heroes: r.heroes.map((h) => ({ name: h.name, level: h.level, rank: h.rank })),
  };
}

export async function readScreenshot(image: { mediaType: string; base64: string }): Promise<VisionResult> {
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
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Reference: the rank badges, labeled." },
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: RANK_LEGEND_JPEG_BASE64 } },
              { type: "text", text: "Screenshot: report every hero card and its rank badge." },
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
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
  const body = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[] };
  const call = body.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name);
  if (!call) throw new VisionError("Could not read that screenshot. Try a full-screen capture.");
  try {
    return parseToolInput(call.input);
  } catch {
    throw new VisionError("Could not read that screenshot. Try a full-screen capture.");
  }
}
