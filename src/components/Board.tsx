"use client";

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import AnswerCard from "./AnswerCard";
import { CameraIcon } from "./bits";
import { HeroCard, HeroLine } from "./HeroViews";
import { Account } from "./Account";
import { LS_CARD, ScreenshotImport } from "./ScreenshotImport";
import { referrerSite, track, visitorId } from "@/lib/track";
import { openFeedback } from "@/lib/feedback-open";
import { KofiLink } from "./KofiLink";
import Dialog from "./Dialog";
import { SIGNIN_OPEN_EVENT, openSignIn } from "@/lib/signin-open";
import { SESSION_CHANGED_EVENT } from "./SiteNav";
import { armFor, showsExample, type ExampleMode } from "@/lib/ab";
import { EXAMPLE_BOARD } from "@/lib/example-board";
import { OFFLINE_SAVE_MESSAGE, requeueFailed } from "@/lib/save-queue";
import { SHARE_MIN_LORD, lordCount, shareEligible } from "@/lib/share-card";

// The share sheet and its drawing code load only when someone opens it.
const ShareSheet = lazy(() => import("./ShareSheet"));

const LS_LEVELS = "proficiency-board-v1";
const LS_UI = "proficiency-board-ui";
const LS_TIP = "pb-tip-type-level";
const LS_EXAMPLE_DONE = "pb-example-done";
const LS_AB_SENT = "pb-ab-example";
const TIP_AFTER_STEPS = 3;
const LS_SHARE_NUDGE = "pb-share-nudged";
const SHARE_IDLE_MS = 10_000;

type Props = {
  mode: "guest" | "user";
  initial: BoardData | null;
  signInSlot: ReactNode;
  portraits: Record<string, string>;
  /** Server can read screenshots (vision key configured). */
  screenshotImport: boolean;
  /** Guest-only: a button that signs in and leads to the screenshot import. */
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

export function Board({ mode, initial, signInSlot, portraits, screenshotImport, syncEnabled, exampleMode = "off" }: Props) {
  const [board, setBoard] = useState<BoardData>(initial ?? EMPTY);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>(mode === "guest" && exampleMode === "on" ? "lord" : "level-desc");
  const [view, setView] = useState<View>("list");
  const [role, setRole] = useState<Role | "all">("all");
  const [goal, setGoal] = useState<Goal>("all");
  const [rank, setRank] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean; long?: boolean; sticky?: boolean; action?: { label: string; run: () => void } } | null>(null);
  const [shareOpen, setShareOpen] = useState<"button" | "nudge" | "idle" | null>(null);
  // Set once the player changes something this visit, so levels loading in don't count as progress.
  const userChanged = useRef(false);
  const lastChange = useRef<{ id: string; level: number } | null>(null);
  // Phones show search and one Filter button; sort, layout and the chips open from it.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  // The nav's Sign in button (or a link to /?signin=1) opens the sign-in dialog here, where the server form is.
  useEffect(() => {
    const open = () => setSignInOpen(true);
    window.addEventListener(SIGNIN_OPEN_EVENT, open);
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("signin") === "1") {
        u.searchParams.delete("signin");
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
        open();
      }
    } catch {}
    return () => window.removeEventListener(SIGNIN_OPEN_EVENT, open);
  }, []);
  // Signing in can happen without a page load (the server redirects back here), and the nav lives above
  // this page, so tell it to read the session again whenever this board is for a different player.
  useEffect(() => {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }, [mode]);
  const [busy, setBusy] = useState(false);
  const [guestLevels, setGuestLevels] = useState<Record<string, number>>({});
  const [loadVersion, setLoadVersion] = useState(0);
  const [guestCardHidden, setGuestCardHidden] = useState(false);
  // After an import is saved: ask if it read the heroes right. "right" shows a thank-you with the Ko-fi link.
  const [importCheck, setImportCheck] = useState<null | { count: number; answer: "right" | null }>(null);
  const [emptyAtLoad, setEmptyAtLoad] = useState(() => Object.keys(initial?.levels ?? {}).length === 0);

  // First-time visitors may be shown an example board in place of their empty one. It is display
  // only: nothing in it is saved, and the first press of Enter my levels (or any level control) swaps
  // in their own empty board for good.
  // When the example is on for everyone, the server draws it too (no swap from the sign-in card after load).
  // Returning visitors and people who finished it are switched back in the effect below, behind the hold.
  const exampleForAll = mode === "guest" && exampleMode === "on";
  const [example, setExample] = useState(exampleForAll);
  const [ready, setReady] = useState(false);
  const exampleRef = useRef(false);
  // True once this visit left the sample for the visitor's own board.
  const [swapped, setSwapped] = useState(false);
  // The rows as last drawn, so the first tap on the sample can be turned into a level on the visitor's own board.
  const rowsRef = useRef<HeroRow[]>([]);
  const exampleEndedAt = useRef(0);
  const initialEmpty = useRef(Object.keys(initial?.levels ?? {}).length === 0);
  useEffect(() => {
    exampleRef.current = example;
  }, [example]);

  const pending = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while levels are waiting to be saved again after a failed save.
  const saveFailed = useRef(false);
  const retryEstimate = useRef(false);
  const flushRef = useRef<(fromEstimate?: boolean) => Promise<void>>(async () => {});

  // Guest mode keeps levels in this browser. Signed-in users may import them.
  useEffect(() => {
    const local = readLocal();
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
    let showExample = false;
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
        if (showsExample(exampleMode, id)) {
          showExample = true;
          setExample(true);
        }
      }
    }
    // The server drew the example for everyone: take it away for a returning visitor, then show the board.
    if (exampleForAll && !showExample) setExample(false);
    setReady(true);
    try {
      const ui = JSON.parse(localStorage.getItem(LS_UI) ?? "null");
      if (ui?.sort && ui.sort in SORTS) setSort(ui.sort);
      if (ui?.view === "cards" || ui?.view === "list") setView(ui.view);
    } catch {}
  }, [mode, exampleMode, exampleForAll]);

  // Reveal the board once the first render with the visitor's own levels is in the page (see saved-board-flag.ts).
  useEffect(() => {
    if (ready) document.documentElement.setAttribute("data-board-ready", "1");
  }, [ready]);

  /** Leave the example for the visitor's own empty board. `via` is how they did it. */
  const startOwnBoard = useCallback((via: "button" | "tap", applied = false) => {
    if (!exampleRef.current) return;
    exampleRef.current = false;
    exampleEndedAt.current = Date.now();
    setExample(false);
    setSwapped(true);
    try {
      localStorage.setItem(LS_EXAMPLE_DONE, "1");
    } catch {}
    track("example_start", { via });
    if (via === "tap" && !applied) setToast({ text: "This is your board now. Set your first level." });
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
    setToast({ text: "Tip: tap the number to type a level, or hold + to count up fast.", long: true });
  }, []);

  // Hovering or focusing a toast holds it, so a button can be reached. Errors stay until dismissed.
  const [toastHeld, setToastHeld] = useState(false);
  useEffect(() => {
    if (!toast || toast.sticky || toast.error || toastHeld) return;
    const t = setTimeout(() => setToast(null), toast.action ? 15000 : toast.long ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [toast, toastHeld]);

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
      let res: ActionResult;
      try {
        res = await saveLevelsAction(updates, fromEstimate);
      } catch {
        // The request never reached the server (offline, dropped connection).
        res = { ok: false, error: OFFLINE_SAVE_MESSAGE };
      }
      if (!res.ok) {
        // Keep the levels queued: the board already shows them, so they must not be forgotten.
        requeueFailed(pending.current, updates);
        saveFailed.current = true;
        retryEstimate.current = fromEstimate;
        setToast({ text: res.error, error: true, sticky: true, action: { label: "Retry", run: () => void flushRef.current(retryEstimate.current) } });
        return;
      }
      if (saveFailed.current && !pending.current.size) {
        saveFailed.current = false;
        setToast((t) => (t?.sticky ? null : t));
      }
      apply(res);
    },
    [apply],
  );
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Levels left over from a failed save are tried again when the connection returns or the tab is shown.
  useEffect(() => {
    const retry = () => {
      if (pending.current.size && !timer.current) void flush(retryEstimate.current);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  const setLevel = useCallback(
    function apply(heroId: string, level: number, fromEstimate = false, held = false, first = false) {
      // The example is not editable: touching a control starts the visitor's own board, and that first
      // touch counts. A step up or down moves the hero one level from 1; a typed number is taken as typed.
      // A hold that began on the example keeps firing for a moment, so ignore the rest of it.
      if (exampleRef.current) {
        const from = rowsRef.current.find((r) => r.id === heroId)?.effective ?? 1;
        const own = clampLevel(Math.abs(level - from) === 1 ? 1 + (level - from) : level);
        startOwnBoard("tap", own > 1);
        if (own > 1) {
          apply(heroId, own, false, false, true);
          setToast({ text: "This is your own board now. That level is saved here." });
        }
        return;
      }
      if (!first && Date.now() - exampleEndedAt.current < 900) return;
      const v = clampLevel(level);
      userChanged.current = true;
      lastChange.current = { id: heroId, level: v };
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
  const activeFilters = (role !== "all" ? 1 : 0) + (goal !== "all" ? 1 : 0) + (rank !== null ? 1 : 0);
  const rows = useMemo(
    () =>
      buildRows(shownBoard.levels, shownBoard.playtime, {
        linked: syncEnabled && !!shownBoard.link,
        pointsPerHour: shownBoard.link?.pointsPerHour ?? null,
      }),
    [shownBoard, syncEnabled],
  );
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Share my board: offered once the board has a few heroes worth showing (never on the sample).
  const lordNow = lordCount(rows);
  const champNow = rows.filter((r) => r.effective >= CHAMPION).length;
  const canShare = !example && shareEligible(rows);
  const openShare = useCallback((from: "button" | "nudge" | "idle") => {
    setToast(null);
    setShareOpen(from);
  }, []);

  // Count who could share, not only who did: a low share count then says whether the bar is too high.
  const readySent = useRef(false);
  useEffect(() => {
    if (!canShare || readySent.current) return;
    readySent.current = true;
    track("share", { action: "ready", lord: lordNow });
  }, [canShare, lordNow]);

  // The moment to ask is right after a hero reaches Lord or Champion (or an import fills the board).
  // Asked once per browser, and only after a change the player made this visit, not levels loading in.
  const seenCounts = useRef<{ lord: number; champ: number } | null>(null);
  useEffect(() => {
    if (example) return;
    const prev = seenCounts.current;
    const now = { lord: lordNow, champ: champNow };
    if (!prev || !userChanged.current) {
      seenCounts.current = now;
      return;
    }
    const rose = now.lord > prev.lord || now.champ > prev.champ;
    if (!rose || now.lord < SHARE_MIN_LORD) {
      seenCounts.current = now;
      return;
    }
    // Let a message already on screen (an import result, a tip) finish first, and wait out the
    // "did it read right?" banner after an import so the two never stack.
    if (toast || importCheck) return;
    seenCounts.current = now;
    try {
      if (localStorage.getItem(LS_SHARE_NUDGE)) return;
      localStorage.setItem(LS_SHARE_NUDGE, "1");
    } catch {
      return;
    }
    const hero = lastChange.current ? rows.find((r) => r.id === lastChange.current?.id) : undefined;
    const lead =
      hero && hero.effective >= CHAMPION && now.champ > prev.champ
        ? `${hero.name} just reached Champion.`
        : hero && hero.effective >= LORD && now.lord > prev.lord
          ? `${hero.name} just reached Lord.`
          : `${now.lord} heroes at Lord or higher.`;
    setToast({ text: `${lead} Share your board?`, action: { label: "Share", run: () => openShare("nudge") } });
  }, [lordNow, champNow, toast, importCheck, example, rows, openShare]);

  // People who already qualify when they arrive never "rise" during the visit, so the nudge above never
  // reaches them. Ask them once too, after a few quiet seconds on their board. Same once-per-browser key,
  // so nobody gets both, and it never lands on top of another message or the open sheet.
  useEffect(() => {
    if (!canShare || toast || importCheck || shareOpen) return;
    const t = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      try {
        if (localStorage.getItem(LS_SHARE_NUDGE)) return;
        localStorage.setItem(LS_SHARE_NUDGE, "1");
      } catch {
        return;
      }
      setToast({ text: `${lordNow} heroes at Lord or higher. Share your board?`, action: { label: "Share", run: () => openShare("idle") } });
    }, SHARE_IDLE_MS);
    return () => clearTimeout(t);
  }, [canShare, lordNow, toast, importCheck, shareOpen, openShare]);

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
  // One message above the board at a time: the import check first, then levels found in this browser,
  // and only then the usual account, sign-in or import cards.
  const oneMessage = !!importCheck || showImport;

  // The sticky column headers sit just under the sticky toolbar, whatever height the toolbar is.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".controls");
    if (!bar) return;
    const set = () => document.documentElement.style.setProperty("--controls-h", `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Desktop, sample board: once the answer card has scrolled away, its "Enter my levels" button is
  // offered again in the sticky toolbar (the card's own button is the one gold button while the card shows).
  const [cardGone, setCardGone] = useState(false);
  useEffect(() => {
    if (!example) {
      setCardGone(false);
      return;
    }
    const el = document.querySelector(".answer");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCardGone(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [example]);

  // A guest with nothing set yet sees the screenshot import first, as a sign-in card.
  // "Untouched" is decided when the board loads and then held for the visit. If the first tap
  // removed the card above the list, every row would jump up under the player's finger.
  const untouched = emptyAtLoad;
  const guestCard = mode === "guest" && screenshotImport && !!signInSlot && untouched && !guestCardHidden;

  // The guest banner, as a function because the card branch also draws one (hidden unless a saved board is
  // found before the first paint), so the slot keeps its height when the card goes away. See saved-board-flag.ts.
  const guestBanner = (extra: string) => (
    <div className={`banner guest-line${extra}`}>
      {signInSlot ? (
        <p>
          <strong>Guest board,</strong> saved in this browser only.{" "}
          <button type="button" className="link-btn" onClick={openSignIn}>
            Sign in
          </button>{" "}
          to keep it on every device.
        </p>
      ) : (
        <p>Sign-in is not configured on this server yet.</p>
      )}
    </div>
  );

  const roleChips = (
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
  );
  const goalChips = (
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
  );

  return (
    <div className={exampleForAll ? "board-zone hold" : "board-zone"}>
      <AnswerCard
        rows={rows}
        linked={syncEnabled && !!board?.link}
        kind={example ? "sample" : guestCard ? "start" : "own"}
        anyLevel={rows.some((r) => r.effective > 1)}
        fromSample={swapped}
        onEnter={
          example
            ? () => startOwnBoard("button")
            : guestCard && !swapped && !rows.some((r) => r.effective > 1)
              ? () => {
                  document.getElementById("q")?.scrollIntoView({ block: "center" });
                  document.getElementById("q")?.focus();
                }
              : undefined
        }
        actions={
          canShare ? (
            <button type="button" className="btn" onClick={() => openShare("button")}>
              <ShareIcon />
              Share my board
            </button>
          ) : null
        }
      />

      {/* The sample board shows these same rows (or holds their space), so swapping to your own board
          does not push the list down under the first tap. */}
      {oneMessage ? null : guestCard || (example && mode === "guest") ? (
        guestBanner(!example && rows.some((r) => r.effective > 1) ? " banner-alt on" : " banner-alt")
      ) : mode === "guest" ? (
        guestBanner("")
      ) : syncEnabled && board ? (
        <div className={example ? "ghost-slot" : undefined} inert={example}>
          <Account
            link={board.link}
            busy={busy}
            onLink={(query) => withBusy(() => linkPlayerAction(query))}
            onSync={() => withBusy(() => syncAction())}
            onUnlink={() => withBusy(() => unlinkPlayerAction())}
          />
        </div>
      ) : null}

      {mode === "guest" && screenshotImport && !!signInSlot && !oneMessage ? (
        <div className="shot-bar">
          <button type="button" className="btn" onClick={openSignIn}>
            <CameraIcon />
            Import from screenshots
          </button>
          <span>Sign in, then screenshot each page of the in-game Heroes tab and every rank fills in.</span>
        </div>
      ) : null}

      {mode === "user" && screenshotImport && !oneMessage ? (
        <ScreenshotImport
          current={currentLevels}
          empty={untouched}
          quiet={example}
          onSave={async (updates) => {
            const ok = await withBusy(() => saveLevelsAction(updates));
            if (ok) {
              userChanged.current = true;
              lastChange.current = null;
              setEmptyAtLoad(false);
              setImportCheck({ count: updates.length, answer: null });
            }
            return ok;
          }}
        />
      ) : null}

      {importCheck ? (
        <div className="banner import-check" role="region" aria-label="Did the import read your heroes right?">
          {importCheck.answer === "right" ? (
            <p>
              <strong>Glad it worked!</strong> The board is free and fan-made. If it saves you some clicking, a coffee helps keep it going.
            </p>
          ) : (
            <p>
              <strong>Did it read your heroes right?</strong> If a rank is wrong or a hero is missing, tell me and I&apos;ll fix it.
            </p>
          )}
          <div className="actions">
            {importCheck.answer === "right" ? (
              <KofiLink from="import" className="link-btn">
                <span aria-hidden="true">&#9829;</span> Support on Ko-fi
              </KofiLink>
            ) : (
              <>
                <button
                  className="btn primary"
                  onClick={() => {
                    track("import_check", { result: "right" });
                    setImportCheck({ ...importCheck, answer: "right" });
                  }}
                >
                  Looks right
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    track("import_check", { result: "off" });
                    openFeedback("import", "bug");
                    setImportCheck(null);
                  }}
                >
                  Something&apos;s off
                </button>
              </>
            )}
            <button type="button" className="toast-x banner-x" aria-label="Dismiss" onClick={() => setImportCheck(null)}>
              ×
            </button>
          </div>
        </div>
      ) : null}

      {showImport && !importCheck ? (
        <div className="banner accent browser-levels" role="region" aria-label="Levels found in this browser">
          <div>
            <h2>
              You have {localCount} {localCount === 1 ? "level" : "levels"} saved in this browser
            </h2>
            <p>Add them to your account so they are on every device. Heroes you already saved are left as they are.</p>
          </div>
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
              Add to my account
            </button>
            <button className="btn" onClick={() => setImportDismissed(true)}>
              Not now
            </button>
          </div>
        </div>
      ) : null}

      <div className="board-layout">
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
          <button
            type="button"
            className="btn filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filter{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
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
          {example && cardGone ? (
            <button type="button" className="btn primary enter-toolbar" onClick={() => startOwnBoard("button")}>
              Enter my levels
            </button>
          ) : null}
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

      {filtersOpen ? (
        <Dialog title="Filter" onClose={() => setFiltersOpen(false)} footer={<button type="button" className="btn primary" onClick={() => setFiltersOpen(false)}>Show {shown.length} heroes</button>}>
          <div className="filter-sheet">
            <label className="lbl phone-only" htmlFor="m-sort">
              <span className="lbl-text">Sort</span>
              <select id="m-sort" value={sort} onChange={(e) => changeSort(e.target.value as Sort)}>
                {Object.entries(SORTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="lbl phone-only" htmlFor="m-rank">
              <span className="lbl-text">Rank</span>
              <select id="m-rank" value={rank ?? ""} onChange={(e) => setRank(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">All ranks</option>
                {RANKS.map((r, i) => (
                  <option key={r} value={i}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <div className="view-toggle phone-only" role="group" aria-label="Layout">
              <button type="button" aria-pressed={view === "cards"} onClick={() => changeView("cards")}>
                Cards
              </button>
              <button type="button" aria-pressed={view === "list"} onClick={() => changeView("list")}>
                List
              </button>
            </div>
            <p className="filter-label">Role</p>
            {roleChips}
            <p className="filter-label">Goal</p>
            {goalChips}
          </div>
        </Dialog>
      ) : null}

      {signInOpen && signInSlot ? (
        <Dialog title="Sign in" onClose={() => setSignInOpen(false)}>
          <div className="signin-dialog">
            <p>Keep your board on every device and any levels you set here come with you.</p>
            {screenshotImport ? (
              <p>
                Once you are in, add screenshots or photos of the in-game <strong>Heroes</strong> tab and every rank fills in at
                once, no typing.
              </p>
            ) : null}
            {signInSlot}
          </div>
        </Dialog>
      ) : null}

      {toast ? (
        <div
          className={`toast with-x${toast.error ? " error" : ""}${toast.action ? " with-action" : ""}`}
          role={toast.error ? "alert" : "status"}
          onMouseEnter={() => setToastHeld(true)}
          onMouseLeave={() => setToastHeld(false)}
          onFocus={() => setToastHeld(true)}
          onBlur={() => setToastHeld(false)}
        >
          <span>{toast.text}</span>
          {toast.action ? (
            <button type="button" className="btn small primary" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          ) : null}
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      ) : null}

      {shareOpen ? (
        <Suspense fallback={null}>
          <ShareSheet rows={rows} from={shareOpen} onClose={() => setShareOpen(null)} />
        </Suspense>
      ) : null}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </svg>
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
