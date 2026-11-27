"use client";

import { useEffect, useState } from "react";
import { publicClient } from "./chain";

/** Latest block number, polled. `null` until the first answer; `error` when the RPC does not answer. */
export function useHead(everyMs = 6000) {
  const [head, setHead] = useState<bigint | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      try { const b = await publicClient.getBlockNumber(); if (live) { setHead(b); setError(false); } }
      catch { if (live) setError(true); }
    };
    void tick();
    const t = setInterval(() => { if (!document.hidden) void tick(); }, everyMs);
    return () => { live = false; clearInterval(t); };
  }, [everyMs]);
  return { head, error };
}

export const short = (a?: string, l = 6, r = 4) => (a ? `${a.slice(0, l)}…${a.slice(-r)}` : "");
export const num = (n: bigint | number) => Number(n).toLocaleString("en-US");
