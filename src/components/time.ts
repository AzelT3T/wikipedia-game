"use client";

import { useEffect, useState } from "react";

export function useElapsedMs(startAt?: number, endAt?: number) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!startAt || endAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 100);

    return () => window.clearInterval(timer);
  }, [startAt, endAt]);

  if (!startAt) {
    return 0;
  }

  return Math.max(0, (endAt ?? now) - startAt);
}

export function formatMs(ms: number): string {
  const totalMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const centiseconds = Math.floor((totalMs % 1_000) / 10);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

