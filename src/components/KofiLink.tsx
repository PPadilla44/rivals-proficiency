"use client";

import { KOFI_URL } from "@/lib/site";
import { track } from "@/lib/track";

export type KofiFrom = "header" | "footer" | "import";

/** A Ko-fi link that records which spot it was clicked from. The link opens in a new tab, so the page stays put. */
export function KofiLink({
  from,
  className,
  children,
  ...rest
}: { from: KofiFrom; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick" | "target" | "rel">) {
  return (
    <a {...rest} className={className} href={KOFI_URL} target="_blank" rel="noreferrer" onClick={() => track("kofi_click", { from })}>
      {children}
    </a>
  );
}
