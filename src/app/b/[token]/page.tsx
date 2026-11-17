import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "@/db";
import AnswerCard from "@/components/AnswerCard";
import { BoardCta, BoardViewEvent, ReportBoard } from "@/components/BoardLinkTracker";
import { HeroLineStatic } from "@/components/HeroViews";
import { buildRows } from "@/lib/board-model";
import { DEFAULT_BOARD_NAME } from "@/lib/board-name";
import { getHeroPortraits } from "@/lib/portraits";
import { CHAMPION, LORD } from "@/lib/proficiency";
import { getPublicBoard } from "@/server/public-board";

const load = cache(async (token: string) => getPublicBoard(getDb(), token));

// Private by design: never in search results, and the address says nothing about who it belongs to.
const NOT_INDEXED = { index: false, follow: false } as const;

export async function generateMetadata({ params }: PageProps<"/b/[token]">): Promise<Metadata> {
  await connection();
  const { token } = await params;
  const board = await load(token);
  if (!board) return { title: "Board not found", robots: NOT_INDEXED };
  return {
    title: board.boardName ? `${board.boardName}'s Marvel Rivals board` : "A Marvel Rivals proficiency board",
    description: "A read-only copy of a Marvel Rivals hero proficiency board, made with Proficiency Board.",
    robots: NOT_INDEXED,
  };
}

export default async function PublicBoardPage({ params }: PageProps<"/b/[token]">) {
  await connection(); // always per request: a link can be switched off at any moment
  const { token } = await params;
  const board = await load(token);
  if (!board) notFound();

  const portraits = await getHeroPortraits();
  const rows = buildRows(
    Object.fromEntries(Object.entries(board.levels).map(([id, level]) => [id, { level, baselinePlaytimeSec: null }])),
    {},
    { linked: false, pointsPerHour: null },
  );
  const started = rows.filter((r) => r.level > 1).sort((a, b) => b.level - a.level || a.order - b.order);
  const notStarted = rows.length - started.length;
  const lord = rows.filter((r) => r.effective >= LORD).length;
  const champs = rows.filter((r) => r.effective >= CHAMPION).length;
  const name = board.boardName ?? DEFAULT_BOARD_NAME;

  return (
    <div className="wrap">
      <BoardViewEvent />
      <header className="top">
        <div>
          <h1 className="page-title">{board.boardName ? `${board.boardName}'s board` : `${DEFAULT_BOARD_NAME}'s board`}</h1>
          <p className="pub-sub">
            {started.length === 0
              ? "No heroes set yet"
              : `${started.length} ${started.length === 1 ? "hero" : "heroes"} set · ${lord} at Lord or higher${champs ? ` · ${champs} at Champion` : ""}`}
          </p>
        </div>
      </header>

      {started.length > 0 ? (
        <>
          <AnswerCard rows={rows} linked={false} kind="own" anyLevel />
          <section className="list" aria-label={`${name}'s heroes`} style={{ marginTop: 18 }}>
            {started.map((r) => (
              <HeroLineStatic key={r.id} row={r} portrait={portraits[r.id]} />
            ))}
            {notStarted > 0 ? (
              <p className="pub-more">{notStarted} more {notStarted === 1 ? "hero is" : "heroes are"} still at level 1.</p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="panel" aria-label="Empty board">
          <p className="pub-sub">This player has not set any hero levels yet. Check back later.</p>
        </section>
      )}

      <section className="panel pub-cta" aria-label="Start your own board">
        <p>
          <b>This is a read-only copy.</b> Proficiency Board is a free, fan-made tracker: see which of your heroes are closest to Lord and Champion, and the hours left.
        </p>
        <BoardCta />
      </section>
      <p className="pub-note">
        Only hero levels and the name above are shown. Something wrong with this page? <ReportBoard />
      </p>
    </div>
  );
}
