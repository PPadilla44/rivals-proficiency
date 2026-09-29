import { readFile } from "node:fs/promises";
import path from "node:path";
import { heroIdFromName } from "@/lib/heroes";
import { mergeDetections } from "@/lib/screenshot-import";
import { readScreenshot } from "@/lib/vision";

/**
 * Preview-only accuracy check: runs the screenshot reader on the Heroes tab
 * fixtures and compares against the known ranks. Not available in production.
 */
export const maxDuration = 120;

const MODELS = new Set(["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5-5"]);
const DIR = path.join(process.cwd(), "tests/fixtures/heroes-tab");

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  const model = new URL(req.url).searchParams.get("model") ?? "claude-haiku-4-5-20251001";
  if (!MODELS.has(model)) return Response.json({ error: "unknown model" }, { status: 400 });

  const expected: Record<string, string[]> = JSON.parse(await readFile(path.join(DIR, "expected.json"), "utf8"));
  const want = new Map<string, string>();
  for (const [rank, names] of Object.entries(expected)) for (const n of names) want.set(heroIdFromName(n)!, rank);

  const started = Date.now();
  const pages = await Promise.all(
    [1, 2, 3, 4].map(async (i) => {
      const tiles = await Promise.all(
        [1, 2, 3, 4].map(async (t) => ({
          mediaType: "image/jpeg",
          base64: (await readFile(path.join(DIR, `page${i}-${t}.jpg`))).toString("base64"),
        })),
      );
      try {
        return await readScreenshot(tiles, model);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  const lists = pages.flatMap((p) => ("heroes" in p ? [p.heroes] : []));
  const { byHero, unmatched } = mergeDetections(lists);

  const wrong: { hero: string; expected: string; got: string | null; badge?: string }[] = [];
  const missing: string[] = [];
  for (const [id, rank] of want) {
    const d = byHero.get(id);
    if (!d) missing.push(id);
    else if (d.rank !== rank) wrong.push({ hero: id, expected: rank, got: d.rank });
  }
  // Include the model's badge descriptions for the misses.
  for (const w of wrong) {
    const raw = lists.flat().find((h) => heroIdFromName(h.name) === w.hero) as { badge?: string } | undefined;
    if (raw?.badge) w.badge = raw.badge;
  }

  return Response.json({
    model,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    correct: want.size - wrong.length - missing.length,
    total: want.size,
    wrong,
    missing,
    unmatched,
    errors: pages.flatMap((p, i) => ("error" in p ? [`page${i + 1}: ${p.error}`] : [])),
  });
}
