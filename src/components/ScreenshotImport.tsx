"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanScreenshotAction } from "@/app/actions";
import {
  buildProposals,
  describeDetection,
  looksLikeSingleHeroPages,
  mergeDetections,
  tileRects,
  type Detection,
  type Proposal,
} from "@/lib/screenshot-import";
import { clampLevel } from "@/lib/proficiency";
import { CameraIcon } from "./bits";
import { deviceKind, track } from "@/lib/track";

type Props = {
  current: Record<string, number | undefined>;
  /** No hero is set yet: show the import as the first step instead of a small bar. */
  empty?: boolean;
  onSave: (updates: { heroId: string; level: number; approx: boolean }[]) => Promise<boolean>;
};

type Phase =
  | { kind: "closed" }
  | { kind: "pick"; error?: string; wrongScreen?: boolean }
  | { kind: "reading"; done: number; total: number }
  | { kind: "review"; proposals: Proposal[]; unmatched: string[]; notes: string[]; wrongScreen: boolean };

const MAX_FILES = 6;
export const LS_CARD = "pb-import-card-hidden";
const LONG_EDGE = 1568; // the vision model scales larger images down to this anyway
const MAX_BYTES = 900_000;

async function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const q of [0.9, 0.82, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("too large");
}

/**
 * Cut a screenshot into overlapping tiles at full resolution (rank badges
 * are small) and encode each as a JPEG small enough to upload.
 */
async function prepare(file: File): Promise<Blob[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const out: Blob[] = [];
    for (const r of tileRects(bitmap.width, bitmap.height, LONG_EDGE)) {
      const scale = Math.min(1, LONG_EDGE / Math.max(r.w, r.h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(r.w * scale);
      canvas.height = Math.round(r.h * scale);
      canvas.getContext("2d")!.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
      out.push(await toJpeg(canvas));
    }
    return out;
  } finally {
    bitmap.close();
  }
}

/** A simple drawing of the in-game Heroes tab, so players capture the right screen. */
function ExampleScreen() {
  const cols = 8;
  const cards = Array.from({ length: cols * 2 }, (_, i) => ({ x: 14 + (i % cols) * 27, y: i < cols ? 34 : 82 }));
  return (
    <figure className="shot-example">
      <svg viewBox="0 0 240 135" role="img" aria-label="Drawing of the Heroes tab: two rows of hero cards, each with a name and a rank badge">
        <rect className="ex-bg" x="0.5" y="0.5" width="239" height="134" rx="5" />
        <rect className="ex-nav" x="0.5" y="0.5" width="239" height="14" rx="5" />
        {[20, 62, 104, 188].map((x) => (
          <rect key={x} className="ex-dim" x={x} y="5" width="30" height="4" rx="2" />
        ))}
        <rect className="ex-pop" x="146" y="5" width="30" height="4" rx="2" />
        <rect className="ex-pop" x="96" y="20" width="26" height="6" rx="1.5" />
        <rect className="ex-dim" x="124" y="20" width="26" height="6" rx="1.5" />
        {cards.map((c, i) => (
          <g key={i}>
            <rect className="ex-card" x={c.x} y={c.y} width="23" height="40" rx="1.5" />
            <rect className="ex-strip" x={c.x} y={c.y + 29} width="23" height="11" rx="1.5" />
            <rect className="ex-name" x={c.x + 2} y={c.y + 31} width="14" height="2.4" rx="1" />
            <circle className="ex-pop" cx={c.x + 4} cy={c.y + 37} r="1.8" />
          </g>
        ))}
      </svg>
      <figcaption>
        The right screen looks like this: every hero in a grid, about 15 per picture. The small badge under each name is the
        rank.
      </figcaption>
    </figure>
  );
}

/** Shown when each picture gave one or two heroes: probably single hero pages. */
function WrongScreenHint() {
  return (
    <p className="shot-note" role="note">
      <strong>Only one hero per picture?</strong> That looks like a single hero&apos;s page. Open <strong>Heroes</strong>, then
      the <strong>Heroes</strong> tab at the top. It shows every hero in a grid, so three or four pictures cover them all.
    </p>
  );
}

export function ScreenshotImport({ current, empty, onSave }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The big first-run card can be dismissed; remembered in this browser.
  const [cardHidden, setCardHidden] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
      if (localStorage.getItem(LS_CARD)) setCardHidden(true);
    } catch {}
    // Phones get photo wording: the game runs on a TV or monitor, not on the phone.
    setMobile(deviceKind() === "mobile");
  }, []);
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const read = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_FILES);
    if (!images.length) {
      setPhase({ kind: "pick", error: "Choose a screenshot image (PNG or JPG)." });
      return;
    }
    setPhase({ kind: "reading", done: 0, total: images.length });
    let done = 0;
    // Read all screenshots at once; each takes around ten seconds.
    const results = await Promise.all(
      images.map(async (image, i): Promise<{ heroes?: Detection[]; note?: string }> => {
        const label = images.length > 1 ? `Screenshot ${i + 1}: ` : "";
        try {
          const form = new FormData();
          for (const [n, tile] of (await prepare(image)).entries()) form.append("image", tile, `tile-${n}.jpg`);
          const res = await scanScreenshotAction(form);
          if (!res.ok) return { note: label + res.error };
          if (!res.heroes.length)
            return {
              note: label + (res.isProficiencyScreen ? "No hero ranks were readable." : "This does not look like the Heroes tab."),
            };
          return { heroes: res.heroes };
        } catch {
          return { note: label + "Could not open that image." };
        } finally {
          done += 1;
          setPhase({ kind: "reading", done, total: images.length });
        }
      }),
    );
    const lists = results.flatMap((r) => (r.heroes ? [r.heroes] : []));
    const notes = results.flatMap((r) => (r.note ? [r.note] : []));
    const { byHero, unmatched } = mergeDetections(lists);
    const proposals = buildProposals(byHero, currentRef.current);
    const wrongScreen = looksLikeSingleHeroPages(lists);
    if (!proposals.length) {
      setPhase({
        kind: "pick",
        error: notes.join(" ") || "No hero levels were readable. Try a full-screen capture.",
        wrongScreen,
      });
      return;
    }
    track("import_read", { screenshots: images.length, heroes: proposals.length, failed: notes.length, single: wrongScreen });
    setPhase({ kind: "review", proposals, unmatched, notes, wrongScreen });
  }, []);

  // Paste a screenshot straight from the clipboard while the panel is open.
  useEffect(() => {
    if (phase.kind !== "pick") return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        void read(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [phase.kind, read]);

  if (phase.kind === "closed") {
    const open = () => {
      track("import_open", { from: empty && !cardHidden ? "empty" : "bar" });
      setPhase({ kind: "pick" });
    };
    if (empty && !cardHidden) {
      return (
        <section className="panel shot-start" aria-label="Fill in your board">
          <button
            type="button"
            className="shot-start-x"
            aria-label="Hide this"
            title="Hide this"
            onClick={() => {
              setCardHidden(true);
              try {
                localStorage.setItem(LS_CARD, "1");
              } catch {}
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div>
            <h2>Fill in your whole board from screenshots</h2>
            <p>
              In game, open <strong>Heroes</strong>, then the <strong>Heroes</strong> tab at the top.{" "}
              {mobile
                ? "Take a photo of your TV or monitor, one per page."
                : "Add a screenshot of each page, or a photo of your screen."}{" "}
              Every hero&apos;s rank fills in at once, no typing.
            </p>
          </div>
          <div className="shot-start-actions">
            <button className="btn primary" onClick={open}>
              <CameraIcon />
              {mobile ? "Take or choose photos" : "Import from screenshots"}
            </button>
            <span>or tap any level below to type it in</span>
            {mobile ? <span>Not at your game right now? Your board is saved to your account, so come back any time.</span> : null}
          </div>
        </section>
      );
    }
    return (
      <div className="shot-bar">
        <button
          className="btn primary"
          onClick={open}
        >
          <CameraIcon />
          Import from screenshots
        </button>
        <span>Screenshot each page of the in-game Heroes tab and every rank fills in.</span>
      </div>
    );
  }

  const close = () => setPhase({ kind: "closed" });

  if (phase.kind === "pick" || phase.kind === "reading") {
    const reading = phase.kind === "reading";
    return (
      <section className="panel shot" aria-label="Import from screenshots">
        <h2>
          Import from screenshots
          <button className="btn small" onClick={close} disabled={reading}>
            Close
          </button>
        </h2>
        <div
          className={`drop${dragging ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!reading) void read([...e.dataTransfer.files]);
          }}
        >
          {reading ? (
            <p className="drop-status" role="status">
              Reading {phase.total > 1 ? `${phase.total} screenshots (${phase.done} done)` : "your screenshot"}
              <span className="dots" aria-hidden="true" />
            </p>
          ) : (
            <>
              {mobile ? (
                <p>
                  <button type="button" className="btn primary" onClick={() => input.current?.click()}>
                    <CameraIcon />
                    Take or choose photos
                  </button>
                </p>
              ) : (
                <p>
                  Drop screenshots here, paste one, or{" "}
                  <button type="button" className="linkish" onClick={() => input.current?.click()}>
                    choose files
                  </button>
                  .
                </p>
              )}
              <ExampleScreen />
              <p className="muted">
                {mobile
                  ? "Photograph the whole screen, straight on, with the Heroes tab open (Heroes, then Heroes again at the top)."
                  : "Use full-screen captures of the Heroes tab (Heroes, then Heroes again at the top)."}{" "}
                Scroll and add one per page, up to {MAX_FILES}. The tab shows ranks, not exact levels, so a level you already set
                inside that rank is kept. Pictures are read once and not stored.
              </p>
            </>
          )}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) void read(files);
            }}
          />
        </div>
        {phase.kind === "pick" && phase.error ? (
          <p className="danger-error" role="alert">
            {phase.error}
          </p>
        ) : null}
        {phase.kind === "pick" && phase.wrongScreen ? <WrongScreenHint /> : null}
      </section>
    );
  }

  const { proposals, unmatched, notes, wrongScreen } = phase;
  const chosen = proposals.filter((p) => p.selected && p.proposed !== (p.current ?? 1));
  const update = (heroId: string, patch: Partial<Proposal>) =>
    setPhase({ ...phase, proposals: proposals.map((p) => (p.heroId === heroId ? { ...p, ...patch } : p)) });
  const changes = proposals.filter((p) => p.status !== "same");

  return (
    <section className="panel shot" aria-label="Review screenshot levels">
      <h2>
        Check these ranks
        <b>
          {proposals.length} read, {changes.length} different
        </b>
      </h2>
      {wrongScreen ? <WrongScreenHint /> : null}
      <p className="shot-note" role="note">
        <strong>Ranks, not exact levels.</strong> The Heroes tab only shows each hero&apos;s rank badge, so a hero is set to the
        first level of its rank (Lord becomes 20) unless your saved level is already inside that rank. Afterwards, tap a
        level to set it exactly; the in-game hero page shows the real number.
      </p>
      {notes.length ? <p className="muted">{notes.join(" ")}</p> : null}
      <div className="shot-list" role="list">
        {proposals.map((p) => (
          <label key={p.heroId} className={`shot-row ${p.status}`} role="listitem">
            <input
              type="checkbox"
              checked={p.selected}
              disabled={p.proposed === (p.current ?? 1)}
              onChange={(e) => update(p.heroId, { selected: e.target.checked })}
            />
            <span className="nm">{p.name}</span>
            <span className="seen">{describeDetection(p)}</span>
            <span className="now">
              {p.current == null ? "not set" : `now ${p.current}`}
              {p.status === "lower" ? (
                <em title="Lower than your saved level. Left unchecked in case the screenshot was misread."> lower?</em>
              ) : null}
            </span>
            <span className="to">
              <input
                type="number"
                min={1}
                max={70}
                inputMode="numeric"
                aria-label={`New level for ${p.name}`}
                value={p.proposed}
                onChange={(e) => {
                  const v = clampLevel(Number(e.target.value));
                  update(p.heroId, { proposed: v, selected: v !== (p.current ?? 1), edited: true });
                }}
              />
            </span>
          </label>
        ))}
      </div>
      {unmatched.length ? <p className="muted">Skipped names it did not recognize: {unmatched.join(", ")}.</p> : null}
      <div className="actions">
        <button
          className="btn primary"
          disabled={saving || !chosen.length}
          onClick={async () => {
            setSaving(true);
            // A rank read without a number is only a floor, unless the player typed the level in review.
            const ok = await onSave(
              chosen.map((p) => ({ heroId: p.heroId, level: p.proposed, approx: p.detectedLevel == null && !p.edited })),
            );
            if (ok) track("import_save", { heroes: chosen.length });
            setSaving(false);
            if (ok) close();
          }}
        >
          {saving ? "Saving" : chosen.length ? `Save ${chosen.length} level${chosen.length === 1 ? "" : "s"}` : "Nothing to change"}
        </button>
        <button className="btn" onClick={() => setPhase({ kind: "pick" })} disabled={saving}>
          Try other screenshots
        </button>
        <button className="btn" onClick={close} disabled={saving}>
          Cancel
        </button>
      </div>
    </section>
  );
}
