"use client";

import Link from "next/link";
import { useEffect } from "react";
import { openFeedback } from "@/lib/feedback-open";
import { track } from "@/lib/track";

/** Counts one view per page load of a public board. Anonymous, and it never says which board. */
export function BoardViewEvent({ own = false }: { own?: boolean }) {
  useEffect(() => {
    track("board_view", { own });
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** The "Track your own board" button. */
export function BoardCta() {
  return (
    <Link className="btn primary" href="/?from=board" onClick={() => track("board_cta")}>
      Track your own board
    </Link>
  );
}

/** Opens the Feedback form. The form records the page address, which is how a reported board is found. */
export function ReportBoard() {
  return (
    <button type="button" className="link-btn" onClick={() => openFeedback("link", "other")}>
      Report this board
    </button>
  );
}
