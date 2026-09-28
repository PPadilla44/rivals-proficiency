import type { Metadata } from "next";
import Link from "next/link";
import { auth, authConfigured } from "@/auth";
import { DeleteAccount } from "@/components/DeleteAccount";
import { FEEDBACK_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy · Proficiency Board",
  description: "What Proficiency Board stores about you, why, and how to delete it.",
};

export default async function PrivacyPage() {
  const session = authConfigured ? await auth() : null;

  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <Link href="/" className="logo small" aria-label="Back to the board">
            <span className="logo-a">Proficiency</span>
            <span className="logo-b">Board</span>
          </Link>
          <h1 className="page-title">Privacy</h1>
          <p className="sub">Updated September 28, 2026. Short version: only what the board needs, never sold.</p>
        </div>
      </header>

      <section className="panel prose">
        <h2>What is stored</h2>
        <ul>
          <li>
            <strong>From Discord when you sign in:</strong> your display name, email address and avatar, plus the ID Discord
            uses for your account. The email is used only to identify your account; you will not get emails from the board.
          </li>
          <li>
            <strong>Your hero levels,</strong> and when you last changed each one.
          </li>
          <li>
            <strong>If you link Marvel Rivals:</strong> your in-game name and UID, per-hero playtime from the stats service,
            and your estimated points per hour.
          </li>
          <li>
            <strong>A session cookie</strong> that keeps you signed in. It is removed when you sign out.
          </li>
        </ul>

        <h2>Guest mode</h2>
        <p>
          Without signing in, levels are saved only in your browser&apos;s local storage. They never reach the server unless
          you sign in and choose to import them.
        </p>

        <h2>Analytics</h2>
        <p>
          Page visits are counted with Vercel Web Analytics, which does not use cookies or track you across sites. It records
          things like the page, the referring site and your country, so I can see which posts bring people in.
        </p>

        <h2>Who sees your data</h2>
        <p>
          Nobody else. Your board is private to your account and there are no public profiles. Nothing is sold or shared for
          advertising. The data lives with the services that run the site:{" "}
          <a href="https://vercel.com" target="_blank" rel="noreferrer">
            Vercel
          </a>{" "}
          (hosting) and{" "}
          <a href="https://neon.tech" target="_blank" rel="noreferrer">
            Neon
          </a>{" "}
          (database). Syncing sends your Marvel Rivals UID to{" "}
          <a href="https://marvelrivalsapi.com" target="_blank" rel="noreferrer">
            MarvelRivalsAPI.com
          </a>{" "}
          to look up playtime.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Unlinking your Marvel Rivals account removes your synced playtime and keeps your levels. Deleting your account
          removes everything above right away. You can also revoke the board&apos;s access in Discord under User Settings,
          Authorized Apps.
        </p>
        {session?.user ? (
          <DeleteAccount />
        ) : (
          <p className="muted">Sign in on the board to see the delete option for your account.</p>
        )}

        <h2>Contact</h2>
        <p>
          Proficiency Board is a free fan project by Pablo Padilla, not affiliated with NetEase Games or Marvel. Questions and requests go
          to{" "}
          <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            the project&apos;s GitHub page
          </a>
          .
        </p>
      </section>
    </div>
  );
}
