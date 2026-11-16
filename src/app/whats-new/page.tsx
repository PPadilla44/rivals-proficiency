import type { Metadata } from "next";
import FeedbackLauncher from "@/components/FeedbackLauncher";
import { WHATS_NEW, formatWhatsNewDate } from "@/lib/whats-new";

export const metadata: Metadata = {
  title: "What's new",
  description: "Recent changes to Proficiency Board, newest first.",
  alternates: { canonical: "/whats-new" },
};

export default function WhatsNewPage() {
  // Entries are newest first, so grouping keeps the days in order too.
  const days: [string, typeof WHATS_NEW][] = [];
  for (const e of WHATS_NEW) {
    const last = days[days.length - 1];
    if (last && last[0] === e.date) last[1].push(e);
    else days.push([e.date, [e]]);
  }
  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <h1 className="page-title">What&apos;s new</h1>
          <p className="sub">Recent changes you can see, newest first.</p>
        </div>
      </header>

      <section className="panel prose">
        {days.map(([date, entries]) => (
          <div key={date} className="news-day">
            <h2>
              <time dateTime={date}>{formatWhatsNewDate(date)}</time>
            </h2>
            <ul className="news-list">
              {entries.map((e) => (
                <li key={e.title}>
                  <strong>{e.title}</strong>
                  <p>{e.text}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p>
          Got an idea for what should come next? <FeedbackLauncher />.
        </p>
      </section>
    </div>
  );
}
