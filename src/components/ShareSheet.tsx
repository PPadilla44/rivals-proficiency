"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { HeroRow } from "@/lib/board-model";
import { LORD, tierOf } from "@/lib/proficiency";
import {
  PICK_MAX,
  PICK_MIN,
  SHARE_FILE_NAME,
  cardData,
  defaultPicks,
  lordCount,
  pickLocked,
  shareCandidates,
  togglePick,
} from "@/lib/share-card";
import { renderCard } from "@/lib/share-draw";
import { deviceKind, track } from "@/lib/track";
import { RankBadge } from "./bits";

type Props = {
  rows: HeroRow[];
  /** What opened the sheet: the button, or the toast after a hero reached Lord or Champion. */
  from: "button" | "nudge";
  onClose: () => void;
};

type Ready = { blob: Blob; url: string; file: File; key: string };

/**
 * Pick 3 to 5 heroes, see the card, then share, save or copy it. Loaded only when opened,
 * so the board itself carries none of this code.
 *
 * The picture is made as soon as the picks change, not when Share is pressed: Safari only
 * opens the share sheet straight after a tap, and drawing first would lose that tap.
 */
export default function ShareSheet({ rows, from, onClose }: Props) {
  const titleId = useId();
  const candidates = useMemo(() => shareCandidates(rows), [rows]);
  const [picks, setPicks] = useState<string[]>(() => defaultPicks(rows));
  const [showAll, setShowAll] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const phone = useMemo(() => deviceKind() === "mobile", []);
  const closeRef = useRef<HTMLButtonElement>(null);
  const key = [...picks].sort().join(",");

  useEffect(() => {
    track("share", { action: "open", from, lord: lordCount(rows) });
    // Opened once per sheet; the rows can't change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the card whenever the picks change. Only the latest drawing is kept.
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const blob = await renderCard(cardData(rows, picks));
        if (!live) return;
        const url = URL.createObjectURL(blob);
        const file = new File([blob], SHARE_FILE_NAME, { type: "image/png" });
        setFailed(false);
        setReady((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { blob, url, file, key };
        });
      } catch (e) {
        console.error("share card failed", e);
        if (live) setFailed(true);
      }
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [rows, picks, key]);

  // Free the last picture when the sheet closes.
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    lastUrl.current = ready?.url ?? null;
  }, [ready]);
  useEffect(() => () => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
  }, []);

  // A dialog: Escape closes it, the page behind doesn't scroll, focus comes back afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  const current = ready && ready.key === key ? ready : null;
  const canShareFile = useMemo(() => {
    if (!current || typeof navigator === "undefined" || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [current.file] });
    } catch {
      return false;
    }
  }, [current]);
  const canCopy = typeof window !== "undefined" && "ClipboardItem" in window && !!navigator.clipboard?.write;
  const done = (how: "share" | "save" | "copy") => track("share", { action: "done", how, heroes: picks.length });

  const share = async () => {
    if (!current) return;
    try {
      await navigator.share({ files: [current.file], title: "My Marvel Rivals proficiency", text: "rivalsproficiency.com" });
      done("share");
    } catch (e) {
      // Closing the share sheet is not a failure; anything else falls back to saving.
      if ((e as Error)?.name === "AbortError") return;
      save();
    }
  };
  const save = () => {
    if (!current) return;
    const a = document.createElement("a");
    a.href = current.url;
    a.download = SHARE_FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    done("save");
    if (phone) setNote("If nothing was saved, press and hold the picture and choose Save.");
  };
  const copy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": current.blob })]);
      done("copy");
      setNote("Copied. Paste it into Discord, Reddit or a message.");
    } catch {
      setNote("This browser wouldn't copy the picture. Save it instead.");
    }
  };

  const shown = showAll ? candidates : candidates.filter((r) => r.effective >= LORD || picks.includes(r.id));
  const hidden = candidates.length - shown.length;
  const primary =
    phone && canShareFile ? { label: "Share", run: share } : { label: "Save image", run: save };
  const secondary =
    phone && canShareFile
      ? { label: "Save image", run: save }
      : !phone && canCopy
        ? { label: "Copy image", run: copy }
        : null;

  return (
    <div className="share-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="share-head">
          <h2 id={titleId}>Share my board</h2>
          <button ref={closeRef} type="button" className="share-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="share-body">
          <div className="share-preview">
            {current ? (
              // A real image, so press-and-hold saves it even where buttons can't.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.url} alt={`Share card: ${cardData(rows, picks).heroes.map((h) => `${h.name} level ${h.level}`).join(", ")}`} />
            ) : ready ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ready.url} alt="" className="stale" />
            ) : (
              <div className="share-wait">{failed ? "The picture couldn't be made in this browser." : "Making your card…"}</div>
            )}
          </div>

          <div className="share-pick">
            <p className="share-hint">
              Pick {PICK_MIN} to {PICK_MAX} heroes · <b>{picks.length}</b> picked
            </p>
            <ul className="share-list">
              {shown.map((r) => {
                const on = picks.includes(r.id);
                const locked = pickLocked(picks, r.id);
                return (
                  <li key={r.id}>
                    <label className={`${on ? "on" : ""}${locked ? " locked" : ""}`}>
                      <input type="checkbox" checked={on} disabled={locked} onChange={() => setPicks((p) => togglePick(p, r.id))} />
                      <RankBadge tier={tierOf(r.effective)} size={22} />
                      <span className="nm">{r.name}</span>
                      <span className="lv">Lv {r.effective}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {hidden > 0 ? (
              <button type="button" className="btn small share-more" onClick={() => setShowAll(true)}>
                Show all heroes ({hidden} more)
              </button>
            ) : null}
          </div>
        </div>

        <div className="share-actions">
          <button type="button" className="btn primary" disabled={!current} onClick={primary.run}>
            {primary.label}
          </button>
          {secondary ? (
            <button type="button" className="btn" disabled={!current} onClick={secondary.run}>
              {secondary.label}
            </button>
          ) : null}
          <p className="share-note" role="status">
            {note ?? (phone ? "Or press and hold the picture to save it." : "Saved as a PNG, 1080 by 1080.")}
          </p>
        </div>
      </div>
    </div>
  );
}
