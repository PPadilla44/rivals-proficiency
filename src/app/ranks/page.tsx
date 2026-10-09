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
  rankOf,
} from "@/lib/proficiency";
import { REWARDS, REWARD_KIND_LABEL } from "@/lib/proficiency-rewards";
import { SITE_URL } from "@/lib/site-url";
import { DATA_CHECKED, DATA_CHECKED_TEXT, DATA_SEASON } from "@/lib/site";

const fmt = (n: number) => n.toLocaleString("en-US");
const hours = (points: number) => Math.round(points / DEFAULT_POINTS_PER_HOUR);

const TO_LORD = pointsBetween(1, LORD);
const TO_CHAMPION = pointsBetween(1, CHAMPION);
const TO_MAX = pointsBetween(1, MAX_LEVEL);

// The search result is the pitch: lead with the numbers people are looking for.
const title = "Marvel Rivals Proficiency Levels and Ranks: Points to Lord";
const description = `Lord takes ${fmt(TO_LORD)} proficiency points, about ${hours(TO_LORD)} hours on one hero. Champion takes ${fmt(TO_CHAMPION)}. All 11 ranks, points per level, and the reward at every level to ${MAX_LEVEL}.`;

export const metadata: Metadata = {
  // Absolute, so the site name does not push the useful words out of the result.
  title: { absolute: title },
  description,
  alternates: { canonical: "/ranks" },
  openGraph: { title, description, url: "/ranks" },
  twitter: { title, description },
};

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

const sumOf = (name: string) =>
  REWARDS.filter((r) => r.kind === "currency" && r.what.endsWith(name)).reduce((n, r) => n + parseInt(r.what, 10), 0);
const UM_TOTAL = sumOf("Unstable Molecules");
const UNITS_TOTAL = sumOf("Units");

const FAQ: { q: string; a: string }[] = [
  {
    q: "How long does it take to get Lord in Marvel Rivals?",
    a: `About ${hours(TO_LORD)} hours of play on one hero. Lord is level 20 and takes ${fmt(TO_LORD)} proficiency points, and most players earn around ${DEFAULT_POINTS_PER_HOUR} points an hour. Finishing the hero's proficiency missions every match makes it faster.`,
  },
  {
    q: "How long does it take to get Champion?",
    a: `About ${hours(TO_CHAMPION)} hours on one hero at the same pace. Champion is level 50 and takes ${fmt(TO_CHAMPION)} points, almost nine times what Lord takes.`,
  },
  {
    q: "What do you get for reaching Lord in Marvel Rivals?",
    a: "The hero's Lord avatar at level 20. Before that you unlock a nameplate at level 3, a spray at 5, the Fantastic title at 8, and KO prompts at 10 and 15. The animated version of the Lord avatar comes at Champion, level 50.",
  },
  {
    q: "What are the proficiency titles?",
    a: `Five titles, each followed by the hero's name: Fantastic at level 8, Uncanny at 29, Amazing at 39, Immortal at 60 and Legendary at level ${MAX_LEVEL}.`,
  },
  {
    q: "What level is Captain in Marvel Rivals?",
    a: `Captain is hero levels 10 to 14. Every rank and the level it starts at: ${RANKS.slice(1)
      .map((name, i) => `${name} ${rankLevels(i + 1)[0]}`)
      .join(", ")} (Champion runs to ${MAX_LEVEL}). Agent covers levels 1 to 4.`,
  },
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
    a: "By playing matches as that hero and completing its proficiency missions, listed in the Missions tab next to Rewards on its Proficiency page: one for time played, one for its role's job (damage, healing or damage blocked) and one for KOs or assists. The missions ask for more as the hero ranks up. Each hero tracks its own points, so time on one hero never counts toward another.",
  },
  {
    q: "What is the fastest way to level up proficiency?",
    a: "Play the hero in Quick Match or Competitive, where its missions repeat without limit, and play to the damage, healing and KO missions rather than just time on the hero. Missions in other modes, such as Conquest and Doom Match, stop counting after a daily limit.",
  },
  {
    q: "Why do some charts say Agent is levels 1 to 5?",
    a: "Those charts count the level you finish a stage on. In game the badge changes as soon as you reach level 5, 10, 15 and so on: a level 15 hero shows the Centurion badge and a level 40 hero shows Elite.",
  },
];

export default function RanksPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: title, description, url: `${SITE_URL}/ranks`, dateModified: DATA_CHECKED },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <div className="wrap prose-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="top">
        <div>
          <h1 className="page-title">Marvel Rivals proficiency levels and ranks</h1>
          <p className="sub">
            Lord is level 20 and takes {fmt(TO_LORD)} points, about {hours(TO_LORD)} hours on one hero. Champion is level 50 at{" "}
            {fmt(TO_CHAMPION)} points. Every rank, the level it starts at and the points it costs are below, checked against
            the in-game badges. Last checked {DATA_CHECKED_TEXT} ({DATA_SEASON}).
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
          finish the hero&apos;s missions. For your own hero and level, use the{" "}
          <Link href="/calculator">proficiency calculator</Link>.
        </p>
      </section>

      <section className="panel rank-table-wrap" id="rewards">
        <h2>Rewards at every level</h2>
        <div className="table-scroll">
          <table className="rank-table">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Rank</th>
                <th scope="col">Reward</th>
                <th scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {REWARDS.map((r) => (
                <tr key={r.level}>
                  <th scope="row">{r.level}</th>
                  <td>{rankOf(r.level)}</td>
                  <td>{r.what}</td>
                  <td>{REWARD_KIND_LABEL[r.kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted-note">
          Read from the in-game reward track for Adam Warlock in Season 10 and checked against Angela in {DATA_SEASON}. Every
          hero has the same track with its own art,
          and each title ends with that hero&apos;s name, for example Legendary Adam Warlock. Across all 70 levels a hero
          gives {UM_TOTAL} Unstable Molecules and {UNITS_TOTAL} Units.
        </p>
      </section>

      <section className="panel prose" id="level-up">
        <h2>How to level up proficiency faster</h2>
        <p>
          Each hero earns points from its own missions, in the Missions tab of its Proficiency page: one for time played, one
          for its role&apos;s job (damage, healing or damage blocked) and one for KOs or assists. They ask for more as the hero
          ranks up, which is part of why later levels take longer.
        </p>
        <ul>
          <li>
            <strong>Play Quick Match or Competitive.</strong> Missions there repeat without limit. Missions in arcade modes, such
            as Conquest, Doom Match and the 18v18 Annihilation mode, stop counting after a few completions a day.
          </li>
          <li>
            <strong>Play to the missions, not the clock.</strong> Time on the hero alone is worth about 60 points an hour,
            according to community guides, so most points come from finishing the damage, healing and KO missions.
          </li>
          <li>
            <strong>Skip custom games and Practice vs AI.</strong> Players report they don&apos;t count.
          </li>
          <li>
            <strong>Pick one hero at a time.</strong> Points stay with the hero that earned them, so spreading your time
            spreads your progress.
          </li>
        </ul>
        <p className="muted">
          The mode limits come from the 
          <a href="https://www.marvelrivals.com/gameupdate/20250422/41548_1229365.html" target="_blank" rel="noreferrer">
            official patch notes
          </a>
          ; the daily number and the time value come from the 
          <a href="https://marvelrivals.wiki.gg/wiki/Proficiency" target="_blank" rel="noreferrer">
            community wiki
          </a> 
          and guides. For your own hero and level, the <Link href="/calculator">calculator</Link> shows how long it will take.
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
