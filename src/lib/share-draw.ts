"use client";

import { CARD_SIZE, levelText, rowBoxes, tierStyle, type CardData } from "./share-card";

/**
 * Draws the share card on a canvas, in the browser. Only images from this site are used
 * (portraits and rank badges in /public): an image from another site would lock the canvas
 * and the picture could not be saved. A hero without a portrait gets its initials.
 */

const C = {
  bg: "#0b0d12",
  panel: "#12151c",
  line: "#1f2430",
  line2: "#2c3242",
  ink: "#e8eaf0",
  ink2: "#b4bac8",
  ink3: "#8d94a6",
  gold: "#f2b531",
  purple: "#a98bff",
  purpleLine: "#6b4cc4",
};

type Fonts = { display: string; body: string };

/** The site's own fonts, by the names next/font gave them. */
function siteFonts(): Fonts {
  const read = (v: string) => {
    for (const el of [document.body, document.documentElement]) {
      const f = el && getComputedStyle(el).getPropertyValue(v).trim();
      if (f) return f;
    }
    return "";
  };
  return {
    display: read("--font-display") || "system-ui, sans-serif",
    body: read("--font-body") || "system-ui, sans-serif",
  };
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

const portraitSrc = (id: string) => `/heroes/${id}.webp`;
const badgeSrc = (rank: string) => `/ranks/${rank.toLowerCase()}.webp`;

/** Waits for the fonts and every picture on the card, so the first draw is the real one. */
async function prepare(data: CardData): Promise<{ fonts: Fonts; img: Map<string, HTMLImageElement | null> }> {
  const fonts = siteFonts();
  const loads: Promise<unknown>[] = [];
  if (document.fonts?.load) {
    for (const f of [`700 40px ${fonts.display}`, `600 24px ${fonts.body}`, `500 18px ${fonts.body}`]) {
      loads.push(document.fonts.load(f).catch(() => null));
    }
  }
  const srcs = [...new Set(data.heroes.flatMap((h) => [portraitSrc(h.id), badgeSrc(h.rank)]))];
  const img = new Map<string, HTMLImageElement | null>();
  loads.push(...srcs.map(async (s) => img.set(s, await loadImage(s))));
  await Promise.all(loads);
  return { fonts, img };
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shortens text with an ellipsis until it fits. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function initials(name: string): string {
  const words = name.replace(/^The /, "").split(/[\s&-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/** Draws an image to fill a square like CSS object-fit: cover. */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number) {
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, x, y, size, size);
}

export function drawCard(ctx: CanvasRenderingContext2D, data: CardData, fonts: Fonts, img: Map<string, HTMLImageElement | null>) {
  const S = CARD_SIZE;
  const X = 72;
  const W = S - X * 2;
  const display = (size: number) => `700 ${size}px ${fonts.display}`;
  const body = (weight: number, size: number) => `${weight} ${size}px ${fonts.body}`;

  // Background with a gold glow top right and a purple one bottom left.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, S, S);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  };
  glow(S * 0.85, -60, 720, "rgba(242,181,49,0.15)");
  glow(0, S + 60, 620, "rgba(124,77,255,0.13)");

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Header: logo, title, the board's counts.
  ctx.font = display(30);
  ctx.fillStyle = C.ink;
  ctx.fillText("PROFICIENCY", X, 88);
  ctx.fillStyle = C.gold;
  ctx.fillText("BOARD", X + ctx.measureText("PROFICIENCY ").width, 88);

  ctx.font = display(62);
  ctx.fillStyle = C.ink;
  ctx.fillText("My Marvel Rivals proficiency", X, 172);

  const chips: { n: number; label: string; color: string }[] = [
    { n: data.lordPlus, label: "Lord or higher", color: C.gold },
    ...(data.champions ? [{ n: data.champions, label: data.champions === 1 ? "Champion" : "Champions", color: C.purple }] : []),
    { n: data.tracked, label: "heroes tracked", color: C.gold },
  ];
  let cx = X;
  for (const chip of chips) {
    const num = String(chip.n);
    ctx.font = display(30);
    const nw = ctx.measureText(num).width;
    ctx.font = body(600, 24);
    const lw = ctx.measureText(chip.label).width;
    const w = 20 + nw + 8 + lw + 20;
    rounded(ctx, cx, 202, w, 56, 28);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = C.line2;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = display(30);
    ctx.fillStyle = chip.color;
    ctx.fillText(num, cx + 20, 241);
    ctx.font = body(600, 24);
    ctx.fillStyle = C.ink2;
    ctx.fillText(chip.label, cx + 20 + nw + 8, 239);
    cx += w + 12;
  }

  // Hero rows.
  const boxes = rowBoxes(data.heroes.length);
  data.heroes.forEach((h, i) => {
    const b = boxes[i];
    const style = tierStyle(h.tier);
    const accent = style === "champ" ? C.purple : style === "lord" ? C.gold : C.ink2;

    rounded(ctx, X, b.y, W, b.h, 20);
    if (style === "champ") {
      const g = ctx.createLinearGradient(X, 0, X + W, 0);
      g.addColorStop(0, "rgba(124,77,255,0.2)");
      g.addColorStop(0.6, C.panel);
      ctx.fillStyle = g;
    } else ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = style === "champ" ? C.purpleLine : style === "lord" ? "rgba(242,181,49,0.28)" : C.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Portrait, with a gold or purple frame from Lord up.
    const p = b.portrait;
    const px = X + 14;
    const py = b.y + (b.h - p) / 2;
    ctx.save();
    if (style === "champ") {
      ctx.shadowColor = "rgba(124,77,255,0.6)";
      ctx.shadowBlur = 24;
    }
    rounded(ctx, px, py, p, p, 16);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.restore();
    ctx.save();
    rounded(ctx, px, py, p, p, 16);
    ctx.clip();
    const pic = img.get(portraitSrc(h.id));
    if (pic) cover(ctx, pic, px, py, p);
    else {
      ctx.fillStyle = "#1b2030";
      ctx.fillRect(px, py, p, p);
      ctx.font = display(Math.round(p * 0.4));
      ctx.fillStyle = C.ink3;
      ctx.textAlign = "center";
      ctx.fillText(initials(h.name), px + p / 2, py + p * 0.64);
      ctx.textAlign = "left";
    }
    ctx.restore();
    rounded(ctx, px, py, p, p, 16);
    ctx.strokeStyle = style === "champ" ? C.purple : style === "lord" ? C.gold : C.line2;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Level on the right, rank badge and name to its left.
    const right = X + W - 28;
    const mid = b.y + b.h / 2;
    ctx.textAlign = "right";
    ctx.font = display(b.level);
    ctx.fillStyle = C.ink;
    const lv = levelText(h);
    ctx.fillText(lv, right, mid + b.level * 0.24);
    const lvWidth = Math.max(ctx.measureText(lv).width, 80);
    ctx.font = body(500, 16);
    ctx.fillStyle = C.ink3;
    ctx.fillText("LEVEL", right, mid + b.level * 0.24 + 26);
    ctx.textAlign = "left";

    // Room for the badge plus the longest rank name ("Champion") at this row's size.
    const rankFont = Math.round(24 + (b.badge - 52) * 0.5);
    ctx.font = body(600, rankFont);
    const rankW = b.badge + 14 + Math.ceil(ctx.measureText("Champion").width) + 4;
    const rankX = right - lvWidth - 40 - rankW;
    const badge = img.get(badgeSrc(h.rank));
    if (badge) {
      ctx.save();
      rounded(ctx, rankX, mid - b.badge / 2, b.badge, b.badge, 10);
      ctx.clip();
      ctx.drawImage(badge, rankX, mid - b.badge / 2, b.badge, b.badge);
      ctx.restore();
    }
    ctx.font = body(600, rankFont);
    ctx.fillStyle = accent;
    ctx.fillText(h.rank, rankX + b.badge + 14, mid + rankFont * 0.36);

    ctx.font = display(b.name);
    ctx.fillStyle = C.ink;
    const nameX = px + p + 28;
    ctx.fillText(fit(ctx, h.name, rankX - nameX - 20), nameX, mid + b.name * 0.34);
  });

  // Footer: where to get one, the fan-made line, the season stamp.
  ctx.font = display(36);
  ctx.fillStyle = C.ink;
  const lead = "Track yours free at ";
  ctx.fillText(lead, X, 1000);
  ctx.fillStyle = C.gold;
  ctx.fillText("rivalsproficiency.com", X + ctx.measureText(lead).width, 1000);
  ctx.font = body(500, 18);
  ctx.fillStyle = C.ink3;
  ctx.fillText("Fan-made. Not affiliated with NetEase Games or Marvel.", X, 1036);
  ctx.textAlign = "right";
  ctx.fillText(data.stamp, X + W, 1036);
  ctx.textAlign = "left";
}

/** Draws the card and returns it as a PNG. */
export async function renderCard(data: CardData): Promise<Blob> {
  const { fonts, img } = await prepare(data);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  drawCard(ctx, data, fonts, img);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}
