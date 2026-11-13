"use client";

import { openFeedback } from "@/lib/feedback-open";

/** The "Send feedback" link in the footer. The form itself lives in FeedbackHost. */
export default function FeedbackLauncher() {
  return (
    <button type="button" className="link-btn" onClick={() => openFeedback("footer")}>
      Send feedback
    </button>
  );
}
