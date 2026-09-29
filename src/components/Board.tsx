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
import { Summary } from "./Summary";
import { HeroCard, HeroLine } from "./HeroViews";
import { Account } from "./Account";
import { ScreenshotImport } from "./ScreenshotImport";

const LS_LEVELS = "proficiency-board-v1";
const LS_UI = "proficiency-board-ui";

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

export function Board({ mode, initial, signInSlot, portraits, screenshotImport, importSignIn, syncEnabled }: Props) {
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

  const pending = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guest mode keeps levels in this browser. Signed-in users may import them.
  useEffect(() => {
    const local = readLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setGuestLevels(local);
    if (mode === "guest") {
      setBoard({
        levels: Object.fromEntries(Object.entries(local).map(([id, level]) => [id, { level, baselinePlaytimeSec: null }])),
        playtime: {},
        link: null,
      });
      setLoadVersion((v) => v + 1);
    }
    try {
      const ui = JSON.parse(localStorage.getItem(LS_UI) ?? "null");
      if (ui?.sort && ui.sort in SORTS) setSort(ui.sort);
      if (ui?.view === "cards" || ui?.view === "list") setView(ui.view);
    } catch {}
  }, [mode]);

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
      merged.levels[id] = { level, baselinePlaytimeSec: merged.levels[id]?.baselinePlaytimeSec ?? null };
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
    (heroId: string, level: number, fromEstimate = false) => {
      const v = clampLevel(level);
      setBoard((b) => ({
        ...b,
        levels: { ...b.levels, [heroId]: { level: v, baselinePlaytimeSec: b.levels[heroId]?.baselinePlaytimeSec ?? null } },
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
    [mode, flush],
  );

  // Save anything queued if the tab is closed or hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && pending.current.size) void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  const withBusy = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    try {
      return apply(await fn(), true);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(
    () =>
      buildRows(board.levels, board.playtime, {
        linked: syncEnabled && !!board.link,
        pointsPerHour: board.link?.pointsPerHour ?? null,
      }),
    [board, syncEnabled],
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
  const viewKey = `${q}|${role}|${rank}|${goal}|${sort}|${mode}|${loadVersion}`;
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

  return (
    <>
      {mode === "guest" ? (
        <div className="banner accent">
          <p>
            <strong>Playing as a guest.</strong> Levels save in this browser only. Sign in to keep them on every device
            {screenshotImport ? " and fill in your ranks from Heroes tab screenshots" : ""}.
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

      {mode === "guest" ? importSignIn : null}

      {mode === "user" && screenshotImport ? (
        <ScreenshotImport
          current={currentLevels}
          onSave={async (updates) => {
            const ok = await withBusy(() => saveLevelsAction(updates));
            if (ok) setToast({ text: `Saved ${updates.length} level${updates.length === 1 ? "" : "s"} from your screenshot.` });
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
                if (ok) setImportDismissed(true);
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

      <Summary
        rows={rows}
        activeRank={rank}
        onRank={(t) => setRank((r) => (r === t ? null : t))}
        linked={syncEnabled && !!board.link}
      />

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

      {!rows.some((r) => r.touched) ? (
        <p className="start-here">
          <strong>Start here:</strong>{" "}
          {screenshotImport && mode === "user"
            ? "use Import from screenshots above to fill in every hero's rank at once, then tap a level to set exact numbers."
            : screenshotImport && importSignIn
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
            <button className={sort === "role" ? "on" : ""} onClick={() => changeSort("role")}>
              Role
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
