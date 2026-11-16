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
import Dialog from "./Dialog";
import { track } from "@/lib/track";

type Props = {
  current: Record<string, number | undefined>;
  /** No hero is set yet: show the import as the first step instead of a small bar. */
  empty?: boolean;
  /** The sample board is showing and has its own gold button, so the launcher stays plain. */
  quiet?: boolean;
  onSave: (updates: { heroId: string; level: number; approx: boolean }[]) => Promise<boolean>;
};

type Phase =
  | { kind: "closed" }
  | { kind: "pick"; errors?: string[]; wrongScreen?: boolean }
  | { kind: "reading"; done: number; total: number; thumbs: string[]; finished: boolean[] }
  | { kind: "review"; proposals: Proposal[]; unmatched: string[]; notes: string[]; wrongScreen: boolean; lists: Detection[][] };

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

/** Real rank badges, so the drawing looks like the player's own screen. */
const EX_RANKS = ["lord", "knight", "champion", "colonel", "elite", "warrior", "count", "centurion", "guardian", "agent", "captain", "lord"];

/**
 * A drawing of the in-game Heroes tab (no game art), with numbered pins that match the steps beside it.
 */
function ExampleScreen() {
  const cols = 6;
  const cards = Array.from({ length: cols * 2 }, (_, i) => ({ x: 12 + (i % cols) * 64, y: i < cols ? 50 : 136, rank: EX_RANKS[i] }));
  const pin = (n: number, cx: number, cy: number) => (
    <g aria-hidden="true">
      <circle className="ex-pin" cx={cx} cy={cy} r="8" />
      <text className="ex-pin-n" x={cx} y={cy + 3.6} textAnchor="middle">
        {n}
      </text>
    </g>
  );
  return (
    <svg
      className="guide-art"
      viewBox="0 0 400 225"
      role="img"
      aria-label="Drawing of the game: the Heroes button in the top bar, the Heroes tab under it, and a grid of hero cards each with a name and a rank badge"
    >
      <rect className="ex-bg" x="0.5" y="0.5" width="399" height="224" rx="8" />
      <rect className="ex-nav" x="0.5" y="0.5" width="399" height="26" rx="8" />
      {[
        ["HOME", 24],
        ["PLAY", 78],
        ["BATTLEPASS", 128],
        ["EVENTS", 214],
        ["HEROES", 284],
      ].map(([t, x]) => (
        <text key={t} className={t === "HEROES" ? "ex-label on" : "ex-label"} x={x as number} y="17">
          {t}
        </text>
      ))}
      <rect className="ex-pop" x="284" y="22" width="42" height="2.5" rx="1" />
      <text className="ex-label on" x="150" y="43">
        HEROES
      </text>
      <text className="ex-label" x="214" y="43">
        TEAM-UPS
      </text>
      <rect className="ex-pop" x="150" y="46" width="44" height="2" rx="1" />
      {cards.map((c, i) => (
        <g key={i}>
          <rect className="ex-card" x={c.x} y={c.y} width="56" height="78" rx="3" />
          <rect className="ex-strip" x={c.x} y={c.y + 54} width="56" height="24" rx="3" />
          <rect className="ex-name" x={c.x + 6} y={c.y + 58} width={30 + ((i * 7) % 14)} height="4" rx="2" />
          <image href={`/ranks/${c.rank}.webp`} x={c.x + 6} y={c.y + 64} width="14" height="12.6" />
        </g>
      ))}
      <rect className="ex-ring" x="9" y="47" width="382" height="170" rx="6" />
      {pin(1, 268, 13)}
      {pin(2, 134, 39)}
      {pin(3, 12, 50)}
    </svg>
  );
}

/** Wording for phones and desktops, picked by CSS so there is no swap after the page loads. */
function Words({ touch, mouse }: { touch: string; mouse: string }) {
  return (
    <>
      <span className="on-touch">{touch}</span>
      <span className="on-mouse">{mouse}</span>
    </>
  );
}

function UploadIcon() {
  return (
    <svg className="drop-icon" viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 31V9M15 17l9-9 9 9" />
      <path d="M8 29v8a3 3 0 003 3h26a3 3 0 003-3v-8" />
    </svg>
  );
}

function ImportGuide() {
  return (
    <div className="guide">
      <ExampleScreen />
      <ol className="guide-steps">
        <li>
          <span className="step-n" aria-hidden="true">1</span>
          <span>
            In game, tap <strong>Heroes</strong> in the top bar.
          </span>
        </li>
        <li>
          <span className="step-n" aria-hidden="true">2</span>
          <span>
            Tap <strong>Heroes</strong> again, in the row under it. Not a single hero&apos;s page.
          </span>
        </li>
        <li>
          <span className="step-n" aria-hidden="true">3</span>
          <span>
            <Words touch="Photograph" mouse="Screenshot" /> the grid, then scroll and do it again for each page. Up to {MAX_FILES}.
          </span>
        </li>
      </ol>
    </div>
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

export function ScreenshotImport({ current, empty, quiet, onSave }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Bumped when a reading is cancelled, so its late results are ignored.
  const runRef = useRef(0);
  // The big first-run card can be dismissed; remembered in this browser.
  const [cardHidden, setCardHidden] = useState(false);
  // Pictures already read, kept when the player adds more from the review step.
  const priorRef = useRef<Detection[][]>([]);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
      if (localStorage.getItem(LS_CARD)) setCardHidden(true);
    } catch {}
  }, []);
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const thumbsRef = useRef<string[]>([]);
  const freeThumbs = useCallback(() => {
    for (const u of thumbsRef.current) URL.revokeObjectURL(u);
    thumbsRef.current = [];
  }, []);
  useEffect(() => freeThumbs, [freeThumbs]);

  const read = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_FILES);
    if (!images.length) {
      setPhase({ kind: "pick", errors: ["Choose a screenshot image (PNG or JPG)."] });
      return;
    }
    const run = ++runRef.current;
    // Small previews of what was picked, so it is clear the upload landed. Freed when reading ends.
    const thumbs = images.map((f) => URL.createObjectURL(f));
    thumbsRef.current = thumbs;
    const finished = images.map(() => false);
    setPhase({ kind: "reading", done: 0, total: images.length, thumbs, finished: [...finished] });
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
          finished[i] = true;
          if (run === runRef.current) setPhase({ kind: "reading", done, total: images.length, thumbs, finished: [...finished] });
        }
      }),
    );
    if (run !== runRef.current) return;
    freeThumbs();
    const lists = [...priorRef.current, ...results.flatMap((r) => (r.heroes ? [r.heroes] : []))];
    const notes = results.flatMap((r) => (r.note ? [r.note] : []));
    const { byHero, unmatched } = mergeDetections(lists);
    const proposals = buildProposals(byHero, currentRef.current);
    const wrongScreen = looksLikeSingleHeroPages(lists);
    if (!proposals.length) {
      setPhase({
        kind: "pick",
        errors: notes.length ? notes : ["No hero levels were readable. Try a full-screen capture."],
        wrongScreen,
      });
      return;
    }
    track("import_read", { screenshots: images.length, heroes: proposals.length, failed: notes.length, single: wrongScreen });
    setPhase({ kind: "review", proposals, unmatched, notes, wrongScreen, lists });
  }, [freeThumbs]);

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

  const open = () => {
    track("import_open", { from: empty && !cardHidden ? "empty" : "bar" });
    setPhase({ kind: "pick" });
  };
  const launcher =
    empty && !cardHidden ? (
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
          <h2>Fill in your whole board at once</h2>
          <p>
            <Words touch="Photograph" mouse="Screenshot" /> each page of the in-game <strong>Heroes</strong> tab and every
            hero&apos;s rank fills in, no typing.
          </p>
        </div>
        <div className="shot-start-actions">
          <button className={quiet ? "btn" : "btn primary"} onClick={open}>
            <CameraIcon />
            Import from screenshots
          </button>
          <span>or tap any level below to type it in</span>
        </div>
      </section>
    ) : (
      <div className="shot-bar">
        <button className="btn" onClick={open}>
          <CameraIcon />
          Import from screenshots
        </button>
        <span>Screenshot each page of the in-game Heroes tab and every rank fills in.</span>
      </div>
    );

  if (phase.kind === "closed") return launcher;

  const close = () => {
    priorRef.current = [];
    setPhase({ kind: "closed" });
  };
  const cancelRead = () => {
    runRef.current += 1;
    freeThumbs();
    setPhase({ kind: "pick" });
  };

  if (phase.kind === "pick" || phase.kind === "reading") {
    const reading = phase.kind === "reading";
    return (
      <>
        {launcher}
        <Dialog
          title="Import from screenshots"
          width="media"
          onClose={close}
          footer={
            reading ? (
              <button type="button" className="btn" onClick={cancelRead}>
                Cancel
              </button>
            ) : (
              <>
                <button type="button" className="btn primary" onClick={() => input.current?.click()}>
                  <CameraIcon />
                  {phase.kind === "pick" && phase.errors?.length ? "Try again" : "Choose pictures"}
                </button>
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
              </>
            )
          }
        >
          <p className="muted">Reads ranks, not exact levels: each hero starts at the first level of its rank. You can set exact levels afterwards.</p>
          {/* Status and errors come first: on a phone the guide below is long enough to push them off screen. */}
          {reading ? (
            <div className="shot-reading" role="status">
              <span className="spin" aria-hidden="true" />
              <p className="shot-reading-title">
                {phase.total > 1 ? `Reading picture ${Math.min(phase.done + 1, phase.total)} of ${phase.total}` : "Reading your picture"}
              </p>
              <div className="shot-progress" aria-hidden="true">
                <span style={{ width: `${Math.max(6, (phase.done / phase.total) * 100)}%` }} />
              </div>
              <p className="muted">Usually about 10 seconds, even with several pictures.</p>
              <ul className="shot-thumbs" aria-label="Pictures being read">
                {phase.thumbs.map((u, i) => (
                  <li key={u} className={phase.finished[i] ? "done" : ""}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" />
                    {phase.finished[i] ? <span className="tick" aria-hidden="true">✓</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {phase.kind === "pick" && phase.errors?.length ? (
            <ul className="shot-errors" role="alert">
              {phase.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          {reading ? null : <ImportGuide />}
          {reading ? null : <div
            className={`drop${dragging ? " over" : ""}${reading ? "" : " clickable"}`}
            onClick={(e) => {
              // The whole box opens the file picker (the hidden input's own click bubbles here too, so skip it).
              if (!reading && e.target !== input.current) input.current?.click();
            }}
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
            {(
              <>
                <UploadIcon />
                {dragging ? (
                  <p className="drop-title">Drop to read</p>
                ) : (
                  <>
                    <p className="drop-title">Drop pictures here, or paste one</p>
                  </>
                )}
                <p className="muted">
                  <span className="on-touch">Straight on, the whole screen in the picture. </span>Pictures are read once and not stored.
                </p>
              </>
            )}
          </div>}
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
          {phase.kind === "pick" && phase.wrongScreen ? <WrongScreenHint /> : null}
        </Dialog>
      </>
    );
  }

  const { proposals, unmatched, notes, wrongScreen, lists } = phase;
  const chosen = proposals.filter((p) => p.selected && p.proposed !== (p.current ?? 1));
  const update = (heroId: string, patch: Partial<Proposal>) =>
    setPhase({ ...phase, proposals: proposals.map((p) => (p.heroId === heroId ? { ...p, ...patch } : p)) });
  const changes = proposals.filter((p) => p.status !== "same");

  return (
    <>
      {launcher}
      <Dialog
        title="Check these ranks"
        onClose={close}
        width="media"
        dirty={!saving}
        busy={saving}
        footer={
          <>
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
            <button
              className="btn"
              onClick={() => {
                priorRef.current = lists;
                setPhase({ kind: "pick" });
              }}
              disabled={saving}
            >
              Add more pictures
            </button>
          </>
        }
      >
        <p className="shot-count">
          {proposals.length} {proposals.length === 1 ? "hero" : "heroes"} read, {changes.length} changed.
        </p>
        {wrongScreen ? <WrongScreenHint /> : null}
        <p className="muted">Each hero is set to the first level of its rank (Lord becomes 20) unless your saved level is already inside it. Tap a level afterwards to set it exactly.</p>
        {notes.length ? (
          <ul className="muted shot-fails">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
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
                  <em> lower than saved, left unchecked</em>
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
      </Dialog>
    </>
  );
}
