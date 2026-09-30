import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth, authConfigured } from "@/auth";
import { getDb } from "@/db";
import { getStats, type Stats } from "@/server/events";
import { isAdminEmail as isAdmin, playtimeSyncEnabled } from "@/lib/flags";
import { playtimeSyncFlag } from "@/flags";

export const metadata: Metadata = { title: "Stats", robots: { index: false, follow: false } };

function Totals({ s, title }: { s: Stats; title: string }) {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
  const items: [string, string | number, string?][] = [
    ["Visitors", s.visitors],
    ["Interacted", s.interacted, `${pct(s.interacted, s.visitors)} of visitors changed a level or opened the import`],
    ["Signed-in visitors", s.signedInVisitors],
    ["Returning", s.returning, "visited on 2 or more days"],
    ["Sign-ins", s.signIns, `${s.newAccounts} new account${s.newAccounts === 1 ? "" : "s"}`],
    ["Levels changed", s.levelSets],
    ["Imports saved", s.importsSaved, `${s.screenshotsRead} screenshots read`],
  ];
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="stat-grid">
        {items.map(([label, value, note]) => (
          <div key={label} className="stat">
            <span>{label}</span>
            <b>{value}</b>
            {note ? <small>{note}</small> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function StatsPage() {
  await connection(); // always per request, never prerendered
  const session = authConfigured ? await auth() : null;
  if (!isAdmin(session?.user?.email)) notFound();

  const db = getDb();
  const [week, month, syncForYou] = await Promise.all([
    getStats(db, 7),
    getStats(db, 30),
    playtimeSyncEnabled(session?.user, () => playtimeSyncFlag()),
  ]);
  const syncNote = !process.env.MARVEL_RIVALS_API_KEY
    ? "off for everyone (no MARVEL_RIVALS_API_KEY yet)"
    : `${syncForYou ? "on" : "off"} for you; set who gets it with the playtime-sync flag in Vercel → Flags`;

  return (
    <div className="wrap prose-page">
      <header className="top">
        <div>
          <h1 className="page-title">Stats</h1>
          <p className="sub">Anonymous events from the board. Only accounts in ADMIN_EMAILS can see this page. Times are UTC.</p>
          <p className="sub">
            Playtime sync: <b>{syncNote}</b>
          </p>
        </div>
      </header>
      <Totals s={week} title="Last 7 days" />
      <Totals s={month} title="Last 30 days" />
      <section className="panel rank-table-wrap">
        <h2>By day</h2>
        <div className="table-scroll">
          <table className="rank-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Visitors</th>
                <th scope="col">Interacted</th>
                <th scope="col">Levels changed</th>
                <th scope="col">Imports saved</th>
              </tr>
            </thead>
            <tbody>
              {month.daily.length ? (
                month.daily.map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{d.day}</th>
                    <td>{d.visitors}</td>
                    <td>{d.interacted}</td>
                    <td>{d.levelSets}</td>
                    <td>{d.importsSaved}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No events yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
