"use client";

import { useEffect, useRef } from "react";

export function usePlaylistReveal(open: boolean, trackId: number | null, grouping: string, search: string) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || trackId === null) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView?.({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, trackId, grouping, search]);
  return listRef;
}
