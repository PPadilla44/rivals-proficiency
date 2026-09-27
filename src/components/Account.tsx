"use client";

import { useState } from "react";
import type { BoardData } from "@/server/board";
import { DEFAULT_POINTS_PER_HOUR } from "@/lib/proficiency";

type Props = {
  link: BoardData["link"];
  busy: boolean;
  onLink: (query: string) => Promise<boolean>;
  onSync: () => Promise<boolean>;
  onUnlink: () => Promise<boolean>;
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function Account({ link, busy, onLink, onSync, onUnlink }: Props) {
  const [query, setQuery] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  if (!link) {
    return (
      <div className="banner account">
        <p>
          <strong>Link your Marvel Rivals account</strong> to see estimated levels from the time you play each hero. Use your
          in-game name or your UID. Your career profile must be public in game.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (query.trim().length >= 2 && (await onLink(query))) setQuery("");
          }}
        >
          <input
            id="rivals-player"
            placeholder="Player name or UID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Marvel Rivals player name or UID"
            autoComplete="off"
          />
          <button className="btn primary" disabled={busy || query.trim().length < 2}>
            {busy ? "Linking" : "Link"}
          </button>
        </form>
      </div>
    );
  }

  const learning = link.pointsPerHour == null;
  return (
    <div className="banner account">
      <div className="acct-meta">
        <span>
          Linked to <b>{link.rivalsName}</b> <span>(UID {link.rivalsUid})</span>
        </span>
        <span>
          Last sync <b>{ago(link.lastSyncAt)}</b>
        </span>
        <span title="Proficiency points per hour of play. Updates each time you correct a level after playing.">
          Your pace <b>{Math.round(link.pointsPerHour ?? DEFAULT_POINTS_PER_HOUR)} pts/h</b>
          {learning ? " (default until you correct a level)" : ""}
        </span>
      </div>
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={() => void onSync()}>
          {busy ? "Syncing" : "Sync playtime"}
        </button>
        {confirmUnlink ? (
          <>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                await onUnlink();
                setConfirmUnlink(false);
              }}
            >
              Confirm unlink
            </button>
            <button className="btn" onClick={() => setConfirmUnlink(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => setConfirmUnlink(true)}>
            Unlink
          </button>
        )}
      </div>
    </div>
  );
}
