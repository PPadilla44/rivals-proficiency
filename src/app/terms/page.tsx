import type { Metadata } from "next";
import Link from "next/link";
import { FEEDBACK_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using Proficiency Board, a free fan-made Marvel Rivals proficiency tracker.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <h1 className="page-title">Terms of use</h1>
          <p className="sub">Updated September 30, 2026. Short version: it&apos;s a free fan tool, use it fairly, and double-check anything that matters.</p>
        </div>
      </header>

      <section className="panel prose">
        <h2>The board</h2>
        <p>
          Proficiency Board is a free, fan-made tool by Pablo Padilla for tracking Marvel Rivals hero proficiency. By using
          it you agree to these terms. If you don&apos;t agree, please don&apos;t use the site.
        </p>

        <h2>Accuracy</h2>
        <p>
          Ranks read from screenshots, playtime estimates, point totals and hours are best efforts and can be wrong. The
          game is the source of truth. Always review a screenshot import before saving it, and check the in-game hero page
          for exact levels.
        </p>

        <h2>Fair use</h2>
        <ul>
          <li>Use the board for your own Marvel Rivals progress.</li>
          <li>
            Don&apos;t try to break, overload or get around the site&apos;s limits, including automating screenshot imports.
          </li>
          <li>Only upload screenshots or photos of the game, not other people&apos;s personal information.</li>
        </ul>
        <p>Accounts that abuse the site may be limited or removed.</p>

        <h2>Your account</h2>
        <p>
          You sign in with Discord or Google, and you can delete your account and all of its data at any time from the{" "}
          <Link href="/privacy">privacy page</Link>, which also explains what is stored. You must be at least 13 to sign in.
        </p>

        <h2>Not affiliated with Marvel or NetEase</h2>
        <p>
          Marvel Rivals, its heroes, artwork and rank badges belong to Marvel and NetEase Games. Proficiency Board is not
          affiliated with or endorsed by them. Hero art is shown only to identify heroes in this free tool. If you hold rights
          to any of it and want it removed, contact me and I will take it down.
        </p>

        <h2>No warranty</h2>
        <p>
          The board is provided as is, without warranties of any kind. It may change, go down, or shut down at any time, and
          to the fullest extent the law allows, I&apos;m not liable for any loss from using it, including lost or incorrect
          levels.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may be updated, and the date at the top will change when they are. Continuing to use the board after
          an update means you accept the new terms.
        </p>

        <h2>Contact</h2>
        <p>
          Questions, removal requests and bug reports go to{" "}
          <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            the project&apos;s GitHub page
          </a>
          .
        </p>
      </section>
    </div>
  );
}
