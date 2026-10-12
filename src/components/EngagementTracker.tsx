"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "@/lib/track";

/** Seconds a page has to stay open and visible before it counts as read. */
export const READ_SECONDS = 20;
/** Share of the page scrolled past that counts as read. */
export const READ_SCROLL = 0.25;

/**
 * Records once per page view that someone actually read the page: it stayed
 * open and in view for 20 seconds, or they scrolled a quarter of the way down.
 * Visitors who leave before either are the ones who bounced. Invisible.
 */
export function EngagementTracker() {
  const path = usePathname();

  useEffect(() => {
    if (path.startsWith("/stats")) return;
    let done = false;
    let visibleMs = 0;
    let since = document.visibilityState === "visible" ? Date.now() : 0;

    const fire = (why: "time" | "scroll") => {
      if (done) return;
      done = true;
      track("engaged", { page: path.slice(0, 40), why });
      cleanup();
    };

    const tick = () => {
      const now = Date.now();
      if (since) visibleMs += now - since;
      since = document.visibilityState === "visible" ? now : 0;
      if (visibleMs >= READ_SECONDS * 1000) fire("time");
    };
    const onVisibility = () => tick();
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max >= READ_SCROLL) fire("scroll");
    };

    const timer = window.setInterval(tick, 2_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, { passive: true });
    function cleanup() {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
    }
    return cleanup;
  }, [path]);

  return null;
}
