import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DATA_SEASON, FEEDBACK_URL, KOFI_URL } from "@/lib/site";
import { SITE_URL } from "@/lib/site-url";
import { SiteNav } from "@/components/SiteNav";
import { HEROES } from "@/lib/heroes";
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

const description =
  "Free Marvel Rivals proficiency tracker. See every hero's level and rank on one screen, who is closest to Lord and Champion, how long each takes to level up, and import ranks from screenshots.";

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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <SiteNav />
        {children}
        <footer className="foot wrap">
          <span>
            {HEROES.length} heroes as of {DATA_SEASON}. A new rank every 5 levels: Lord at 20, Champion at 50, max 70.
          </span>
          <span>
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
          </span>
          <span>
            Free and fan-made. If it saves you some clicking,{" "}
            <a href={KOFI_URL} target="_blank" rel="noreferrer">
              buy me a coffee on Ko-fi
            </a>
            .{" "}
            <a href={FEEDBACK_URL} target="_blank" rel="noreferrer">
              Report a bug or suggest an idea
            </a>
            . <Link href="/calculator">Proficiency calculator</Link> · <Link href="/ranks">Proficiency ranks and points</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
