import { FEEDBACK_OPEN_EVENT, type FeedbackKind, type FeedbackSource } from "./feedback-shared";

/** Open the feedback form from any button. `kind` preselects Bug, Idea or Other. */
export function openFeedback(from: FeedbackSource, kind?: FeedbackKind): void {
  try {
    window.dispatchEvent(new CustomEvent(FEEDBACK_OPEN_EVENT, { detail: { from, kind } }));
  } catch {}
}
