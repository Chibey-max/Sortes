"use client";

import { useEffect, useState } from "react";
import { readLots, readMintStats, readRequest, type Lot } from "./chain";
import { isDeployed } from "./config";
import { Status } from "./protocol";

export interface LotRow { n: number; lot: Lot; status: Status; result?: string; block?: bigint }

/** The newest `count` lots with their request status, newest first. Polls. */
export function useRecentLots(count: number, everyMs = 20000) {
  const [rows, setRows] = useState<LotRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!isDeployed) { setRows([]); setTotal(0); return; }
    let live = true;
    const load = async () => {
      try {
        const { total: t } = await readMintStats();
        const n = Number(t);
        const ids = Array.from({ length: Math.min(count, n) }, (_, i) => BigInt(n - i));
        const lots = await readLots(ids);
        const reqs = await Promise.all(lots.map((l) => readRequest(l.requestId).catch(() => undefined)));
        if (!live) return;
        setTotal(n);
        setRows(lots.map((lot, i) => ({ n: Number(lot.tokenId), lot, status: (reqs[i]?.status ?? 0) as Status, result: reqs[i]?.result, block: reqs[i]?.requestBlock })));
      } catch { if (live) { setRows((r) => r ?? []); } }
    };
    void load();
    const t = setInterval(load, everyMs);
    return () => { live = false; clearInterval(t); };
  }, [count, everyMs]);
  return { rows, total };
}
