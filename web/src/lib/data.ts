"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { publicClient, readHouseParams, readMintStats } from "./chain";
import { ABI, CONFIG, isDeployed } from "./config";

export type MintStats = Awaited<ReturnType<typeof readMintStats>>;
export type HouseParams = Awaited<ReturnType<typeof readHouseParams>>;

function useLoad<T>(fn: () => Promise<T>, everyMs: number, enabled = true, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const run = async () => { try { const d = await fn(); if (live) { setData(d); setError(false); } } catch { if (live) setError(true); } };
    void run();
    const t = everyMs > 0 ? setInterval(() => { if (!document.hidden) void run(); }, everyMs) : undefined;
    return () => { live = false; if (t) clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everyMs, enabled, ...deps]);
  return { data, error };
}

export const useMintStats = (everyMs = 15000) => useLoad(() => readMintStats(), everyMs, isDeployed);
export const useHouseParams = (everyMs = 15000) => useLoad(() => readHouseParams(), everyMs, isDeployed);

/** How many sponsored mints a wallet has used. */
export function useSponsoredUsed(address?: Address) {
  return useLoad(async () => Number((await publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: "sponsoredMints", args: [address!] })) as bigint), 20000, isDeployed && !!address, [address]);
}

export interface EvmWindow { found?: boolean; live?: boolean; remaining_txs?: string | number; remaining_blocks?: string | number; allowed_targets?: string[]; allowedTargets?: string[]; [k: string]: unknown }
/** The wallet's EVM authorisation window, read through the app's proxy of the diana REST API. */
export function useEvmWindow(address?: Address, enabled = true) {
  return useLoad<EvmWindow>(async () => { const r = await fetch(`/api/window/${address}`, { cache: "no-store" }); return r.json(); }, 15000, enabled && !!address, [address]);
}

export function useQorBalance(address?: Address) {
  return useLoad(async () => publicClient.getBalance({ address: address! }), 12000, !!address, [address]);
}

export const qor = (wei: bigint | number | undefined, digits = 2) => (wei === undefined ? "…" : (Number(wei) / 1e18).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
export const blocksToSeconds = (blocks: bigint | number) => Math.max(0, Math.round(Number(blocks) * CONFIG.secondsPerBlock));
export function fmtDuration(sec: number) {
  if (sec < 60) return `${sec} s`;
  return `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, "0")} s`;
}
