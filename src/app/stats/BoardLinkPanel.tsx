import { boardLinkLine, type BoardLinkStats } from "@/server/board-link-stats";

/** The public board link's numbers for three windows. Visitors are anonymous; owners' own views are left out. */
export function BoardLinkPanel({ day, week, month }: { day: BoardLinkStats; week: BoardLinkStats; month: BoardLinkStats }) {
  const windows: [string, BoardLinkStats][] = [
    ["Last 24 hours", day],
    ["Last 7 days", week],
    ["Last 30 days", month],
  ];
  return (
    <section className="panel">
      <h2>Board link</h2>
      <p className="muted-note">Public read-only links to a player&apos;s board. Visitors are anonymous; owners&apos; own views are left out.</p>
      <div className="stat-grid">
        {windows.map(([label, st]) => (
          <div key={label} className="stat">
            <span>{label}</span>
            {boardLinkLine(st).map((line) => (
              <small key={line}>{line}</small>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
