"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanScreenshotAction } from "@/app/actions";
import {
  buildProposals,
  describeDetection,
  mergeDetections,
  tileRects,
  type Detection,
  type Proposal,
} from "@/lib/screenshot-import";
import { clampLevel } from "@/lib/proficiency";
import { CameraIcon } from "./bits";
import { track } from "@/lib/track";

type Props = {
  current: Record<string, number | undefined>;
  onSave: (updates: { heroId: string; level: number }[]) => Promise<boolean>;
};

type Phase =
  | { kind: "closed" }
  | { kind: "pick"; error?: string }
  | { kind: "reading"; done: number; total: number }
  | { kind: "review"; proposals: Proposal[]; unmatched: string[]; notes: string[] };

const MAX_FILES = 6;
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

export function ScreenshotImport({ current, onSave }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
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
    if (!proposals.length) {
      setPhase({ kind: "pick", error: notes.join(" ") || "No hero levels were readable. Try a full-screen capture." });
      return;
    }
    track("import_read", { screenshots: images.length, heroes: proposals.length, failed: notes.length });
    setPhase({ kind: "review", proposals, unmatched, notes });
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
    return (
      <div className="shot-bar">
        <button
          className="btn primary"
          onClick={() => {
            track("import_open");
            setPhase({ kind: "pick" });
          }}
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
              <p>
                Drop screenshots here, paste one, or{" "}
                <button type="button" className="linkish" onClick={() => input.current?.click()}>
                  choose files
                </button>
                .
              </p>
              <p className="muted">
                Use full-screen captures of the Heroes tab (Heroes, then Heroes again at the top). Scroll and add one per page, up to{" "}
                {MAX_FILES}. The tab shows ranks, not exact levels, so a level you already set inside that rank is kept.
                Screenshots are read once and not stored.
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
      </section>
    );
  }

  const { proposals, unmatched, notes } = phase;
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
                  update(p.heroId, { proposed: v, selected: v !== (p.current ?? 1) });
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
            const ok = await onSave(chosen.map((p) => ({ heroId: p.heroId, level: p.proposed })));
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
