"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = {
  title: string;
  /** Small mono text beside the title. */
  badge?: string;
  /** "form" is 480px wide on a desktop, "media" is 720px. Phones get a bottom sheet either way. */
  width?: "form" | "media";
  /** Called once the player really wants out (after the discard question, if there was one). */
  onClose: () => void;
  /** Unsaved work: closing asks "Discard this?" first. */
  dirty?: boolean;
  /** Something is running and can't be interrupted: X, Escape and the backdrop do nothing. */
  busy?: boolean;
  /** Pinned to the bottom of the sheet; the body scrolls above it. */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The one dialog shell: a bottom sheet on phones, a centered dialog on desktops.
 * Keeps focus inside, closes with X, Escape or the backdrop (asking first only when work
 * would be lost), locks the page behind it and puts focus back where it was.
 */
export default function Dialog({ title, badge, width = "form", onClose, dirty, busy, footer, children }: Props) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);

  // Callers pass fresh closures every render; the listeners below only ever see the latest ones.
  const latest = useRef({ onClose, dirty, busy, asking });
  useEffect(() => {
    latest.current = { onClose, dirty, busy, asking };
  });

  const requestClose = useCallback(() => {
    const s = latest.current;
    if (s.busy) return;
    if (s.asking) setAsking(false);
    else if (s.dirty) setAsking(true);
    else s.onClose();
  }, []);

  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    // Desktop: the first field of a form. Phones: the heading, so the keyboard doesn't jump up.
    const wide = window.matchMedia("(min-width: 641px)").matches;
    const first = wide ? box.current?.querySelector<HTMLElement>("[data-autofocus]") : null;
    (first ?? heading.current)?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      const at = document.activeElement;
      if (!box.current.contains(at)) {
        e.preventDefault();
        a.focus();
      } else if (e.shiftKey && (at === a || at === heading.current)) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && at === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [requestClose]);

  return (
    <div
      className="dlg-overlay"
      // mousedown, not click: a text selection that starts inside and ends outside must not close it.
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div ref={box} className={`dlg dlg-${width}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dlg-grab" aria-hidden="true" />
        <div className="dlg-head">
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {title}
            {badge ? <b>{badge}</b> : null}
          </h2>
          <button type="button" className="dlg-x" aria-label="Close" onClick={requestClose} disabled={busy}>
            ×
          </button>
        </div>
        <div className="dlg-body">{children}</div>
        {asking ? (
          <div className="dlg-foot dlg-ask" role="group" aria-label="Discard this?">
            <b>Discard this?</b>
            <button ref={keepRef} type="button" className="btn" onClick={() => setAsking(false)}>
              Keep editing
            </button>
            <button type="button" className="btn" onClick={() => latest.current.onClose()}>
              Discard
            </button>
          </div>
        ) : footer ? (
          <div className="dlg-foot">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
