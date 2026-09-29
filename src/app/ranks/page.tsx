import type { Metadata } from "next";
import Link from "next/link";
import {
  CHAMPION,
  DEFAULT_POINTS_PER_HOUR,
  LORD,
  MAX_LEVEL,
  RANKS,
  pointsBetween,
  pointsToNext,
  rankLevels,
} from "@/lib/proficiency";

const description =
  "All 11 Marvel Rivals hero proficiency ranks from Agent to Champion: the level each rank starts at, points per level, and total points to Lord (6,100), Champion (54,100) and max level 70 (116,100).";

export const metadata: Metadata = {
  title: "Marvel Rivals Proficiency Ranks, Levels and Points",
  description,
  alternates: { canonical: "/ranks" },
  openGraph: { title: "Marvel Rivals Proficiency Ranks, Levels and Points", description, url: "/ranks" },
  twitter: { title: "Marvel Rivals Proficiency Ranks, Levels and Points", description },
};

const fmt = (n: number) => n.toLocaleString("en-US");
const hours = (points: number) => Math.round(points / DEFAULT_POINTS_PER_HOUR);

const ROWS = RANKS.map((name, tier) => {
  const [first, last] = rankLevels(tier);
  // Points spent inside this rank, from its first level to the next rank's first level.
  const end = tier === RANKS.length - 1 ? MAX_LEVEL : last + 1;
  return {
    name,
    slug: name.toLowerCase(),
    first,
    last,
    perLevel: pointsToNext(first),
    inRank: pointsBetween(first, end),
    toReach: pointsBetween(1, first),
  };
});

const TO_LORD = pointsBetween(1, LORD);
const TO_CHAMPION = pointsBetween(1, CHAMPION);
const TO_MAX = pointsBetween(1, MAX_LEVEL);

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do hero proficiency ranks work in Marvel Rivals?",
    a: `Each hero has a proficiency level from 1 to ${MAX_LEVEL}. A new rank starts every 5 levels: Agent at 1, Knight at 5, Captain at 10, Centurion at 15, Lord at 20, then Count, Colonel, Warrior, Elite and Guardian, and Champion from level 50 to ${MAX_LEVEL}.`,
  },
  {
    q: "How many proficiency points does it take to reach Lord?",
    a: `${fmt(TO_LORD)} points to go from level 1 to level 20. At about ${DEFAULT_POINTS_PER_HOUR} points an hour that is roughly ${hours(TO_LORD)} hours on one hero.`,
  },
  {
    q: "How many points does it take to reach Champion?",
    a: `${fmt(TO_CHAMPION)} points to reach level 50. Every level from Lord to Guardian costs 1,600 points, so the climb from Lord to Champion is ${fmt(TO_CHAMPION - TO_LORD)} points.`,
  },
  {
    q: "What is the max proficiency level?",
    a: `Level ${MAX_LEVEL}, at ${fmt(TO_MAX)} total points. Champion levels cost 3,100 points each.`,
  },
  {
    q: "How do you earn proficiency points?",
    a: "By playing matches as that hero and completing the hero's proficiency challenges. Each hero tracks its own points, so time on one hero never counts toward another.",
  },
  {
    q: "Why do some charts say Agent is levels 1 to 5?",
    a: "Those charts count the level you finish a stage on. In game the badge changes as soon as you reach level 5, 10, 15 and so on: a level 15 hero shows the Centurion badge and a level 40 hero shows Elite.",
  },
];

export default function RanksPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="wrap prose-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="top">
        <div>
          <Link href="/" className="logo small" aria-label="Proficiency Board home">
            <span className="logo-a">Proficiency</span>
            <span className="logo-b">Board</span>
          </Link>
          <h1 className="page-title">Marvel Rivals proficiency ranks</h1>
          <p className="sub">
            Every rank from Agent to Champion, the level it starts at, and the points it takes. Checked against the in-game
            badges.
          </p>
        </div>
      </header>

      <section className="stat-row" aria-label="Key totals">
        <div className="panel stat">
          <span>Points to Lord</span>
          <b>{fmt(TO_LORD)}</b>
          <small>level 20, about {hours(TO_LORD)}h</small>
        </div>
        <div className="panel stat">
          <span>Points to Champion</span>
          <b>{fmt(TO_CHAMPION)}</b>
          <small>level 50, about {hours(TO_CHAMPION)}h</small>
        </div>
        <div className="panel stat">
          <span>Points to max</span>
          <b>{fmt(TO_MAX)}</b>
          <small>level {MAX_LEVEL}, about {hours(TO_MAX)}h</small>
        </div>
      </section>

      <section className="panel rank-table-wrap">
        <h2>All 11 ranks</h2>
        <div className="table-scroll">
          <table className="rank-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Levels</th>
                <th scope="col">Points per level</th>
                <th scope="col">Points in rank</th>
                <th scope="col">Total to reach</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name}>
                  <th scope="row">
                    <span className="rk">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/ranks/${r.slug}.webp`} alt="" width={52} height={47} />
                      {r.name}
                    </span>
                  </th>
                  <td>
                    {r.first} to {r.last}
                  </td>
                  <td>{fmt(r.perLevel)}</td>
                  <td>{fmt(r.inRank)}</td>
                  <td>{fmt(r.toReach)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted-note">
          Hours assume about {DEFAULT_POINTS_PER_HOUR} points per hour, a common average. Your pace depends on how often you
          finish the hero&apos;s challenges.
        </p>
      </section>

      <section className="panel prose">
        <h2>Questions</h2>
        {FAQ.map((f) => (
          <div key={f.q} className="faq">
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>

      <section className="banner accent cta">
        <p>
          <strong>See every hero&apos;s rank at once.</strong> Proficiency Board shows who is closest to Lord and Champion, and
          can read your ranks straight from screenshots of the Heroes tab.
        </p>
        <Link href="/" className="btn primary">
          Open the board
        </Link>
      </section>
    </div>
  );
}
