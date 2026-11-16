"use client";

import { CrashScreen } from "@/components/CrashScreen";
import { body, display, mono } from "./fonts";
import "./globals.css";

/** Replaces the root layout when the layout itself crashes, so it brings its own html and body. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <title>Something went wrong | Proficiency Board</title>
        <CrashScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
