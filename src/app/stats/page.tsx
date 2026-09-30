import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth, authConfigured } from "@/auth";
import { getDb } from "@/db";
import { getStats, type Stats } from "@/server/events";
import { isAdminEmail as isAdmin, playtimeSyncEnabled } from "@/lib/flags";
import { playtimeSyncFlag, screenshotDailyCap } from "@/flags";
import { getProblems, sendTestAlert } from "@/server/alerts";
import { redirect } from "next/navigation";
import { countScans } from "@/server/board";

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

/** Admin-only: post a test message to the alert webhook, then come back with the result. */
async function testAlertAction() {
  "use server";
  const session = authConfigured ? await auth() : null;
  if (!isAdmin(session?.user?.email)) notFound();
  let result = "sent";
  try {
    await sendTestAlert();
  } catch (e) {
    console.error("test alert failed", e);
    result = "failed";
  }
  redirect(`/stats?alert=${result}`);
}

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  await connection(); // always per request, never prerendered
  const session = authConfigured ? await auth() : null;
  if (!isAdmin(session?.user?.email)) notFound();
  const alertResult = (await searchParams).alert;

  const db = getDb();
  const [week, month, syncForYou, problems, readsToday, cap] = await Promise.all([
    getStats(db, 7),
    getStats(db, 30),
    playtimeSyncEnabled(session?.user, () => playtimeSyncFlag()),
    getProblems(db, 7),
    countScans(db),
    screenshotDailyCap(),
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
          <p className="sub">
            Screenshot reads in the last 24 hours:{" "}
            <b>
              {readsToday} of {cap}
            </b>{" "}
            (site-wide cap, set by the screenshot-daily-cap flag). Alerts go to{" "}
            <b>{process.env.ALERT_WEBHOOK_URL ? "your alert webhook" : "nowhere yet: set ALERT_WEBHOOK_URL"}</b>.
          </p>
          {process.env.ALERT_WEBHOOK_URL ? (
            <form action={testAlertAction} className="actions" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
              <button className="btn small">Send test alert</button>
              {alertResult === "sent" ? <span className="sub">Sent. Check your Discord channel.</span> : null}
              {alertResult === "failed" ? (
                <span className="sub danger-error">Couldn&apos;t send. Check the webhook URL in Vercel.</span>
              ) : null}
            </form>
          ) : null}
        </div>
      </header>
      <section className="panel rank-table-wrap">
        <h2>Problems, last 7 days</h2>
        {problems.length ? (
          <div className="table-scroll">
            <table className="rank-table">
              <thead>
                <tr>
                  <th scope="col">What</th>
                  <th scope="col">Count</th>
                  <th scope="col">Last seen (UTC)</th>
                  <th scope="col">Last detail</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((p) => (
                  <tr key={p.kind}>
                    <th scope="row">{p.label}</th>
                    <td>{p.count}</td>
                    <td>{p.lastAt.slice(0, 16).replace("T", " ")}</td>
                    <td>{p.lastDetail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-note">None. Failed imports, a spent API budget, the daily cap, unknown hero names and server errors show up here.</p>
        )}
      </section>
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
