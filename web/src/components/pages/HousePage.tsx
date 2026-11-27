"use client";

import { useEffect, useState } from "react";
import { keccak256, parseAbiItem, decodeAbiParameters, encodeFunctionData, type Hex } from "viem";
import { HouseView } from "@/design/views/HouseView";
import { publicClient, blockTime, daemonHealth } from "@/lib/chain";
import { CONFIG, isDeployed } from "@/lib/config";
import { logsChunked } from "@/lib/allLots";
import { qor, useHouseParams } from "@/lib/data";
import { num, short, useHead } from "@/lib/live";
import { useTheme } from "@/lib/theme";
import { useWallet } from "@/lib/wallet";

const EV = {
  revealed: parseAbiItem("event HouseRevealed(uint256 indexed id, bytes32 value, bytes32 lockHash)"),
  timedOut: parseAbiItem("event TimedOut(uint256 indexed id, uint8 status)"),
  withdrawn: parseAbiItem("event Withdrawn(address indexed to, uint256 amount)"),
  rotated: parseAbiItem("event AnchorRotated(bytes32 anchor, uint64 chainLength)"),
  enrolled: parseAbiItem("event Enrolled(bytes32 anchor, uint64 chainLength, uint256 bond)"),
  bond: parseAbiItem("event BondAdded(address indexed from, uint256 amount)"),
  payout: parseAbiItem("event PayoutChanged(address payout)"),
};
const KEY_STATUS = "0x0000000000000000000000000000000000000a02" as const;
const KEY_ABI = [{ type: "function", name: "pqcKeyStatus", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "registered", type: "bool" }, { name: "algorithmId", type: "uint8" }, { name: "pubkey", type: "bytes" }] }] as const;

interface Ev { kind: string; block: bigint; amount?: bigint; status?: number }

export function HousePage() {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const params = useHouseParams().data;
  const { head } = useHead(8000);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [fp, setFp] = useState<string>();
  const [lastReveal, setLastReveal] = useState<number>();
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    if (!isDeployed) { setEvents([]); return; }
    let live = true;
    const load = async () => {
      try {
        const to = await publicClient.getBlockNumber();
        const from = CONFIG.fromBlock;
        const get = (e: any) => logsChunked(e, CONFIG.house, from, to);
        const [rv, to2, wd, ro, en, bd, po] = await Promise.all(Object.values(EV).map(get));
        const out: Ev[] = [
          ...rv.map((l: any) => ({ kind: "revealed", block: l.blockNumber })),
          ...to2.map((l: any) => ({ kind: "timeout", block: l.blockNumber, status: Number(l.args.status) })),
          ...wd.map((l: any) => ({ kind: "withdraw", block: l.blockNumber, amount: l.args.amount })),
          ...ro.map((l: any) => ({ kind: "rotate", block: l.blockNumber })),
          ...en.map((l: any) => ({ kind: "enroll", block: l.blockNumber, amount: l.args.bond })),
          ...bd.map((l: any) => ({ kind: "bond", block: l.blockNumber, amount: l.args.amount })),
          ...po.map((l: any) => ({ kind: "payout", block: l.blockNumber })),
        ].sort((a, b) => Number(b.block - a.block));
        if (!live) return;
        setEvents(out);
        const lastRv = out.find((e) => e.kind === "revealed");
        if (lastRv) blockTime(lastRv.block).then((t) => live && setLastReveal(Math.max(0, Math.round(Date.now() / 1000 - t)))).catch(() => {});
      } catch { if (live) setEvents((e) => e ?? []); }
      daemonHealth().then((h) => live && setHealth(h));
    };
    void load();
    const t = setInterval(load, 20000);
    return () => { live = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!isDeployed || !params?.house) return;
    publicClient.call({ to: KEY_STATUS, data: encodeFunctionData({ abi: KEY_ABI, functionName: "pqcKeyStatus", args: [params.house as Hex] }) }).then((r) => {
      if (!r.data) return;
      const [, , pk] = decodeAbiParameters(KEY_ABI[0].outputs, r.data);
      const h = keccak256(pk as Hex).slice(2, 26).match(/.{4}/g)!.join(" ");
      setFp(`keccak:${h}`);
    }).catch(() => {});
  }, [params?.house]);

  const P = params;
  const ev = events ?? [];
  const reveals = ev.filter((e) => e.kind === "revealed").length;
  const missed = ev.filter((e) => e.kind === "timeout" && e.status === 4).length;
  const penalty = P ? (P.PENALTY as bigint) : 0n;
  const hourBlocks = 2517n; // 3,600 s at 1.43 s per block
  const bars = Array.from({ length: 24 }, (_, i) => {
    if (head === null) return { n: 0, m: 0 };
    const hi = head - BigInt(23 - i) * hourBlocks + hourBlocks, lo = hi - hourBlocks;
    return { n: ev.filter((e) => e.kind === "revealed" && e.block > lo && e.block <= hi).length, m: ev.filter((e) => e.kind === "timeout" && e.status === 4 && e.block > lo && e.block <= hi).length };
  });
  const maxBar = Math.max(1, ...bars.map((b) => b.n));
  const used = P ? Number(P.lastPos) : 0, len = P ? Number(P.chainLength) : 0;
  const rowOf = (e: Ev) => {
    const b = `#${num(e.block)}`;
    if (e.kind === "revealed") return { a: "House reveal", v: "0", b, s: "on time", c: "var(--ok)" };
    if (e.kind === "timeout") return { a: e.status === 4 ? "House missed a reveal" : "User missed a reveal", v: e.status === 4 ? `${qor(penalty, 0)} QOR penalty` : "0", b, s: e.status === 4 ? "paid to user" : "floor applied", c: e.status === 4 ? "var(--warn)" : "var(--info)" };
    if (e.kind === "withdraw") return { a: "Withdrawal", v: `${qor(e.amount)} QOR`, b, s: "signed ML-DSA-87", c: "var(--info)" };
    if (e.kind === "bond") return { a: "Bond top-up", v: `+${qor(e.amount)} QOR`, b, s: "added", c: "var(--info)" };
    if (e.kind === "enroll") return { a: "Enrolled with a bond", v: `${qor(e.amount)} QOR`, b, s: "signed ML-DSA-87", c: "var(--ok)" };
    if (e.kind === "rotate") return { a: "New hash chain", v: "new anchor", b, s: "signed ML-DSA-87", c: "var(--ok)" };
    return { a: "Payout address changed", v: "", b, s: "signed ML-DSA-87", c: "var(--info)" };
  };
  const age = lastReveal !== undefined ? (lastReveal < 90 ? `${lastReveal} s ago` : `${Math.round(lastReveal / 60)} min ago`) : undefined;
  const v = {
    th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label,
    statusLine: !isDeployed ? "contracts not configured" : health ? (health.ok ? `house online${age ? ` · last reveal ${age}` : ""}` : "house reporting an error") : age ? `last reveal ${age}` : events === null ? "checking…" : "no reveals yet",
    kpis: [
      ["Bond", P ? qor(P.bond as bigint, 0) : "…", "QOR locked"],
      ["Owed if silent", P ? qor((P.openRequests as bigint) * penalty, 0) : "…", "QOR for open draws"],
      ["Paid to users", qor(BigInt(missed) * penalty, 0), "QOR in penalties, all time"],
      ["Reveals on time", reveals + missed ? `${((reveals / (reveals + missed)) * 100).toFixed(1)}%` : "n/a", "all time"],
    ].map((k) => ({ k: k[0], v: k[1], n: k[2] })),
    bars: bars.map((b) => ({ h: b.m ? 100 : b.n ? Math.max(8, Math.round((b.n / maxBar) * 100)) : 4, c: b.m ? "m" : "" })),
    barsLabel: `Reveals per hour over the last 24 hours: ${reveals} in total, ${missed} missed windows`,
    axis: ["24 h ago", "18 h", "12 h", "6 h"],
    linksUsed: `${num(used)} of ${num(len)}`, usedPct: len ? Math.max(0.1, (used / len) * 100).toFixed(2) : "0", root: P ? short(P.anchor as string, 8, 6) : "…", nextLink: `#${num(used + 1)}`, linksLeft: `${num(Math.max(0, len - used))} (a new chain is signed in before it runs out)`,
    rows: ev.slice(0, 6).map(rowOf),
    rules: [["01", "An ML-DSA-87 signature", "Withdrawals, payout changes, new hash chains and pausing all need a fresh post-quantum signature. A stolen ECDSA key moves nothing."], ["02", "A floor that never drops", "The bond cannot fall below the penalties owed to open draws, and the house cannot take on more draws than its bond covers."], ["03", "One use per signature", "Each signed action carries a nonce and this contract's address, so a signature works once and only here."], ["04", "Silence costs the house", "If it misses a reveal, anyone can settle it and the penalty is paid to the user from the bond."]].map((r) => ({ n: r[0], t: r[1], d: r[2] })),
    fingerprint: fp ?? "…",
  };
  return <HouseView v={v} />;
}
