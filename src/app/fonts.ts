import localFont from "next/font/local";

// Self-hosted (SIL Open Font License) so builds never depend on Google Fonts.
export const display = localFont({
  variable: "--font-display",
  src: [
    { path: "../fonts/saira-semi-condensed-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/saira-semi-condensed-latin-700-normal.woff2", weight: "700" },
  ],
});
export const body = localFont({
  variable: "--font-body",
  src: [
    { path: "../fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600" },
  ],
});
export const mono = localFont({
  variable: "--font-mono",
  src: [
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
  ],
});
