"use client";

import { useEffect } from "react";
import { reportBrowserErrorAction } from "@/app/actions";
import { visitorId } from "@/lib/track";

/**
 * Shown when a page crashes. Errors from the server (they carry a digest) were
 * already reported there; this reports the ones that only happened in the browser.
 */
export function CrashScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    if (error.digest) return;
    void reportBrowserErrorAction(visitorId(), error.message || error.name, window.location.pathname).catch(() => {});
  }, [error]);

  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <h1 className="page-title">Something went wrong</h1>
          <p className="sub">
            This page hit an error and we&apos;ve been notified. Your levels are safe. Try again, or reload the page.
          </p>
        </div>
      </header>
      <div className="actions" style={{ display: "flex", gap: 10 }}>
        <button className="btn primary" onClick={() => retry()}>
          Try again
        </button>
        {/* A full page load on purpose: after a crash, starting fresh is safer than client navigation. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn" href="/">
          Back to the board
        </a>
      </div>
    </div>
  );
}
