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

/** Fire and forget; tracking must never break the page. */
export function track(name: string, props?: Record<string, string | number | boolean | null>): void {
  try {
    void trackAction(name, visitorId(), props).catch(() => {});
  } catch {}
}
