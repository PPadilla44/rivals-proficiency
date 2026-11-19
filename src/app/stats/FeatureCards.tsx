import { SMALL_BASE } from "@/server/dashboard";
import type { FeatureStep, FeatureWeek, Features } from "@/server/features";

const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Steps({ steps }: { steps: FeatureStep[] }) {
  // Share's first step is only recorded once a board qualifies, so a later step can be larger; scale to the biggest.
  const top = Math.max(1, ...steps.map((s) => s.n));
  return (
    <ul className="dash-steps">
      {steps.map((s) => (
        <li key={s.label}>
          <span className="dash-step-name">{s.label}</span>
          <span className="dash-bar" aria-hidden="true">
            <span className="dash-bar-fill gold" style={{ width: `${pct(s.n, top)}%` }} />
          </span>
          <b>{s.n}</b>
        </li>
      ))}
    </ul>
  );
}

function Headline({ done, of, text }: { done: number; of: number; text: string }) {
  if (of === 0) return <p className="dash-headline muted">Nobody yet in this range.</p>;
  const small = of < SMALL_BASE;
  return (
    <p className="dash-headline">
      <b>{small ? `${done} of ${of}` : `${pct(done, of)}%`}</b> <span>{text}</span>
    </p>
  );
}

function WeekStrip({ weeks, pick, label }: { weeks: FeatureWeek[]; pick: (w: FeatureWeek) => number; label: string }) {
  const max = Math.max(1, ...weeks.map(pick));
  const desc = weeks.map((w) => `${short(w.start)}${w.open ? " so far" : ""}: ${pick(w)}`).join(", ");
  return (
    <div className="dash-weekstrip">
      <p className="muted-note">{label}, by week (Monday to Sunday, Pacific)</p>
      <div className="dash-weekbars" role="img" aria-label={`${label}, by week. ${desc}`}>
        {weeks.map((w) => (
          <div key={w.start} className={`dash-weekcol${w.open ? " open" : ""}`}>
            <span className="dash-weeknum">{pick(w)}</span>
            <span className="dash-weekbar" style={{ height: `${Math.max(pick(w) ? 4 : 1, (pick(w) / max) * 56)}px` }} />
          </div>
        ))}
      </div>
      <div className="dash-weekaxis" aria-hidden="true">
        <span>{short(weeks[0].start)}</span>
        <span>{short(weeks[weeks.length - 1].start)} (so far)</span>
      </div>
    </div>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="dash-card" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>{title}</h3>
      {children}
    </section>
  );
}

export function FeatureCards({ f }: { f: Features }) {
  const imp = f.import;
  const shr = f.share;
  const calc = f.calc;
  const link = f.link;
  return (
    <div className="dash-grid">
      <Card id="feat-import" title="Import from screenshots">
        <Headline done={imp.steps[2].n} of={imp.steps[0].n} text="of people who opened Import saved heroes" />
        <Steps steps={imp.steps} />
        <p className="muted-note">
          Reads with a failure: {imp.readsFailed} of {imp.readsTotal} · wrong screen: {imp.wrongScreen} · said something&apos;s off: {imp.answeredOff}
        </p>
        <WeekStrip weeks={f.weeks} pick={(w) => w.import} label="People who saved an import" />
      </Card>

      <Card id="feat-share" title="Share my board">
        <Headline done={shr.steps[3].n} of={shr.steps[2].n} text="of people who opened Share shared a picture" />
        <Steps steps={shr.steps} />
        <p className="muted-note">
          Pictures by way: share sheet {shr.ways.share}, saved {shr.ways.save}, copied {shr.ways.copy} · with a board link: {shr.withLink}
        </p>
        <WeekStrip weeks={f.weeks} pick={(w) => w.share} label="People who shared a picture" />
      </Card>

      <Card id="feat-calc" title="Calculator">
        <Headline done={calc.steps[3].n} of={calc.steps[2].n} text="of people who saw the board box pressed a button" />
        <Steps steps={calc.steps} />
        <WeekStrip weeks={f.weeks} pick={(w) => w.calc} label="People who opened it" />
      </Card>

      <Card id="feat-link" title="Board link">
        <Headline done={link.steps[2].n} of={link.steps[0].n} text="of friends who opened a board link then started their own board" />
        <Steps steps={link.steps} />
        <p className="muted-note">
          Links on right now: {link.linksOn} of {link.accounts} accounts · views by friends in this range: {link.views}
        </p>
        <WeekStrip weeks={f.weeks} pick={(w) => w.link} label="Views by friends" />
      </Card>
    </div>
  );
}
