"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { BOARD_LINK_OPEN_EVENT, type BoardLinkSource } from "@/lib/board-link-open";

const BoardLinkSheet = lazy(() => import("./BoardLinkSheet"));

/** Listens for openBoardLink() and loads the dialog only when someone asks for it. */
export default function BoardLinkHost() {
  const [req, setReq] = useState<{ n: number; from: BoardLinkSource } | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const from = (e as CustomEvent<{ from?: BoardLinkSource }>).detail?.from ?? "menu";
      setReq((r) => ({ n: (r?.n ?? 0) + 1, from }));
    };
    window.addEventListener(BOARD_LINK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(BOARD_LINK_OPEN_EVENT, onOpen);
  }, []);
  const close = useCallback(() => setReq(null), []);
  if (!req) return null;
  return (
    <Suspense fallback={null}>
      <BoardLinkSheet key={req.n} from={req.from} onClose={close} />
    </Suspense>
  );
}
