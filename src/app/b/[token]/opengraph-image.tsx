import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { getDb } from "@/db";
import { boardOg, type BoardOg } from "@/lib/board-og";
import { tierStyle } from "@/lib/share-card";
import { getPublicBoard } from "@/server/public-board";

export const alt = "A Marvel Rivals proficiency board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0b0d12";
const PANEL = "#12151c";
const LINE = "#262c3a";
const INK = "#e8eaf0";
const MUTED = "#9aa1b2";
const GOLD = "#f2b531";
const PURPLE = "#b794ff";
const GREY = "#8d94a6";

const dir = join(process.cwd(), "src/og");
const png = async (file: string) => `data:image/png;base64,${(await readFile(join(dir, file))).toString("base64")}`;
const color = (tier: number) => (tierStyle(tier) === "champ" ? PURPLE : tierStyle(tier) === "lord" ? GOLD : GREY);

/** Same picture for an unknown or switched-off link: nothing about any player. */
const GENERIC: BoardOg = { title: "Marvel Rivals board", summary: "Hero levels and ranks, read-only", heroes: [] };

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  let og = GENERIC;
  try {
    const board = await getPublicBoard(getDb(), token);
    if (board) og = boardOg(board.boardName, board.levels, board.approx);
  } catch {
    // No database or a slow one: the generic picture is better than a broken preview.
  }

  const [saira, plex, plexBold, ...imgs] = await Promise.all([
    readFile(join(dir, "saira-semi-condensed-latin-700-normal.woff")),
    readFile(join(dir, "ibm-plex-sans-latin-400-normal.woff")),
    readFile(join(dir, "ibm-plex-sans-latin-600-normal.woff")),
    ...og.heroes.flatMap((h) => [png(`heroes/${h.id}.png`), png(`ranks/${h.rank.toLowerCase()}.png`)]),
  ]);
  const titleSize = og.title.length > 22 ? 56 : 72;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, color: INK, fontFamily: "Plex", padding: "56px 60px", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 470 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ display: "flex", gap: 10, fontFamily: "Saira", fontSize: 30, letterSpacing: 2 }}>
              <span>PROFICIENCY</span>
              <span style={{ color: GOLD }}>BOARD</span>
            </div>
            <div style={{ display: "flex", fontFamily: "Saira", fontSize: titleSize, lineHeight: 1.02, wordBreak: "break-word" }}>{og.title}</div>
            <div style={{ display: "flex", fontSize: 28, color: MUTED, lineHeight: 1.35 }}>{og.summary}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: MUTED }}>
            <span style={{ color: GOLD, fontWeight: 600 }}>rivalsproficiency.com</span>
            <span>· free, fan-made</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden" }}>
          {og.heroes.length === 0 ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", fontSize: 28, color: MUTED }}>Every hero&apos;s rank and level</div>
          ) : (
            og.heroes.map((h, i) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 24px", borderBottom: i < og.heroes.length - 1 ? `1px solid ${LINE}` : "none", flex: 1 }}>
                <img alt="" src={imgs[i * 2]} width={84} height={70} style={{ borderRadius: 10, border: `3px solid ${color(h.tier)}`, objectFit: "cover" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                  <span style={{ fontSize: 28, fontWeight: 600 }}>{h.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 21, color: color(h.tier) }}>
                    <img alt="" src={imgs[i * 2 + 1]} width={30} height={27} style={{ borderRadius: 5 }} />
                    <span>{h.rank}</span>
                  </div>
                </div>
                <span style={{ fontFamily: "Saira", fontSize: 44 }}>{h.level}{h.approx ? "+" : ""}</span>
              </div>
            ))
          )}
        </div>
      </div>
    ),
    {
      ...size,
      headers: { "cache-control": "public, max-age=300, s-maxage=300" },
      fonts: [
        { name: "Saira", data: saira, style: "normal", weight: 700 },
        { name: "Plex", data: plex, style: "normal", weight: 400 },
        { name: "Plex", data: plexBold, style: "normal", weight: 600 },
      ],
    },
  );
}
