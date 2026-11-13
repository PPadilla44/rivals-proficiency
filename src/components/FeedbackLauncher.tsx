"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";

// Loaded only when someone opens it, so no page carries the form's code.
const FeedbackSheet = lazy(() => import("./FeedbackSheet"));

/**
 * The "Send feedback" button in the footer. The form also opens from a link ending in
 * #feedback, so it can be shared in Discord or a post: rivalsproficiency.com/#feedback
 */
export default function FeedbackLauncher() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      if (window.location.hash === "#feedback") setOpen(true);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      if (window.location.hash === "#feedback") history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {}
  }, []);

  return (
    <>
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        Send feedback
      </button>
      {open ? (
        <Suspense fallback={null}>
          <FeedbackSheet onClose={close} />
        </Suspense>
      ) : null}
    </>
  );
}
