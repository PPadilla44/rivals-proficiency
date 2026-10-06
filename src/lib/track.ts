"use client";

import { trackAction } from "@/app/actions";

const KEY = "pb-visitor";
let memoryId: string | null = null;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A random id kept in this browser so repeat visits can be counted. No cookies, nothing personal. */
export function visitorId(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = newId();
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return (memoryId ??= newId());
  }
}

/** Phone or tablet versus computer, from the browser's own description of itself. */
export function deviceKind(): "mobile" | "desktop" {
  try {
    const ua = navigator.userAgent;
    // iPads report themselves as Macs; a Mac with a touch screen is an iPad.
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "mobile";
  } catch {}
  return "desktop";
}

/** The site this visitor arrived from ("google.com"), or "direct". Only the site name, never the full address. */
export function referrerSite(): string {
  try {
    if (!document.referrer) return "direct";
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return !host || host === location.hostname.replace(/^www\./, "") ? "direct" : host.slice(0, 40);
  } catch {
    return "direct";
  }
}

/** Fire and forget; tracking must never break the page. */
export function track(name: string, props?: Record<string, string | number | boolean | null>): void {
  try {
    void trackAction(name, visitorId(), { ...props, device: deviceKind() }).catch(() => {});
  } catch {}
}
