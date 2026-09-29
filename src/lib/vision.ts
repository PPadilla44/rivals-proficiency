import { z } from "zod";
import { HEROES } from "./heroes";
import { RANKS } from "./proficiency";
import type { Detection } from "./screenshot-import";

/** Reads hero proficiency off a Marvel Rivals screenshot with Claude's vision model. */

export const visionConfigured = !!process.env.ANTHROPIC_API_KEY;

const MODEL = process.env.SCREENSHOT_MODEL ?? "claude-haiku-4-5-20251001";

export class VisionError extends Error {}

const TOOL = {
  name: "report_heroes",
  description: "Report every hero whose proficiency is visible in the screenshot.",
  input_schema: {
    type: "object",
    properties: {
      is_proficiency_screen: {
        type: "boolean",
        description: "True if this is a Marvel Rivals screen that shows hero proficiency for one or more heroes.",
      },
      heroes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Hero name exactly as it appears, or your best identification from the portrait." },
            level: { type: ["integer", "null"], description: "Proficiency level number if shown (1 to 70), else null." },
            rank: { type: ["string", "null"], enum: [...RANKS, null], description: "Proficiency rank if shown, else null." },
          },
          required: ["name", "level", "rank"],
        },
      },
    },
    required: ["is_proficiency_screen", "heroes"],
  },
} as const;

const SYSTEM = `You read screenshots from the game Marvel Rivals and report hero proficiency.

Proficiency ranks, lowest to highest, with a new rank every 5 levels: ${RANKS.map((r, i) => `${r} (${i === 0 ? 1 : i * 5}${i === RANKS.length - 1 ? " to 70" : ` to ${i * 5 + 4}`})`).join(", ")}.

Known heroes: ${HEROES.map((h) => h.name).join(", ")}.

Rules:
- Report only heroes whose proficiency level or rank you can actually see. Skip heroes with no proficiency shown.
- Prefer the exact level number when one is visible. Give the rank only when you can read its name or are confident from the badge.
- Do not guess numbers. If a digit is unreadable, leave level null.
- Use the hero names from the known list.`;

const resultSchema = z.object({
  is_proficiency_screen: z.boolean(),
  heroes: z.array(
    z.object({
      name: z.string(),
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
              { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
              { type: "text", text: "Report the proficiency of every hero visible in this screenshot." },
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
