import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Proficiency Board: every Marvel Rivals hero's proficiency level on one screen";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#121217";
const POP = "#ffce1f";
const PAPER = "#0d0f1c";

const RANKS = [
  { name: "Agent", level: "Lv 1", color: "#a5a9ba" },
  { name: "Lord", level: "Lv 20", color: "#e0a414" },
  { name: "Champion", level: "Lv 50", color: "#a764ff" },
];

export default async function Image() {
  const anton = await readFile(join(process.cwd(), "src/fonts/anton-latin-400-normal.woff"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: PAPER,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 2px, transparent 2.5px)",
          backgroundSize: "22px 22px",
          color: "#f1f2fa",
          fontFamily: "Anton",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 22, transform: "skewX(-8deg)", fontSize: 128, lineHeight: 1 }}>
            <span>PROFICIENCY</span>
            <span
              style={{
                background: POP,
                color: INK,
                padding: "8px 26px 0",
                border: `6px solid ${INK}`,
                boxShadow: `10px 10px 0 ${INK}`,
              }}
            >
              BOARD
            </span>
          </div>
          <div style={{ fontSize: 44, color: "#b9bdd3", letterSpacing: 1 }}>
            EVERY MARVEL RIVALS HERO&apos;S LEVEL ON ONE SCREEN
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {RANKS.map((r, i) => (
            <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 14,
                  background: "#181c30",
                  border: `5px solid ${r.color}`,
                  boxShadow: `8px 8px 0 #03040a`,
                  padding: "14px 26px 10px",
                  fontSize: 48,
                  transform: "rotate(-2deg)",
                }}
              >
                <span>{r.name.toUpperCase()}</span>
                <span style={{ fontSize: 32, color: r.color }}>{r.level}</span>
              </div>
              {i < RANKS.length - 1 ? (
                <svg width="44" height="36" viewBox="0 0 44 36">
                  <path d="M2 13h26V3l14 15-14 15V23H2z" fill={POP} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
                </svg>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Anton", data: anton, style: "normal", weight: 400 }],
    },
  );
}
