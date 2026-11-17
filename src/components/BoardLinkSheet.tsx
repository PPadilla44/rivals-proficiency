"use client";

import { useEffect, useId, useRef, useState } from "react";
import { boardLinkAction, regenerateBoardLinkAction, setBoardLinkEnabledAction, setBoardNameAction } from "@/app/actions";
import { BOARD_NAME_MAX, DEFAULT_BOARD_NAME, cleanBoardName } from "@/lib/board-name";
import { boardLinkUrl, type BoardLinkSource } from "@/lib/board-link-open";
import { openSignIn } from "@/lib/signin-open";
import { track } from "@/lib/track";
import type { BoardLink } from "@/server/public-board";
import Dialog from "./Dialog";

type Load = { kind: "loading" } | { kind: "guest" } | { kind: "error"; error: string } | { kind: "ready" };

/**
 * Turn a read-only link to your board on or off, copy it, name it, or replace it.
 * Only hero levels and the optional name are visible to anyone with the link.
 */
export default function BoardLinkSheet({ from, onClose }: { from: BoardLinkSource; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [link, setLink] = useState<BoardLink | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askNew, setAskNew] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const nameId = useId();

  useEffect(() => {
    let live = true;
    track("board_link", { action: "open", from });
    boardLinkAction()
      .then((res) => {
        if (!live) return;
        if (!res.ok) {
          setLoad(res.error.startsWith("Sign in") ? { kind: "guest" } : { kind: "error", error: res.error });
          return;
        }
        setLink(res.link);
        setName(res.link?.boardName ?? "");
        setLoad({ kind: "ready" });
      })
      .catch(() => live && setLoad({ kind: "error", error: "That didn't load. Check your connection and try again." }));
    return () => {
      live = false;
    };
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const url = link?.token ? boardLinkUrl(window.location.origin, link.token) : "";
  const savedName = link?.boardName ?? "";
  const nameDirty = name.trim() !== savedName;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  async function run(fn: () => ReturnType<typeof boardLinkAction>, action: string, after?: (l: BoardLink | null) => string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fn();
      if (res.ok) {
        setLink(res.link);
        setName(res.link?.boardName ?? "");
        track("board_link", { action, from });
        setNote(after ? after(res.link) : null);
      } else setError(res.error);
    } catch {
      setError("That didn't work. Check your connection and try again.");
    }
    setBusy(false);
  }

  const toggle = (on: boolean) => run(() => setBoardLinkEnabledAction(on), on ? "on" : "off", (l) => (on ? null : l ? "Link is off. Nobody can open it." : null));

  async function saveName() {
    const cleaned = cleanBoardName(name);
    if (!cleaned.ok) {
      setNameError(cleaned.error);
      return;
    }
    setNameError(null);
    await run(() => setBoardNameAction(cleaned.name), "name", () => "Name saved.");
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      track("board_link", { action: "copy", from });
      setNote("Link copied.");
    } catch {
      // No clipboard permission: select the text so Ctrl or long-press copies it.
      field.current?.focus();
      field.current?.select();
      setNote("Your browser wouldn't copy it. The link is selected, so copy it by hand.");
    }
  }

  async function shareLink() {
    try {
      await navigator.share({ url, title: "My Marvel Rivals board" });
      track("board_link", { action: "share", from });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") void copy();
    }
  }

  const on = !!link?.enabled;
  const ready = load.kind === "ready";

  return (
    <Dialog
      title="Board link"
      onClose={onClose}
      dirty={ready && nameDirty}
      busy={busy}
      footer={
        <button type="button" className={load.kind === "guest" ? "btn" : "btn primary"} onClick={onClose}>
          Done
        </button>
      }
    >
      {load.kind === "loading" ? (
        <p className="bl-note">Loading…</p>
      ) : load.kind === "guest" ? (
        <div className="bl-body">
          <p>A board link lets friends see your hero levels without signing in. You need an account first, so it stays yours.</p>
          <button type="button" className="btn primary" onClick={() => { onClose(); openSignIn(); }}>
            Sign in to get a link
          </button>
        </div>
      ) : load.kind === "error" ? (
        <p className="fb-error" role="alert">{load.error}</p>
      ) : (
        <div className="bl-body">
          <label className="bl-switch">
            <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
            <span className="bl-track" aria-hidden="true"><span /></span>
            <span>Share a read-only link to my board</span>
          </label>
          <p className="bl-note">
            {on
              ? "Anyone with the link can see your hero levels and the name below. Nothing else. Turn this off and it stops working at once."
              : "Off. Nobody can see your board. Turn it on to get a link you can send to friends."}
          </p>

          {link?.token ? (
            <div className={`bl-link${on ? "" : " off"}`}>
              <label className="fb-field">
                <span>Your link{on ? "" : " (off)"}</span>
                <input ref={field} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <div className="bl-row">
                <button type="button" className="btn primary" disabled={!on || busy} onClick={() => void copy()}>
                  Copy link
                </button>
                {canShare ? (
                  <button type="button" className="btn" disabled={!on || busy} onClick={() => void shareLink()}>
                    Share link
                  </button>
                ) : null}
                {on ? (
                  <a className="btn" href={url} target="_blank" rel="noreferrer">
                    Open your page
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="fb-field">
            <label htmlFor={nameId}>
              Board name <em>(optional, shown on the page)</em>
            </label>
            <div className="bl-row">
              <input
                id={nameId}
                value={name}
                maxLength={BOARD_NAME_MAX + 10}
                placeholder={DEFAULT_BOARD_NAME}
                onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveName(); } }}
                autoComplete="off"
              />
              <button type="button" className="btn" disabled={busy || !nameDirty} onClick={() => void saveName()}>
                Save
              </button>
            </div>
            <small className={nameError ? "bad" : ""}>{nameError ?? "Never your sign-in name. Empty shows “A player”."}</small>
          </div>

          {link?.token ? (
            askNew ? (
              <div className="bl-ask" role="group" aria-label="Make a new link">
                <p>The old link stops working. Anyone who has it will see a not found page.</p>
                <div className="bl-row">
                  <button type="button" className="btn danger" disabled={busy} onClick={() => { setAskNew(false); void run(() => regenerateBoardLinkAction(), "new", () => "New link ready. The old one no longer works."); }}>
                    Make a new link
                  </button>
                  <button type="button" className="btn" onClick={() => setAskNew(false)}>
                    Keep the old one
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn small bl-new" disabled={busy} onClick={() => setAskNew(true)}>
                New link
              </button>
            )
          ) : null}

          {error ? <p className="fb-error" role="alert">{error}</p> : null}
          <p className="bl-status" role="status">{note}</p>
        </div>
      )}
    </Dialog>
  );
}
