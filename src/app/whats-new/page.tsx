import type { Metadata } from "next";
import FeedbackLauncher from "@/components/FeedbackLauncher";
import { WHATS_NEW, formatWhatsNewDate } from "@/lib/whats-new";

export const metadata: Metadata = {
  title: "What's new",
  description: "Recent changes to Proficiency Board, newest first.",
  alternates: { canonical: "/whats-new" },
};

export default function WhatsNewPage() {
  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <h1 className="page-title">What&apos;s new</h1>
          <p className="sub">Recent changes you can see, newest first.</p>
        </div>
      </header>

      <section className="panel prose">
        <ul className="news-list">
          {WHATS_NEW.map((e) => (
            <li key={`${e.date}-${e.title}`}>
              <time dateTime={e.date} className="news-date">
                {formatWhatsNewDate(e.date)}
              </time>
              <strong>{e.title}</strong>
              <p>{e.text}</p>
            </li>
          ))}
        </ul>
        <p>
          Got an idea for what should come next? <FeedbackLauncher />.
        </p>
      </section>
    </div>
  );
}
