"use client";

import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/actions";

/** Two-step delete: open the panel, type DELETE, confirm. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  }

  return (
    <form
      className="danger-zone"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await deleteAccountAction(text.trim());
          if (res && !res.ok) setError(res.error);
        });
      }}
    >
      <p>
        This removes your account, every hero level, your linked Marvel Rivals player and your synced playtime. It cannot be
        undone. Levels saved in this browser as a guest are not touched.
      </p>
      <label htmlFor="confirm-delete">
        Type <strong>DELETE</strong> to confirm
      </label>
      <div className="danger-row">
        <input
          id="confirm-delete"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button className="btn danger" disabled={pending || text.trim() !== "DELETE"}>
          {pending ? "Deleting" : "Delete forever"}
        </button>
        <button type="button" className="btn" onClick={() => { setOpen(false); setText(""); setError(null); }}>
          Cancel
        </button>
      </div>
      {error ? <p className="danger-error" role="alert">{error}</p> : null}
    </form>
  );
}
