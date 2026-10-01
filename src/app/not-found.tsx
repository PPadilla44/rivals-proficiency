import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <h1 className="page-title">Page not found</h1>
          <p className="sub">That page doesn&apos;t exist, or it isn&apos;t available to your account.</p>
        </div>
      </header>
      <div className="actions" style={{ display: "flex", gap: 10 }}>
        <Link href="/" className="btn primary">
          Open the board
        </Link>
        <Link href="/ranks" className="btn">
          Ranks guide
        </Link>
      </div>
    </div>
  );
}
