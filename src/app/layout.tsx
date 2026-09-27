import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (SIL Open Font License) so builds never depend on Google Fonts.
const display = localFont({
  variable: "--font-display",
  src: [
    { path: "../fonts/chakra-petch-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/chakra-petch-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/chakra-petch-latin-700-normal.woff2", weight: "700" },
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

export const metadata: Metadata = {
  title: "Proficiency Board",
  description:
    "Every Marvel Rivals hero's proficiency level on one screen. See who is closest to Lord and Champion, and estimate progress from your playtime.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
