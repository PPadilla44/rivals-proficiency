"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  importLevelsAction,
  linkPlayerAction,
  saveLevelsAction,
  syncAction,
  unlinkPlayerAction,
  type ActionResult,
} from "@/app/actions";
import type { BoardData } from "@/server/board";
import { buildRows, GOALS, SORTS, type Goal, type HeroRow, type Sort } from "@/lib/board-model";
import { ROLE_SORT, type Role } from "@/lib/heroes";
import { CHAMPION, LORD, RANKS, clampLevel, tierOf } from "@/lib/proficiency";
import { StatTiles, Summary } from "./Summary";
import { HeroCard, HeroLine } from "./HeroViews";
import { Account } from "./Account";
import { LS_CARD, ScreenshotImport } from "./ScreenshotImport";
import { referrerSite, track, visitorId } from "@/lib/track";
import { armFor, showsExample, type ExampleMode } from "@/lib/ab";
import { EXAMPLE_BOARD } from "@/lib/example-board";

const LS_LEVELS = "proficiency-board-v1";
const LS_UI = "proficiency-board-ui";
const LS_TIP = "pb-tip-type-level";
const LS_EXAMPLE_DONE = "pb-example-done";
const LS_AB_SENT = "pb-ab-example";
const TIP_AFTER_STEPS = 5;

type Props = {
  mode: "guest" | "user";
  initial: BoardData | null;
  signInSlot: ReactNode;
  portraits: Record<string, string>;
  /** Server can read screenshots (vision key configured). */
  screenshotImport: boolean;
  /** Guest-only: a button that signs in and leads to the screenshot import. */
  importSignIn?: ReactNode;
  /** Playtime sync is available (stats API key configured). */
  syncEnabled: boolean;
  /** Whether first-time visitors see an example board (the example-board flag). */
  exampleMode?: ExampleMode;
};

type View = "cards" | "list";

const EMPTY: BoardData = { levels: {}, playtime: {}, link: null };

function readLocal(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_LEVELS);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.levels === "object" ? parsed.levels : {};
  } catch {
    return {};
  }
}

export function Board({ mode, initial, signInSlot, portraits, screenshotImport, importSignIn, syncEnabled, exampleMode = "off" }: Props) {
  const [board, setBoard] = useState<BoardData>(initial ?? EMPTY);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("level-desc");
  const [view, setView] = useState<View>("list");
  const [role, setRole] = useState<Role | "all">("all");
  const [goal, setGoal] = useState<Goal>("all");
  const [rank, setRank] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestLevels, setGuestLevels] = useState<Record<string, number>>({});
  const [loadVersion, setLoadVersion] = useState(0);
  const [guestCardHidden, setGuestCardHidden] = useState(false);
  const [emptyAtLoad, setEmptyAtLoad] = useState(() => Object.keys(initial?.levels ?? {}).length === 0);

  // First-time visitors may be shown an example board in place of their empty one. It is display
  // only: nothing in it is saved, and the first press of Get started (or any level control) swaps
  // in their own empty board for good.
  const [example, setExample] = useState(false);
  const exampleRef = useRef(false);
  const exampleEndedAt = useRef(0);
  const initialEmpty = useRef(Object.keys(initial?.levels ?? {}).length === 0);
  useEffect(() => {
    exampleRef.current = example;
  }, [example]);

  const pending = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest mode keeps levels in this browser. Signed-in users may import them.
  useEffect(() => {
    const local = readLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setGuestLevels(local);
    if (mode === "guest") setEmptyAtLoad(Object.keys(local).length === 0);
    if (mode === "guest") {
      setBoard({
        levels: Object.fromEntries(Object.entries(local).map(([id, level]) => [id, { level, baselinePlaytimeSec: null }])),
        playtime: {},
        link: null,
      });
      setLoadVersion((v) => v + 1);
    }
    try {
      if (localStorage.getItem(LS_CARD)) setGuestCardHidden(true);
    } catch {}
    // Example board: only for a board nobody has touched, and only until they start their own.
    const untouchedNow = mode === "guest" ? Object.keys(local).length === 0 : initialEmpty.current;
    if (untouchedNow && exampleMode !== "off") {
      let done = false;
      let sent = false;
      try {
        done = !!localStorage.getItem(LS_EXAMPLE_DONE);
        sent = !!localStorage.getItem(LS_AB_SENT);
      } catch {}
      if (!done) {
        const id = visitorId();
        // During the test, record which half this browser is in (the server keeps the first answer).
        if (exampleMode === "test" && !sent) {
          track("ab", { exp: "example", arm: armFor(id, "example") });
          try {
            localStorage.setItem(LS_AB_SENT, "1");
          } catch {}
        }
        if (showsExample(exampleMode, id)) setExample(true);
      }
    }
    try {
      const ui = JSON.parse(localStorage.getItem(LS_UI) ?? "null");
      if (ui?.sort && ui.sort in SORTS) setSort(ui.sort);
      if (ui?.view === "cards" || ui?.view === "list") setView(ui.view);
    } catch {}
  }, [mode, exampleMode]);

  /** Leave the example for the visitor's own empty board. `via` is how they did it. */
  const startOwnBoard = useCallback((via: "button" | "tap") => {
    if (!exampleRef.current) return;
    exampleRef.current = false;
    exampleEndedAt.current = Date.now();
    setExample(false);
    try {
      localStorage.setItem(LS_EXAMPLE_DONE, "1");
    } catch {}
    track("example_start", { via });
    if (via === "tap") setToast({ text: "That was an example. This is your board: set your first level." });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // One "visit" per browser session.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("pb-visit")) return;
      sessionStorage.setItem("pb-visit", "1");
    } catch {}
    track("visit", { mode, ref: referrerSite() });
  }, [mode]);

  // Tie this browser's anonymous id to the signed-in account (the server keeps one row per pair),
  // so activity from before sign-in can be connected to the account.
  useEffect(() => {
    if (mode !== "user") return;
    try {
      if (sessionStorage.getItem("pb-identify")) return;
      sessionStorage.setItem("pb-identify", "1");
    } catch {}
    track("identify");
  }, [mode]);

  // Level changes are batched: at most one event a minute, plus one when the tab is hidden.
  // "heroes" is how many different heroes changed, "taps" every single change (a button tap counts as one).
  const levelEdits = useRef({ count: 0, heroes: new Set<string>(), last: 0 });
  const flushLevelEvent = useCallback(() => {
    const e = levelEdits.current;
    if (!e.count) return;
    track("level_set", { heroes: e.heroes.size, taps: e.count, mode });
    e.count = 0;
    e.heroes.clear();
    e.last = Date.now();
  }, [mode]);

  const holdRun = useRef({ id: "", at: 0 });

  // Someone stepping the same hero one level at a time gets a one-time tip about the faster ways.
  const stepStreak = useRef<{ id: string; level: number; n: number }>({ id: "", level: 0, n: 0 });
  const noteStep = useCallback((heroId: string, v: number) => {
    const s = stepStreak.current;
    s.n = s.id === heroId && Math.abs(v - s.level) === 1 ? s.n + 1 : 1;
    s.id = heroId;
    s.level = v;
    if (s.n !== TIP_AFTER_STEPS) return;
    try {
      if (localStorage.getItem(LS_TIP)) return;
      localStorage.setItem(LS_TIP, "1");
    } catch {}
    setToast({ text: "Tip: tap the number to type a level, or hold + to count up fast." });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const apply = useCallback((res: ActionResult, reorder = false) => {
    if (!res.ok) {
      setToast({ text: res.error, error: true });
      return false;
    }
    // Keep any edits made while the request was in flight.
    const merged: BoardData = { ...res.board, levels: { ...res.board.levels } };
    for (const [id, level] of pending.current) {
      merged.levels[id] = { level, baselinePlaytimeSec: merged.levels[id]?.baselinePlaytimeSec ?? null, approx: false };
    }
    setBoard(merged);
    if (reorder) setLoadVersion((v) => v + 1);
    if (res.message) setToast({ text: res.message });
    return true;
  }, []);

  const flush = useCallback(
    async (fromEstimate = false) => {
      timer.current = null;
      const updates = [...pending.current].map(([heroId, level]) => ({ heroId, level }));
      pending.current.clear();
      if (!updates.length) return;
      apply(await saveLevelsAction(updates, fromEstimate));
    },
    [apply],
  );

  const setLevel = useCallback(
    (heroId: string, level: number, fromEstimate = false, held = false) => {
      // The example is not editable: touching a control starts the visitor's own board. A hold
      // that began on the example keeps firing for a moment, so ignore changes right after.
      if (exampleRef.current) return startOwnBoard("tap");
      if (Date.now() - exampleEndedAt.current < 900) return;
      const v = clampLevel(level);
      // One press-and-hold is one change, however many levels it passes through.
      const t = Date.now();
      const sameHold = held && holdRun.current.id === heroId && t - holdRun.current.at < 600;
      if (held) holdRun.current = { id: heroId, at: t };
      if (!sameHold) levelEdits.current.count += 1;
      levelEdits.current.heroes.add(heroId);
      // Steps from holding a button are the fast way already; only single taps count toward the tip.
      if (held) stepStreak.current.n = 0;
      else if (!fromEstimate) noteStep(heroId, v);
      if (Date.now() - levelEdits.current.last > 60_000) flushLevelEvent();
      setBoard((b) => ({
        ...b,
        levels: { ...b.levels, [heroId]: { level: v, baselinePlaytimeSec: b.levels[heroId]?.baselinePlaytimeSec ?? null, approx: false } },
      }));
      if (mode === "guest") {
        setGuestLevels((g) => {
          const next = { ...g, [heroId]: v };
          try {
            localStorage.setItem(LS_LEVELS, JSON.stringify({ levels: next }));
          } catch {}
          return next;
        });
        return;
      }
      pending.current.set(heroId, v);
      if (timer.current) clearTimeout(timer.current);
      if (fromEstimate) void flush(true);
      else timer.current = setTimeout(() => void flush(), 700);
    },
    [mode, flush, flushLevelEvent, noteStep, startOwnBoard],
  );

  // Save anything queued if the tab is closed or hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (pending.current.size) void flush();
      flushLevelEvent();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush, flushLevelEvent]);

  const withBusy = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    try {
      return apply(await fn(), true);
    } finally {
      setBusy(false);
    }
  };

  const shownBoard = example ? EXAMPLE_BOARD : board;
  const rows = useMemo(
    () =>
      buildRows(shownBoard.levels, shownBoard.playtime, {
        linked: syncEnabled && !!shownBoard.link,
        pointsPerHour: shownBoard.link?.pointsPerHour ?? null,
      }),
    [shownBoard, syncEnabled],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (needle && !r.name.toLowerCase().includes(needle) && !(r.aliases ?? []).some((a) => a.toLowerCase().includes(needle))) return false;
      if (role !== "all" && r.role !== role) return false;
      if (rank !== null && tierOf(r.effective) !== rank) return false;
      return GOALS[goal].test(r.effective);
    });
    return list.sort(sorter(sort));
  }, [rows, q, role, rank, goal, sort]);

  // Rows keep their position while you edit; re-sort only when the view or
  // the data source changes (filters, sort, a sync, a page load).
  const viewKey = `${q}|${role}|${rank}|${goal}|${sort}|${mode}|${loadVersion}|${example}`;
  const [frozen, setFrozen] = useState<{ key: string; order: string[] }>({ key: "", order: [] });
  if (frozen.key !== viewKey) setFrozen({ key: viewKey, order: visible.map((r) => r.id) });
  const byId = new Map(visible.map((r) => [r.id, r]));
  const shown: HeroRow[] = [
    ...frozen.order.filter((id) => byId.has(id)).map((id) => byId.get(id)!),
    ...visible.filter((r) => !frozen.order.includes(r.id)),
  ];

  const saveUi = (next: { sort: Sort; view: View }) => {
    try {
      localStorage.setItem(LS_UI, JSON.stringify(next));
    } catch {}
  };
  const changeSort = (s: Sort) => {
    setSort(s);
    saveUi({ sort: s, view });
  };
  const changeView = (v: View) => {
    setView(v);
    saveUi({ sort, view: v });
  };

  const currentLevels = useMemo(
    () => Object.fromEntries(Object.entries(board.levels).map(([id, v]) => [id, v.level])),
    [board.levels],
  );

  const localCount = Object.values(guestLevels).filter((l) => l > 1).length;
  const serverCount = Object.keys(board.levels).length;
  const [importDismissed, setImportDismissed] = useState(false);
  const showImport = mode === "user" && localCount > 0 && !importDismissed && serverCount < localCount;

  // A guest with nothing set yet sees the screenshot import first, as a sign-in card.
  // "Untouched" is decided when the board loads and then held for the visit. If the first tap
  // removed the card above the list, every row would jump up under the player's finger.
  const untouched = emptyAtLoad;
  const guestCard = mode === "guest" && screenshotImport && !!signInSlot && untouched && !guestCardHidden;

  return (
    <>
      {example ? (
        <>
          <section className="example-bar" aria-label="Example board">
            <p>
              <span className="example-tag">Example</span>
              <span>
                <strong>This is an example board.</strong> Yours starts empty.
              </span>
            </p>
            <button type="button" className="btn primary" onClick={() => startOwnBoard("button")}>
              Get started
            </button>
          </section>
          <div className="example-sticky" role="region" aria-label="Example board">
            <span>
              <strong>Example board.</strong> Yours starts empty.
            </span>
            <button type="button" className="btn primary" onClick={() => startOwnBoard("button")}>
              Get started
            </button>
          </div>
        </>
      ) : guestCard ? (
        <section className="panel shot-start" aria-label="Fill in your board">
          <button
            type="button"
            className="shot-start-x"
            aria-label="Hide this"
            title="Hide this"
            onClick={() => {
              setGuestCardHidden(true);
              try {
                localStorage.setItem(LS_CARD, "1");
              } catch {}
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div>
            <h2>Fill in your whole board from screenshots</h2>
            <p>
              Sign in, then add screenshots or photos of the in-game <strong>Heroes</strong> tab. Every hero&apos;s rank fills in
              at once, no typing.
            </p>
          </div>
          <div className="shot-start-actions">
            {signInSlot}
            <span>or tap any level below to type it in. Levels save in this browser.</span>
          </div>
        </section>
      ) : mode === "guest" ? (
        <div className="banner accent">
          <p>
            <strong>Playing as a guest.</strong> Levels save in this browser only. Sign in to keep them on every device
            {screenshotImport ? " and import your ranks from Heroes tab screenshots" : ""}.
          </p>
          {signInSlot ?? <p>Sign-in is not configured on this server yet.</p>}
        </div>
      ) : syncEnabled ? (
        <Account
          link={board.link}
          busy={busy}
          onLink={(query) => withBusy(() => linkPlayerAction(query))}
          onSync={() => withBusy(() => syncAction())}
          onUnlink={() => withBusy(() => unlinkPlayerAction())}
        />
      ) : null}

      {mode === "guest" && !guestCard && !example ? importSignIn : null}

      {mode === "user" && screenshotImport && !example ? (
        <ScreenshotImport
          current={currentLevels}
          empty={untouched}
          onSave={async (updates) => {
            const ok = await withBusy(() => saveLevelsAction(updates));
            if (ok) setEmptyAtLoad(false);
            if (ok)
              setToast({
                text: `Saved ${updates.length} rank${updates.length === 1 ? "" : "s"}. Each starts at its rank's first level; tap a level to set it exactly.`,
              });
            return ok;
          }}
        />
      ) : null}

      {showImport ? (
        <div className="banner">
          <p>
            This browser has levels for <strong>{localCount} heroes</strong> from before you signed in. Import them into your
            account? Heroes you already saved are left as they are.
          </p>
          <div className="actions">
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                const ok = await withBusy(() =>
                  importLevelsAction(Object.entries(guestLevels).map(([heroId, level]) => ({ heroId, level }))),
                );
                if (ok) {
                  setImportDismissed(true);
                  setEmptyAtLoad(false);
                }
              }}
            >
              Import levels
            </button>
            <button className="btn" onClick={() => setImportDismissed(true)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}

      <StatTiles rows={rows} />

      <div className="board-layout">
      <Summary
        rows={rows}
        activeRank={rank}
        onRank={(t) => setRank((r) => (r === t ? null : t))}
        linked={syncEnabled && !!board.link}
      />

      <div className="board-main">
      <section className="controls" aria-label="Search and sort">
        <div className="row1">
          <div className="search">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input id="q" type="search" placeholder="Search heroes" autoComplete="off" aria-label="Search heroes" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="lbl" htmlFor="sort">
            <span className="lbl-text">Sort</span>
            <select id="sort" value={sort} onChange={(e) => changeSort(e.target.value as Sort)}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="lbl rank-select" htmlFor="rank">
            <span className="lbl-text">Rank</span>
            <select id="rank" value={rank ?? ""} onChange={(e) => setRank(e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">All ranks</option>
              {RANKS.map((r, i) => (
                <option key={r} value={i}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <span className="count">
            {shown.length} of {rows.length}
          </span>
          <div className="view-toggle" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === "cards"} onClick={() => changeView("cards")}>
              Cards
            </button>
            <button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")}>
              List
            </button>
          </div>
        </div>
      </section>
      <section className="filters" aria-label="Filters">
        <div className="row1">
          <div className="chips">
            {(
              [
                ["all", "All roles", null],
                ["V", "Vanguard", "var(--van)"],
                ["D", "Duelist", "var(--duel)"],
                ["S", "Strategist", "var(--strat)"],
                ["M", "Deadpool", "var(--multi)"],
              ] as const
            ).map(([val, label, color]) => (
              <button
                key={val}
                type="button"
                className="chip"
                aria-pressed={role === val}
                onClick={() => setRole((r) => (r === val && val !== "all" ? "all" : val))}
              >
                {color ? <i className="dot" style={{ background: color }} /> : null}
                {label}
              </button>
            ))}
          </div>
          <span className="sep" aria-hidden="true" />
          <div className="chips">
            {(Object.keys(GOALS) as Goal[]).map((g) => (
              <button
                key={g}
                type="button"
                className="chip"
                aria-pressed={goal === g}
                onClick={() => setGoal((cur) => (cur === g && g !== "all" ? "all" : g))}
              >
                {GOALS[g].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {untouched && !example && !guestCard && !(screenshotImport && mode === "user") ? (
        <p className="start-here">
          <strong>Start here:</strong>{" "}
          {screenshotImport && mode === "guest"
              ? "tap a hero's level and type where it is in game, or sign in to fill in every rank from a few Heroes tab screenshots."
              : "tap a hero's level and type where it is in game. The rank panels above fill in as you go."}
        </p>
      ) : null}

      {view === "cards" ? (
        <section className="grid" aria-label="Heroes">
          {shown.length ? (
            shown.map((r) => <HeroCard key={r.id} row={r} portrait={portraits[r.id]} onLevel={setLevel} />)
          ) : (
            <div className="noresults">No heroes match these filters.</div>
          )}
        </section>
      ) : (
        <section className="list" aria-label="Heroes">
          <div className="head">
            <button className={sort === "name" ? "on" : ""} onClick={() => changeSort("name")}>
              Hero
            </button>
            <button className={sort.startsWith("level") ? "on" : ""} onClick={() => changeSort(sort === "level-desc" ? "level-asc" : "level-desc")}>
              Rank
            </button>
            <button className={sort.startsWith("level") ? "on" : ""} onClick={() => changeSort(sort === "level-desc" ? "level-asc" : "level-desc")}>
              Level
            </button>
            <button className={sort === "lord" || sort === "champ" ? "on" : ""} onClick={() => changeSort(sort === "lord" ? "champ" : "lord")}>
              Next milestone
            </button>
          </div>
          {shown.length ? (
            shown.map((r) => <HeroLine key={r.id} row={r} portrait={portraits[r.id]} onLevel={setLevel} />)
          ) : (
            <div className="noresults">No heroes match these filters.</div>
          )}
        </section>
      )}

      </div>
      </div>

      {toast ? (
        <div className={`toast${toast.error ? " error" : ""}`} role="status">
          {toast.text}
        </div>
      ) : null}
    </>
  );
}

function sorter(sort: Sort) {
  return (a: HeroRow, b: HeroRow): number => {
    const la = a.effective;
    const lb = b.effective;
    const byName = a.name.localeCompare(b.name);
    switch (sort) {
      case "level-asc":
        return la - lb || byName;
      case "name":
        return byName;
      case "role":
        return ROLE_SORT[a.role] - ROLE_SORT[b.role] || lb - la || byName;
      case "release":
        return a.order - b.order;
      case "lord": {
        const ga = la < LORD ? 0 : 1;
        const gb = lb < LORD ? 0 : 1;
        return ga - gb || (ga === 0 ? lb - la : la - lb) || byName;
      }
      case "champ": {
        const g = (l: number) => (l >= LORD && l < CHAMPION ? 0 : l < LORD ? 1 : 2);
        return g(la) - g(lb) || (g(la) === 2 ? la - lb : lb - la) || byName;
      }
      default:
        return lb - la || byName;
    }
  };
}
