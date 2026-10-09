import type { Metadata } from "next";
import Link from "next/link";
import { auth, authConfigured } from "@/auth";
import { getDb } from "@/db";
import { getBoard } from "@/server/board";
import { Calculator } from "@/components/Calculator";
import { hoursText } from "@/lib/calculator";
import { SITE_URL } from "@/lib/site-url";
import { DATA_CHECKED, DATA_CHECKED_TEXT, DATA_SEASON } from "@/lib/site";
import { CHAMPION, DEFAULT_POINTS_PER_HOUR, LORD, MAX_LEVEL, pointsBetween } from "@/lib/proficiency";

const fmt = (n: number) => n.toLocaleString("en-US");
const hours = (points: number) => Math.round(points / DEFAULT_POINTS_PER_HOUR);
const TO_LORD = pointsBetween(1, LORD);
const TO_CHAMPION = pointsBetween(1, CHAMPION);
const LORD_TO_CHAMPION = pointsBetween(LORD, CHAMPION);

const title = "Marvel Rivals Proficiency Calculator: Hours to Lord and Champion";
const description = `Enter a hero's level and see the points and hours of play left to Lord, Champion or level ${MAX_LEVEL}, the date you will get there, and every reward on the way.`;

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/calculator" },
  openGraph: { title, description, url: "/calculator" },
  twitter: { title, description },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "How many hours does it take to get Lord?",
    a: `About ${hours(TO_LORD)} hours on one hero from level 1. Lord is level 20 and takes ${fmt(TO_LORD)} proficiency points. From level 15 it is ${hoursText(pointsBetween(15, LORD) / DEFAULT_POINTS_PER_HOUR)}.`,
  },
  {
    q: "How many hours from Lord to Champion?",
    a: `About ${hours(LORD_TO_CHAMPION)} hours. Every level from 20 to 49 costs 1,600 points, ${fmt(LORD_TO_CHAMPION)} in all. Reaching Champion from level 1 takes about ${hours(TO_CHAMPION)} hours.`,
  },
  {
    q: "How accurate is the estimate?",
    a: `It assumes about ${DEFAULT_POINTS_PER_HOUR} proficiency points an hour, a common average. Finishing the hero's proficiency challenges every match is faster; playing without them is slower. The points each level costs were measured by players, since the game does not publish them.`,
  },
  {
    q: "Does time on one hero count toward another?",
    a: "No. Every hero has its own proficiency level and points, so set the hours you play that hero, not your total playtime.",
  },
];

export default async function CalculatorPage() {
  const session = authConfigured ? await auth() : null;
  const userId = session?.user?.id;
  const board = userId ? await getBoard(getDb(), userId) : null;
  const boardLevels = board
    ? Object.fromEntries(Object.entries(board.levels).map(([id, e]) => [id, e.level]))
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: title, description, url: `${SITE_URL}/calculator`, dateModified: DATA_CHECKED },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <div className="wrap prose-page calc-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="top">
        <div>
          <h1 className="page-title">Marvel Rivals proficiency calculator</h1>
          <p className="sub">
            How long until Lord on your hero? Set the level you are at and how much you play, and see the hours, the date and
            the rewards on the way. Point costs per level are on the <Link href="/ranks">ranks guide</Link>. Checked against the
            game on {DATA_CHECKED_TEXT} ({DATA_SEASON}).
          </p>
        </div>
      </header>

      <Calculator boardLevels={boardLevels} />

      <section className="panel prose">
        <h2>Questions</h2>
        {FAQ.map((f) => (
          <div key={f.q} className="faq">
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
