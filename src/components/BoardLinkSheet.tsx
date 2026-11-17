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
  const [copied, setCopied] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const keepBtn = useRef<HTMLButtonElement>(null);
  const newBtn = useRef<HTMLButtonElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const noteId = useId();

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
  const nameLen = [...name].length;

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  // The confirm opens with focus on the safe choice; closing it puts focus back on what opened it.
  const askedBefore = useRef(false);
  useEffect(() => {
    if (askNew) {
      askedBefore.current = true;
      keepBtn.current?.focus();
    } else if (askedBefore.current) newBtn.current?.focus();
  }, [askNew]);

  /** Runs a change on the server. Returns true when it was saved. */
  async function run(fn: () => ReturnType<typeof boardLinkAction>, action: string, after?: (l: BoardLink | null) => string | null): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setNote(null);
    let ok = false;
    try {
      const res = await fn();
      if (res.ok) {
        ok = true;
        setLink(res.link);
        setName(res.link?.boardName ?? "");
        track("board_link", { action, from });
        setNote(after ? after(res.link) : null);
      } else setError(res.error);
    } catch {
      setError("That didn't work. Check your connection and try again.");
    }
    setBusy(false);
    return ok;
  }

  const toggle = (next: boolean) => run(() => setBoardLinkEnabledAction(next), next ? "on" : "off", () => (next ? null : "Link is off. Nobody can open it."));

  async function saveName(): Promise<boolean> {
    const cleaned = cleanBoardName(name);
    if (!cleaned.ok) {
      setNameError(cleaned.error);
      return false;
    }
    setNameError(null);
    const ok = await run(() => setBoardNameAction(cleaned.name), "name");
    if (ok) setNameSaved(true);
    return ok;
  }

  /**
   * From the Share sheet the player has already said they want to share: one tap turns the link on and
   * copies it (or opens the phone share sheet). If the browser refuses the copy because the tap is too
   * old, the link is on and shown, and the buttons are right there.
   */
  async function turnOnAndSend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await setBoardLinkEnabledAction(true);
      if (!res.ok || !res.link) {
        setError(res.ok ? "That didn't work. Try again." : res.error);
        setBusy(false);
        return;
      }
      setLink(res.link);
      setName(res.link.boardName ?? "");
      track("board_link", { action: "on", from });
      const fresh = boardLinkUrl(window.location.origin, res.link.token);
      try {
        if (canShare) {
          await navigator.share({ url: fresh, title: "My Marvel Rivals board" });
          track("board_link", { action: "share", from });
        } else {
          await navigator.clipboard.writeText(fresh);
          track("board_link", { action: "copy", from });
          setCopied(true);
          if (copiedTimer.current) clearTimeout(copiedTimer.current);
          copiedTimer.current = setTimeout(() => setCopied(false), 2000);
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setNote(`Your link is on. Press ${canShare ? "Share link" : "Copy link"} to send it.`);
      }
    } catch {
      setError("That didn't work. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function saveAndClose() {
    if (await saveName()) onClose();
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      track("board_link", { action: "copy", from });
      setNote(null);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
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
  const quick = ready && from === "share" && !on;
  const copyBtn = (
    <button type="button" className={canShare ? "btn" : "btn primary"} disabled={!on || busy} onClick={() => void copy()}>
      {copied ? "Copied" : "Copy link"}
    </button>
  );

  return (
    <Dialog
      title="Board link"
      onClose={onClose}
      dirty={ready && nameDirty}
      busy={busy}
      footer={
        ready && nameDirty ? (
          <button type="button" className="btn primary" disabled={busy} onClick={() => void saveAndClose()}>
            Save and close
          </button>
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        )
      }
    >
      {load.kind === "loading" ? (
        <p className="bl-note">Loading…</p>
      ) : load.kind === "guest" ? (
        <div className="bl-body">
          <p>A board link lets friends see your hero levels without signing in. Sign in so only you can turn it on, off or change it.</p>
          <button type="button" className="btn primary" onClick={() => { onClose(); openSignIn(); }}>
            Sign in to get a link
          </button>
        </div>
      ) : load.kind === "error" ? (
        <p className="fb-error" role="alert">{load.error}</p>
      ) : (
        <div className="bl-body">
          {quick ? (
            <div className="bl-quick">
              <p>Anyone with the link sees your hero levels and board name. Nothing else. You can turn it off any time.</p>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void turnOnAndSend()}>
                {canShare ? "Turn on and share link" : "Turn on and copy link"}
              </button>
            </div>
          ) : null}
          <label className="bl-switch">
            <input type="checkbox" role="switch" checked={on} disabled={busy} aria-describedby={noteId} onChange={(e) => void toggle(e.target.checked)} />
            <span className="bl-track" aria-hidden="true"><span /></span>
            <span className="bl-label">Share a read-only link to my board</span>
            <span className={`bl-state${on ? " on" : ""}`} aria-hidden="true">{on ? "On" : "Off"}</span>
          </label>
          <p className="bl-note" id={noteId}>
            {on
              ? "Anyone with this link sees your hero levels and board name. Nothing else. Turn it off and the link stops working right away."
              : "Off. Your board is private. Turn it on to get a link you can send to friends."}
          </p>

          {link?.token ? (
            <div className={`bl-link${on ? "" : " off"}`}>
              <label className="fb-field">
                <span>Your board link{on ? "" : " (off)"}</span>
                <input ref={field} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <div className="bl-row">
                {canShare ? (
                  <button type="button" className="btn primary" disabled={!on || busy} onClick={() => void shareLink()}>
                    Share link
                  </button>
                ) : null}
                {copyBtn}
                {on ? (
                  <a className="btn" href={url} target="_blank" rel="noreferrer">
                    Open your page
                  </a>
                ) : null}
              </div>
              {askNew ? (
                <div className="bl-ask" role="group" aria-label="Make a new link">
                  <p>The old link stops working. Anyone who has it will see a not found page.</p>
                  <div className="bl-row">
                    <button type="button" className="btn danger" disabled={busy} onClick={() => { setAskNew(false); void run(() => regenerateBoardLinkAction(), "new", () => "New link ready. The old one no longer works."); }}>
                      Make a new link
                    </button>
                    <button type="button" className="btn" ref={keepBtn} onClick={() => setAskNew(false)}>
                      Keep the old one
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="linkish bl-new" ref={newBtn} disabled={busy} onClick={() => setAskNew(true)}>
                  Make a new link…
                </button>
              )}
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
                maxLength={BOARD_NAME_MAX}
                placeholder={DEFAULT_BOARD_NAME}
                onChange={(e) => { setName(e.target.value); setNameSaved(false); if (nameError) setNameError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveName(); } }}
                autoComplete="off"
              />
              <button type="button" className="btn" disabled={busy || !nameDirty} onClick={() => void saveName()}>
                Save
              </button>
            </div>
            <small className={`bl-hint${nameError ? " bad" : ""}`}>
              <span>
                {nameError ?? (nameSaved && !nameDirty ? "Saved. Shown on your page." : "Your sign-in name is never shown. Leave blank to show “A player”.")}
              </span>
              <span className="bl-count" aria-hidden="true">{nameLen}/{BOARD_NAME_MAX}</span>
            </small>
          </div>

          <p className={`bl-status${error ? " bad" : ""}`} role="status">{error ?? note}</p>
        </div>
      )}
    </Dialog>
  );
}
