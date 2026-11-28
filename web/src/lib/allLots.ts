"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { getLogsChunked, ownerOf, publicClient, readLot, readMintStats } from "./chain";
import { CONFIG, isDeployed } from "./config";

export interface GalleryLot { n: number; finalized: boolean; floor: boolean; traits: number[]; owner: Address; sponsored: boolean }

/** Kept for House page and others that still scan events. */
export async function logsChunked(event: any, address: Address, from: bigint, to: bigint) {
  return getLogsChunked({ address, event, fromBlock: from, toBlock: to });
}

let cache: { n: number; lots: GalleryLot[] } | null = null;

/**
 * Every minted lot, from contract storage (totalMinted + lotOf + ownerOf).
 * Event logs on diana fail for wide ranges, so the gallery cannot depend on them.
 */
export async function loadAllLots(): Promise<GalleryLot[]> {
  const { total } = await readMintStats();
  const n = Number(total);
  if (cache && cache.n === n && cache.lots.every((l) => l.finalized)) return cache.lots;
  const rows = await Promise.all(Array.from({ length: n }, async (_, i) => {
    const id = BigInt(i + 1);
    const [lot, owner] = await Promise.all([readLot(id), ownerOf(id)]);
    return {
      n: i + 1,
      finalized: lot.finalized,
      floor: lot.isFloor,
      traits: lot.traits,
      owner: (owner ?? "0x0000000000000000000000000000000000000000") as Address,
      sponsored: lot.sponsored,
    };
  }));
  const lots = rows.sort((a, b) => b.n - a.n);
  cache = { n, lots };
  return lots;
}

export function useAllLots(everyMs = 20000) {
  const [lots, setLots] = useState<GalleryLot[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isDeployed) { setLots([]); return; }
    let live = true;
    const run = async () => { try { const l = await loadAllLots(); if (live) { setLots(l); setError(false); } } catch { if (live) setError(true); } };
    void run();
    const t = setInterval(() => { if (!document.hidden) void run(); }, everyMs);
    return () => { live = false; clearInterval(t); };
  }, [everyMs]);
  return { lots, error };
}

export { publicClient, CONFIG };
