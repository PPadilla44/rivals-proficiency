import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DATA_SEASON, FEEDBACK_URL } from "@/lib/site";
import { KofiLink } from "@/components/KofiLink";
import FeedbackLauncher from "@/components/FeedbackLauncher";
import FeedbackHost from "@/components/FeedbackHost";
import { SITE_URL } from "@/lib/site-url";
import { SiteNav } from "@/components/SiteNav";
import { EngagementTracker } from "@/components/EngagementTracker";
import { HEROES } from "@/lib/heroes";
import { DOM_GUARD_SCRIPT } from "@/lib/dom-guard";
import { SAVED_BOARD_SCRIPT } from "@/lib/saved-board-flag";
import "./globals.css";

// Self-hosted (SIL Open Font License) so builds never depend on Google Fonts.
const display = localFont({
  variable: "--font-display",
  src: [
    { path: "../fonts/saira-semi-condensed-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/saira-semi-condensed-latin-700-normal.woff2", weight: "700" },
  ],
});
const body = localFont({
  variable: "--font-body",
  src: [
    { path: "../fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600" },
  ],
});
const mono = localFont({
  variable: "--font-mono",
  src: [
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
});

// Under ~155 characters so Google shows all of it.
const description =
  "Free Marvel Rivals proficiency tracker. See every hero's level and rank, track progress to Lord and Champion, and import ranks from screenshots.";

const homeTitle = "Marvel Rivals Proficiency Tracker";

export const metadata: Metadata = {
  // Absolute URLs for link previews and canonicals.
  metadataBase: new URL(SITE_URL),
  title: { default: `${homeTitle} | Proficiency Board`, template: "%s | Proficiency Board" },
  description,
  applicationName: "Proficiency Board",
  openGraph: { title: homeTitle, description, siteName: "Proficiency Board", type: "website", url: "/" },
  twitter: { card: "summary_large_image", title: homeTitle, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DOM_GUARD_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SAVED_BOARD_SCRIPT }} />
      </head>
      <body>
        <SiteNav />
        {children}
        <footer className="foot wrap">
          <div className="foot-grid">
            <div className="foot-about">
              <Link href="/" className="brand" aria-label="Proficiency Board home">
                <span>Proficiency</span>
                <span className="brand-b">Board</span>
              </Link>
              <p>
                Free, fan-made Marvel Rivals tracker. {HEROES.length} heroes as of {DATA_SEASON}. A new rank every 5 levels: Lord at
                20, Champion at 50, max 70.
              </p>
              <KofiLink from="footer" className="btn primary foot-kofi">
                <span aria-hidden="true">&#9829;</span> Buy me a coffee on Ko-fi
              </KofiLink>
            </div>
            <nav aria-label="Tools" className="foot-col">
              <p className="foot-h">Tools</p>
              <ul>
                <li>
                  <Link href="/">Board</Link>
                </li>
                <li>
                  <Link href="/calculator">Calculator</Link>
                </li>
                <li>
                  <Link href="/ranks">Ranks</Link>
                </li>
                <li>
                  <Link href="/whats-new">What&apos;s new</Link>
                </li>
              </ul>
            </nav>
            <nav aria-label="About" className="foot-col">
              <p className="foot-h">About</p>
              <ul>
                <li>
                  <FeedbackLauncher />
                </li>
                <li>
                  <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </li>
                <li>
                  <Link href="/privacy">Privacy</Link>
                </li>
                <li>
                  <Link href="/terms">Terms</Link>
                </li>
              </ul>
            </nav>
          </div>
          <p className="foot-credit">
            {/* Only mention playtime estimates when sync can actually run. */}
            {process.env.MARVEL_RIVALS_API_KEY ? (
              <>
                Playtime estimates use the unofficial{" "}
                <a href="https://marvelrivalsapi.com" target="_blank" rel="noreferrer">
                  MarvelRivalsAPI.com
                </a>{" "}
                and learn your pace each time you correct a level.{" "}
              </>
            ) : null}
            Hero art © Marvel and NetEase Games, used for this free fan tool. Not affiliated with NetEase or Marvel.
          </p>
        </footer>
        <FeedbackHost />
        <EngagementTracker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
