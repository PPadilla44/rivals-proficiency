import { readFile } from "node:fs/promises";
import path from "node:path";
import { heroIdFromName } from "@/lib/heroes";
import { mergeDetections } from "@/lib/screenshot-import";
import { readScreenshot, type ImagePart } from "@/lib/vision";

/**
 * Preview-only accuracy check: runs the screenshot reader on the Heroes tab
 * fixtures and compares against the known ranks. Not available in production.
 */
export const maxDuration = 120;

const MODELS = new Set(["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-5-5"]);
// Fixture sets: PC screenshots (default) and phone photos of the screen.
const SETS: Record<string, string> = {
  screenshots: "tests/fixtures/heroes-tab",
  photos: "tests/fixtures/heroes-tab-photos",
};

/** Tiles per page: a manifest.json listing them, or the original page{i}-{t}.jpg layout. */
async function pageFiles(dir: string): Promise<string[][]> {
  try {
    return (JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as { pages: string[][] }).pages;
  } catch {
    return [1, 2, 3, 4].map((i) => [1, 2, 3, 4].map((t) => `page${i}-${t}.jpg`));
  }
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV !== "preview" && process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  const params = new URL(req.url).searchParams;
  const models = (params.get("models") ?? "claude-opus-5-5").split(",");
  if (!models.every((m) => MODELS.has(m))) return Response.json({ error: "unknown model" }, { status: 400 });
  const set = params.get("set") ?? "screenshots";
  if (!(set in SETS)) return Response.json({ error: "unknown set" }, { status: 400 });
  const DIR = path.join(process.cwd(), SETS[set]);

  const expected: Record<string, string[]> = JSON.parse(await readFile(path.join(DIR, "expected.json"), "utf8"));
  const want = new Map<string, string>();
  for (const [rank, names] of Object.entries(expected)) for (const n of names) want.set(heroIdFromName(n)!, rank);

  const pages = await Promise.all(
    (await pageFiles(DIR)).map((tiles) =>
      Promise.all(
        tiles.map(async (name) => ({
          mediaType: "image/jpeg",
          base64: (await readFile(path.join(DIR, name))).toString("base64"),
        })),
      ),
    ),
  );

  const results = await Promise.all(models.map((model) => evaluate(model, pages, want)));
  return Response.json(results);
}

async function evaluate(model: string, pages: ImagePart[][], want: Map<string, string>) {
  const started = Date.now();
  const read = await Promise.all(
    pages.map(async (tiles) => {
      try {
        return await readScreenshot(tiles, model);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  const lists = read.flatMap((p) => ("heroes" in p ? [p.heroes] : []));
  const { byHero, unmatched } = mergeDetections(lists);
  const wrong: { hero: string; expected: string; got: string | null; badge?: string }[] = [];
  const missing: string[] = [];
  for (const [id, rank] of want) {
    const d = byHero.get(id);
    if (!d) missing.push(id);
    else if (d.rank !== rank) wrong.push({ hero: id, expected: rank, got: d.rank, badge: d.badge });
  }
  return {
    model,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    correct: want.size - wrong.length - missing.length,
    total: want.size,
    wrong,
    missing,
    unmatched,
    errors: read.flatMap((p, i) => ("error" in p ? [`page${i + 1}: ${p.error}`] : [])),
  };
}
