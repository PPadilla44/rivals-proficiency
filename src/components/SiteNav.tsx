"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KofiLink } from "./KofiLink";
import { openBoardLink } from "@/lib/board-link-open";
import { openFeedback } from "@/lib/feedback-open";
import { openSignIn } from "@/lib/signin-open";

// `more` is dropped on phones so all three links fit beside the wordmark.
const LINKS = [
  { href: "/", label: "Board", more: "" },
  { href: "/calculator", label: "Calculator", more: "" },
  { href: "/ranks", label: "Ranks", more: "guide" },
];

type Who = { name: string | null; image: string | null };
const LS_WHO = "pb-who";

/** Tell the nav the sign-in state may have changed (the board does this when it loads as a different user). */
export const SESSION_CHANGED_EVENT = "pb:session";

/**
 * Signed-in state, read in the browser so the nav never makes a page dynamic. It is read again when the
 * board says the player changed (signing in without leaving the page, such as the test-user login does)
 * and when the tab comes back into view.
 */
function useWho(enabled: boolean): Who | null {
  const [who, setWho] = useState<Who | null>(null);
  useEffect(() => {
    if (!enabled) return;
    try {
      const hint = localStorage.getItem(LS_WHO);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
      if (hint) setWho(JSON.parse(hint));
    } catch {}
    let live = true;
    const read = () => {
      fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((sess) => {
          if (!live) return;
          const u = sess?.user;
          const next = u ? { name: u.name ?? null, image: u.image ?? null } : null;
          setWho(next);
          try {
            if (next) localStorage.setItem(LS_WHO, JSON.stringify(next));
            else localStorage.removeItem(LS_WHO);
          } catch {}
        })
        .catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    read();
    window.addEventListener(SESSION_CHANGED_EVENT, read);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, read);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
  return who;
}

/** Sign out the way Auth.js wants it: a POST with a csrf token. */
async function signOutNow() {
  try {
    localStorage.removeItem(LS_WHO);
    const { csrfToken } = await (await fetch("/api/auth/csrf", { credentials: "same-origin" })).json();
    const f = document.createElement("form");
    f.method = "POST";
    f.action = "/api/auth/signout";
    for (const [k, v] of [["csrfToken", csrfToken], ["callbackUrl", "/"]]) {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = k;
      i.value = v;
      f.appendChild(i);
    }
    document.body.appendChild(f);
    f.submit();
  } catch {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full page load on purpose
    window.location.href = "/api/auth/signout";
  }
}

function AccountMenu({ who }: { who: Who }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="acct" ref={box}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Account" onClick={() => setOpen((o) => !o)}>
        {who.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={who.image} alt="" />
        ) : (
          <span aria-hidden="true">{(who.name ?? "?").slice(0, 1).toUpperCase()}</span>
        )}
      </button>
      {open ? (
        <div className="acct-menu" role="menu">
          <p>{who.name ?? "Signed in"}</p>
          <button type="button" role="menuitem" className="btn" onClick={() => { setOpen(false); openBoardLink("menu"); }}>
            Board link
          </button>
          <button type="button" role="menuitem" className="btn" onClick={signOutNow}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Site-wide top bar: wordmark, page links, Feedback, Ko-fi, sign in or the account menu. */
export function SiteNav({ signIn = false }: { signIn?: boolean }) {
  const path = usePathname();
  const who = useWho(signIn);
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
          <button type="button" className="nav-text" onClick={() => openFeedback("header")}>
            Feedback
          </button>
          <KofiLink from="header" className="kofi" aria-label="Support on Ko-fi">
            <span aria-hidden="true">&#9829;</span>
            <span className="kofi-label">Support</span>
          </KofiLink>
          {signIn ? (
            who ? (
              <AccountMenu who={who} />
            ) : (
              <button type="button" className="btn nav-signin" onClick={openSignIn} aria-label="Sign in">
                <svg className="nav-signin-icon" aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="7" r="3.2" />
                  <path d="M3.8 16.5c.8-3 3.2-4.6 6.2-4.6s5.4 1.6 6.2 4.6" />
                </svg>
                <span className="nav-signin-label">Sign in</span>
              </button>
            )
          ) : null}
        </div>
      </div>
    </header>
  );
}
