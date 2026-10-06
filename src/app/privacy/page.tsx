import type { Metadata } from "next";
import { auth, authConfigured } from "@/auth";
import { DeleteAccount } from "@/components/DeleteAccount";
import Link from "next/link";
import { FEEDBACK_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Proficiency Board stores about you, why, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const session = authConfigured ? await auth() : null;

  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <h1 className="page-title">Privacy</h1>
          <p className="sub">
            Updated September 30, 2026. Short version: only what the board
            needs, never sold.
          </p>
        </div>
      </header>

      <section className="panel prose">
        <h2>What is stored</h2>
        <ul>
          <li>
            <strong>From Discord or Google when you sign in:</strong> your
            display name, email address and avatar, plus the ID that service
            uses for your account. The email is used only to identify your
            account; you will not get emails from the board.
          </li>
          <li>
            <strong>Your hero levels,</strong> and when you last changed each
            one.
          </li>
          <li>
            <strong>If you link Marvel Rivals:</strong> your in-game name and
            UID, per-hero playtime from the stats service, and your estimated
            points per hour.
          </li>
          <li>
            <strong>A session cookie</strong> that keeps you signed in. It is
            removed when you sign out.
          </li>
          <li>
            <strong>A count of the screenshots you import,</strong> with the
            time of each, to enforce the daily limit. The screenshots themselves
            are not stored (see below).
          </li>
        </ul>

        <h2>Screenshot import</h2>
        <p>
          When you import screenshots or photos of the Heroes tab, they are
          resized in your browser and sent to{" "}
          <a href="https://www.anthropic.com" target="_blank" rel="noreferrer">
            Anthropic
          </a>{" "}
          (Claude), which reads each hero&apos;s rank badge and sends the result
          back. The board keeps only the ranks you choose to save, never the
          images. Anthropic processes the images under its commercial terms,
          which do not allow using them to train its models. Avoid including
          anything else personal in the screenshots you upload.
        </p>

        <h2>Guest mode</h2>
        <p>
          Without signing in, levels are saved only in your browser&apos;s local
          storage. They never reach the server unless you sign in and choose to
          import them.
        </p>

        <h2>Analytics</h2>
        <p>
          Page visits are counted with Vercel Web Analytics, which does not use
          cookies or track you across sites. It records things like the page,
          the referring site and your country, so I can see which posts bring
          people in. Vercel Speed Insights measures how fast pages load on real
          devices, also without cookies.
        </p>
        <p>
          The board also records a few anonymous actions so I can tell whether
          it is useful: a visit, changing levels (how many, not which heroes),
          and opening, reading and saving a screenshot import. Each notes
          whether you are on a phone or a computer and which site you arrived from
          (the site name only), and is tied to a random id
          stored in your browser, not a cookie, plus your account if you are
          signed in. Deleting your account deletes these too.
        </p>

        <h2>Who sees your data</h2>
        <p>
          Nobody else. Your board is private to your account and there are no
          public profiles. Nothing is sold or shared for advertising. The data
          lives with the services that run the site:{" "}
          <a href="https://vercel.com" target="_blank" rel="noreferrer">
            Vercel
          </a>{" "}
          (hosting) and{" "}
          <a href="https://neon.tech" target="_blank" rel="noreferrer">
            Neon
          </a>{" "}
          (database), and screenshots you import go to Anthropic as described
          above. When playtime sync is available, syncing sends your Marvel
          Rivals UID to MarvelRivalsAPI.com to look up playtime.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Unlinking your Marvel Rivals account removes your synced playtime and
          keeps your levels. Deleting your account removes everything above
          right away. You can also revoke the board&apos;s access in Discord
          (User Settings, Authorized Apps) or in your Google Account (Security,
          Third-party apps and services).
        </p>
        {session?.user ? (
          <DeleteAccount />
        ) : (
          <p className="muted">
            Sign in on the board to see the delete option for your account.
          </p>
        )}

        <h2>Children</h2>
        <p>
          Proficiency Board is not meant for children under 13, and it does not
          knowingly collect their information. If you are under 13, please use
          the board as a guest and don&apos;t sign in. If you believe a child
          has signed up, contact me through the link below and I will delete the
          account.
        </p>

        <h2>Contact</h2>
        <p>
          Proficiency Board is a free fan project by Pablo Padilla, not
          affiliated with NetEase Games or Marvel. Questions and requests go to{" "}
          <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
            the project&apos;s GitHub page
          </a>
          . See also the <Link href="/terms">terms of use</Link>.
        </p>
      </section>
    </div>
  );
}
