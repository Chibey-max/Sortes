"use client";

import { useEffect, useState } from "react";
import { parseAbiItem, type Address } from "viem";
import { publicClient } from "./chain";
import { CONFIG, ABI, isDeployed } from "./config";

export interface GalleryLot { n: number; finalized: boolean; floor: boolean; traits: number[]; owner: Address; sponsored: boolean }

const MINTED = parseAbiItem("event Minted(uint256 indexed tokenId, address indexed to, uint256 indexed requestId, bool sponsored)");
const REVEALED = parseAbiItem("event Revealed(uint256 indexed tokenId, uint8[5] traits, bool floor)");

/** getLogs over a long range; if the RPC refuses a wide range, walk it in chunks. */
export async function logsChunked(event: any, address: Address, from: bigint, to: bigint) {
  try { return await publicClient.getLogs({ address, event, fromBlock: from, toBlock: to }); }
  catch {
    const out: any[] = [];
    const step = 50_000n;
    for (let a = from; a <= to; a += step) {
      const b = a + step - 1n > to ? to : a + step - 1n;
      out.push(...(await publicClient.getLogs({ address, event, fromBlock: a, toBlock: b })));
    }
    return out;
  }
}

/** Every lot ever minted, from two event queries: Minted (who) and Revealed (traits). */
export async function loadAllLots(): Promise<GalleryLot[]> {
  const head = await publicClient.getBlockNumber();
  const [minted, revealed] = await Promise.all([logsChunked(MINTED, CONFIG.mint, CONFIG.fromBlock, head), logsChunked(REVEALED, CONFIG.mint, CONFIG.fromBlock, head)]);
  const rev = new Map<number, { traits: number[]; floor: boolean }>();
  for (const l of revealed) rev.set(Number(l.args.tokenId), { traits: (l.args.traits as readonly number[]).map(Number), floor: !!l.args.floor });
  return minted
    .map((l: any) => { const n = Number(l.args.tokenId); const r = rev.get(n); return { n, finalized: !!r, floor: r?.floor ?? false, traits: r?.traits ?? [0, 0, 0, 0, 0], owner: l.args.to as Address, sponsored: !!l.args.sponsored }; })
    .sort((a: GalleryLot, b: GalleryLot) => b.n - a.n);
}

export function useAllLots(everyMs = 20000) {
  const [lots, setLots] = useState<GalleryLot[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!isDeployed) { setLots([]); return; }
    let live = true;
    const run = async () => { try { const l = await loadAllLots(); if (live) { setLots(l); setError(false); } } catch { if (live) setError(true); } };
    void run();
    const t = setInterval(run, everyMs);
    return () => { live = false; clearInterval(t); };
  }, [everyMs]);
  return { lots, error };
}

export { ABI };
