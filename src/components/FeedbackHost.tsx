"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { FEEDBACK_KINDS, FEEDBACK_OPEN_EVENT, FEEDBACK_SOURCES, type FeedbackKind, type FeedbackSource } from "@/lib/feedback-shared";
import { track } from "@/lib/track";

// Loaded only when someone opens it, so no page carries the form's code.
const FeedbackSheet = lazy(() => import("./FeedbackSheet"));

type Request = { from: FeedbackSource; kind?: FeedbackKind; n: number };

/**
 * The one place the feedback form lives. Buttons call openFeedback(); a link ending in
 * #feedback (rivalsproficiency.com/#feedback) opens it too, so it can be shared in Discord or a post.
 */
export default function FeedbackHost() {
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    let n = 0;
    const show = (from: FeedbackSource, kind?: FeedbackKind) => {
      track("feedback_open", { from });
      setReq({ from, kind, n: ++n });
    };
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      const from = (FEEDBACK_SOURCES as readonly string[]).includes(d.from) ? (d.from as FeedbackSource) : "footer";
      const kind = (FEEDBACK_KINDS as readonly string[]).includes(d.kind) ? (d.kind as FeedbackKind) : undefined;
      show(from, kind);
    };
    const onHash = () => {
      if (window.location.hash === "#feedback") show("link");
    };
    onHash();
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const close = useCallback(() => {
    setReq(null);
    try {
      if (window.location.hash === "#feedback") history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {}
  }, []);

  if (!req) return null;
  return (
    <Suspense fallback={null}>
      <FeedbackSheet key={req.n} initialKind={req.kind} onClose={close} />
    </Suspense>
  );
}
