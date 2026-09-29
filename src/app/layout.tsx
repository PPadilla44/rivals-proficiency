import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { FEEDBACK_URL, KOFI_URL } from "@/lib/site";
import { SITE_URL } from "@/lib/site-url";
import { SiteNav } from "@/components/SiteNav";
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
  "Free Marvel Rivals proficiency tracker. See every hero's rank and level on one screen, who is closest to Lord and Champion, and import your ranks from Heroes tab screenshots.";

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
            54 heroes as of Season 10 (Gorr the God Butcher). A new rank every 5 levels: Lord at 20, Champion at 50, max 70.
          </span>
          <span>
            Estimates use playtime from the unofficial{" "}
            <a href="https://marvelrivalsapi.com" target="_blank" rel="noreferrer">
              MarvelRivalsAPI.com
            </a>{" "}
            and learn your pace each time you correct a level. Hero art © Marvel and NetEase Games, used for this free fan tool. Not affiliated
            with NetEase or Marvel.
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
            . <Link href="/ranks">Proficiency ranks and points</Link> · <Link href="/privacy">Privacy</Link>
          </span>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
