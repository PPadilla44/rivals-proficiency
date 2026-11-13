"use client";

import { useEffect, useId, useRef, useState } from "react";
import { sendFeedbackAction } from "@/app/actions";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_LIMITS, type FeedbackKind } from "@/lib/feedback-shared";
import { deviceKind, visitorId } from "@/lib/track";

const HINT: Record<FeedbackKind, string> = {
  bug: "What happened, and what did you expect? Which page or hero?",
  idea: "What would make the board better for you?",
  other: "Anything at all.",
};

/**
 * A short form: pick Bug, Idea or Other, write a few lines, optionally leave an email.
 * Works for guests and signed-in players. A hidden field and the time the form was open
 * tell the server a script filled it in.
 */
export default function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(0);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  // A dialog: Escape closes it, the page behind doesn't scroll, focus comes back afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    messageRef.current?.focus();
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

  const left = FEEDBACK_LIMITS.maxChars - message.length;
  const tooShort = message.trim().length < FEEDBACK_LIMITS.minChars;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending" || tooShort || left < 0) return;
    setState("sending");
    setError(null);
    try {
      const res = await sendFeedbackAction(
        { kind, message, email, device: deviceKind(), page: window.location.pathname.slice(0, 100) },
        visitorId(),
        { website: trap, openedMs: Date.now() - openedAt.current },
      );
      if (res.ok) setState("done");
      else {
        setError(res.error);
        setState("idle");
      }
    } catch {
      setError("That didn't send. Check your connection and try again.");
      setState("idle");
    }
  }

  return (
    <div className="fb-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fb-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="fb-head">
          <h2 id={titleId}>{state === "done" ? "Thank you" : "Send feedback"}</h2>
          <button type="button" className="fb-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {state === "done" ? (
          <div className="fb-done">
            <p>Got it. I read every message, and bugs get fixed fastest when they have details.</p>
            <button type="button" className="btn primary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="fb-form" noValidate>
            <div className="fb-kinds" role="radiogroup" aria-label="What kind of feedback">
              {FEEDBACK_KINDS.map((k) => (
                <label key={k} className={kind === k ? "on" : ""}>
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                  {FEEDBACK_KIND_LABEL[k]}
                </label>
              ))}
            </div>

            <label className="fb-field">
              <span>Your message</span>
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={HINT[kind]}
                rows={5}
                maxLength={FEEDBACK_LIMITS.maxChars + 200}
                required
              />
              <small className={left < 0 ? "bad" : ""}>{left < 100 ? `${left} characters left` : ""}</small>
            </label>

            <label className="fb-field">
              <span>
                Email <em>(optional, only if you want a reply)</em>
              </span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" maxLength={120} />
            </label>

            {/* Real people never see or fill this. */}
            <div className="fb-trap" aria-hidden="true">
              <label>
                Website
                <input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </label>
            </div>

            {error ? (
              <p className="fb-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="fb-actions">
              <button type="submit" className="btn primary" disabled={state === "sending" || tooShort || left < 0}>
                {state === "sending" ? "Sending…" : "Send"}
              </button>
              <p className="fb-note">Goes to the person who built this. Don&apos;t include anything private.</p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
