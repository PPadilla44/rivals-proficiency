import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Proficiency Board: a Marvel Rivals proficiency tracker showing every hero's rank and level";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0b0d12";
const PANEL = "#12151c";
const LINE = "#262c3a";
const INK = "#e8eaf0";
const MUTED = "#9aa1b2";
const GOLD = "#f2b531";
const PURPLE = "#b794ff";

const ROWS = [
  { hero: "hela", name: "Hela", role: "Duelist", rank: "champion", rankName: "Champion", level: 55, color: PURPLE, bar: 25, note: "15 to max" },
  { hero: "luna-snow", name: "Luna Snow", role: "Strategist", rank: "guardian", rankName: "Guardian", level: 47, color: GOLD, bar: 90, note: "3 to Champion" },
  { hero: "doctor-strange", name: "Doctor Strange", role: "Vanguard", rank: "elite", rankName: "Elite", level: 40, color: GOLD, bar: 67, note: "10 to Champion" },
  { hero: "magneto", name: "Magneto", role: "Vanguard", rank: "warrior", rankName: "Warrior", level: 35, color: GOLD, bar: 50, note: "15 to Champion" },
];

const dir = join(process.cwd(), "src/og");
const dataUri = async (file: string) => `data:image/png;base64,${(await readFile(join(dir, file))).toString("base64")}`;

export default async function Image() {
  const [saira, plex, plexBold, ...imgs] = await Promise.all([
    readFile(join(dir, "saira-semi-condensed-latin-700-normal.woff")),
    readFile(join(dir, "ibm-plex-sans-latin-400-normal.woff")),
    readFile(join(dir, "ibm-plex-sans-latin-600-normal.woff")),
    ...ROWS.flatMap((r) => [dataUri(`${r.hero}.png`), dataUri(`${r.rank}.png`)]),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, color: INK, fontFamily: "Plex", padding: "56px 60px", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 470 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ display: "flex", gap: 10, fontFamily: "Saira", fontSize: 30, letterSpacing: 2 }}>
              <span>PROFICIENCY</span>
              <span style={{ color: GOLD }}>BOARD</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Saira", fontSize: 64, lineHeight: 1.02 }}>
              <span>Marvel Rivals</span>
              <span>Proficiency Tracker</span>
            </div>
            <div style={{ fontSize: 26, color: MUTED, lineHeight: 1.35 }}>
              Every hero&apos;s rank and level on one board. Fill it in from Heroes tab screenshots.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: MUTED }}>
            <span style={{ color: GOLD, fontWeight: 600 }}>rivalsproficiency.com</span>
            <span>· free, fan-made</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden" }}>
          {ROWS.map((r, i) => (
            <div
              key={r.hero}
              style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 24px", borderBottom: i < ROWS.length - 1 ? `1px solid ${LINE}` : "none", flex: 1 }}
            >
              <img
                alt=""
                src={imgs[i * 2]}
                width={84}
                height={70}
                style={{ borderRadius: 10, border: `3px solid ${r.color}`, objectFit: "cover" }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                <span style={{ fontSize: 28, fontWeight: 600 }}>{r.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 21, color: r.color }}>
                  <img alt="" src={imgs[i * 2 + 1]} width={30} height={27} style={{ borderRadius: 5 }} />
                  <span>{r.rankName}</span>
                </div>
                <div style={{ display: "flex", marginTop: 8, height: 8, borderRadius: 4, background: "#242a36", width: 230 }}>
                  <div style={{ display: "flex", width: `${r.bar}%`, height: 8, borderRadius: 4, background: r.color }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={{ fontFamily: "Saira", fontSize: 44 }}>{r.level}</span>
                <span style={{ fontSize: 19, color: MUTED }}>{r.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Saira", data: saira, style: "normal", weight: 700 },
        { name: "Plex", data: plex, style: "normal", weight: 400 },
        { name: "Plex", data: plexBold, style: "normal", weight: 600 },
      ],
    },
  );
}
