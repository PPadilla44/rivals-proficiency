"use client";

import { useEffect, useId, useRef, useState } from "react";
import { sendFeedbackAction } from "@/app/actions";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_LIMITS, type FeedbackKind, type FeedbackSource } from "@/lib/feedback-shared";
import { deviceKind, visitorId } from "@/lib/track";
import Dialog from "./Dialog";

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
export default function FeedbackSheet({ onClose, initialKind, from }: { onClose: () => void; initialKind?: FeedbackKind; from?: FeedbackSource }) {
  const [kind, setKind] = useState<FeedbackKind>(initialKind ?? "idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(0);
  const formId = useId();

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const left = FEEDBACK_LIMITS.maxChars - message.length;
  const tooShort = message.trim().length < FEEDBACK_LIMITS.minChars;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending" || left < 0) return;
    if (tooShort) {
      setError("Add a few more words so I can act on it.");
      return;
    }
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

  const canSend = state !== "sending" && left >= 0;

  return (
    <Dialog
      title={state === "done" ? "Thank you" : "Send feedback"}
      onClose={onClose}
      dirty={state !== "done" && message.trim().length > 0}
      busy={state === "sending"}
      footer={
        state === "done" ? (
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button type="submit" form={formId} className="btn primary" disabled={!canSend}>
              {state === "sending" ? "Sending…" : "Send"}
            </button>
            <p className="fb-note">Goes to the person who built this. Don&apos;t include anything private.</p>
          </>
        )
      }
    >
      {state === "done" ? (
        <p className="fb-done">Got it. I read every message, and bugs get fixed fastest when they have details.</p>
      ) : (
        <form id={formId} onSubmit={submit} className="fb-form" noValidate>
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
                data-autofocus
                value={message}
                onChange={(e) => { setMessage(e.target.value); if (error) setError(null); }}
                placeholder={from === "import" ? "Which hero read wrong, and what rank should it be?" : HINT[kind]}
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
        </form>
      )}
    </Dialog>
  );
}
