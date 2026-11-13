"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KOFI_URL } from "@/lib/site";
import { openFeedback } from "@/lib/feedback-open";

// `more` is dropped on phones so all three links fit beside the wordmark.
const LINKS = [
  { href: "/", label: "Board", more: "" },
  { href: "/calculator", label: "Calculator", more: "" },
  { href: "/ranks", label: "Ranks", more: "guide" },
];

/** Site-wide top bar: wordmark, page links, Feedback, Ko-fi. */
export function SiteNav() {
  const path = usePathname();
  return (
    <header className="site-nav">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="Proficiency Board home">
          <span>Proficiency</span>
          <span className="brand-b">Board</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
              {l.label}
              {l.more ? <span className="nav-more">{l.more}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <button type="button" className="fb-btn" onClick={() => openFeedback("header")} aria-label="Send feedback">
            <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
              <path d="M3.5 4.5h13a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H9l-3.5 3v-3h-2a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
            </svg>
            <span className="fb-btn-label">Feedback</span>
          </button>
          <a className="kofi" href={KOFI_URL} target="_blank" rel="noreferrer" aria-label="Support on Ko-fi">
          <span aria-hidden="true">&#9829;</span>
          <span className="kofi-label">Support</span>
          </a>
        </div>
      </div>
    </header>
  );
}
