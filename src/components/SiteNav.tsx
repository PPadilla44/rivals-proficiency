"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KOFI_URL } from "@/lib/site";

const LINKS = [
  { href: "/", label: "Board" },
  { href: "/ranks", label: "Ranks guide" },
];

/** Site-wide top bar: wordmark, page links, Ko-fi. */
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
            </Link>
          ))}
        </nav>
        <a className="kofi" href={KOFI_URL} target="_blank" rel="noreferrer" aria-label="Support on Ko-fi">
          <span aria-hidden="true">&#9829;</span>
          <span className="kofi-label">Support</span>
        </a>
      </div>
    </header>
  );
}
