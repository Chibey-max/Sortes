"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { decodeErrorResult, toFunctionSelector, type Hex } from "viem";
import { VerifyView } from "@/design/views/VerifyView";
import { publicClient } from "@/lib/chain";
import { ABI, CONFIG, isDeployed } from "@/lib/config";
import { useAllLots } from "@/lib/allLots";
import { highlight } from "@/lib/code";
import { Status, STATUS_LABEL } from "@/lib/protocol";
import { TIERS, artProps, tierOf } from "@/lib/traits";
import { short } from "@/lib/live";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import { useWallet } from "@/lib/wallet";
import { verify, type Verification } from "@/lib/verify";
import type { AttackResult } from "@/lib/attacks";

type Mode = "idle" | "running" | "pass" | "fail";
const WHAT: [string, string, string][] = [
  ["01", "House chain", "The house committed to a chain of hashes in advance. Each reveal must hash, step by step, to the anchor on chain."],
  ["02", "Your secret", "Your reveal must hash, with your address and the mint contract, to the commitment you sent."],
  ["03", "Lock block", "The lock hash must be the hash of the block two blocks after your commit. Diana does not serve block hashes to contracts, so it reads zero there and the result uses two inputs."],
  ["04", "Result hash", "The result is the hash of all the inputs. We recompute it here."],
  ["05", "Traits", "Each trait is rolled from the result with fixed odds. We recompute all five."],
  ["06", "Deadlines", "If a side missed its window, the floor rules must have been applied."],
];
const FORMULAS = `commit = keccak256(abi.encode("SORTES-COMMIT-v1",
  secret, beneficiary, consumer, chainId))

result = keccak256(abi.encode("SORTES-RESULT-v1",
  houseValue, secret, lockHash, requestId, house, chainId))

keccak256 applied \`position\` times to houseValue == anchor

roll_i = keccak256(abi.encode(result, i)) % 10000   // traits`;

const errName = (data?: Hex) => {
  if (!data || data.length < 10) return undefined;
  try { return decodeErrorResult({ abi: ABI.house, data }).errorName; } catch {}
  const sel = data.slice(0, 10).toLowerCase();
  const hit = (ABI.house as any[]).filter((x) => x.type === "error").find((x) => toFunctionSelector(`${x.name}(${x.inputs.map((i: any) => i.type).join(",")})`) === sel);
  return hit?.name as string | undefined;
};

function Inner() {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const { lots } = useAllLots(60000);
  const [q, setQ] = useState(sp.get("tx") ?? sp.get("token") ?? sp.get("request") ?? "");
  const [mode, setMode] = useState<Mode>("idle");
  const [res, setRes] = useState<Verification | null>(null);
  const [fail, setFail] = useState<{ title: string; detail: string; tx: string } | null>(null);
  const [err, setErr] = useState<string>();
  const [attacks, setAttacks] = useState<Record<string, AttackResult>>({});
  const first = useRef(true);

  useEffect(() => { fetch("/attacks.json").then((r) => (r.ok ? r.json() : [])).then((l: AttackResult[]) => setAttacks(Object.fromEntries(l.map((x: AttackResult) => [x.name, x])))).catch(() => {}); }, []);

  async function run(input = q) {
    const text = input.trim();
    setErr(undefined); setRes(null); setFail(null);
    if (!text) { setMode("idle"); return; }
    if (!isDeployed) { setErr("Contracts are not configured for this site yet."); setMode("idle"); return; }
    setMode("running");
    try {
      if (/^0x[0-9a-fA-F]{64}$/.test(text)) {
        const rc = await publicClient.getTransactionReceipt({ hash: text as Hex }).catch(() => null);
        if (!rc) throw new Error("No transaction with that hash on diana.");
        if (rc.status === "reverted") {
          const tx = await publicClient.getTransaction({ hash: text as Hex });
          let name: string | undefined;
          try { await publicClient.call({ to: tx.to!, data: tx.input, account: tx.from, blockNumber: rc.blockNumber - 1n }); }
          catch (e: any) { name = errName(e?.cause?.data ?? e?.data ?? e?.cause?.cause?.data) ?? (String(e?.message).match(/custom error (0x[0-9a-f]{8})/)?.[1] && errName(String(e?.message).match(/custom error (0x[0-9a-f]{8})/)![1] as Hex)); }
          setFail({ title: "Rejected transaction", detail: name ?? "reverted", tx: text });
          setMode("fail");
          return;
        }
        const reqLog = rc.logs.find((l: { address: string }) => l.address.toLowerCase() === CONFIG.house.toLowerCase());
        if (!reqLog) throw new Error("That transaction did not touch a Sortes request.");
        const id = BigInt(reqLog.topics[1]!);
        const r = await verify({ requestId: id }); setRes(r); setMode(r.checks.every((c) => c.pass !== false) ? "pass" : "fail");
        return;
      }
      const n = BigInt(text.replace(/^#|^lot\s*#?|^n[º°]\s*/i, "").replace(/\D/g, ""));
      const r = await verify({ tokenId: n }); setRes(r); setMode(r.checks.every((c) => c.pass !== false) ? "pass" : "fail");
    } catch (e: any) { setErr(e?.shortMessage ?? e?.message ?? "Could not check that."); setMode("idle"); }
  }
  useEffect(() => { if (first.current && q) void run(q); first.current = false; /* eslint-disable-next-line */ }, []);

  const newest = lots?.[0], floorLot = lots?.find((l: { finalized: boolean; floor: boolean }) => l.finalized && l.floor);
  const forged = attacks["forged-reveal"]?.tx;
  const go = (value: string) => () => { setQ(value); void run(value); };
  const examples = [
    ...(newest ? [{ t: `#${newest.n} newest`, go: go(String(newest.n)) }] : []),
    ...(floorLot ? [{ t: `#${floorLot.n} floor`, go: go(String(floorLot.n)) }] : []),
    ...(forged ? [{ t: "forged reveal", go: go(forged) }] : []),
  ];

  const idle = mode === "idle", running = mode === "running", failed = mode === "fail";
  const checksRaw = res?.checks ?? [];
  const checks = failed && fail && !res
    ? [{ t: "House chain", d: "The posted value hashes to the wrong link, not to the chain value stored on chain.", v: "mismatch", vc: "var(--bad)", sym: "✕", bg: "var(--bad)", bd: "var(--bad)", ic: "#fff" }, ...["Your secret", "Lock block", "Result hash", "Traits", "Deadlines"].map((t) => ({ t, d: "Not reached: the request never advanced.", v: "skipped", vc: "var(--lab)", sym: "–", bg: "transparent", bd: "var(--line2)", ic: "var(--lab)" }))]
    : checksRaw.map((c, k) => {
        const ok = c.pass === true, bad = c.pass === false;
        return { t: ["House chain", "Your secret", "Lock block", "Result hash", "Traits", "Deadlines"][k] ?? c.name, d: c.detail, v: ok ? "pass" : bad ? "mismatch" : "n/a", vc: bad ? "var(--bad)" : ok ? "var(--mut)" : "var(--lab)", sym: bad ? "✕" : ok ? "✓" : "·", bg: bad ? "var(--bad)" : ok ? "var(--ok)" : "transparent", bd: bad ? "var(--bad)" : ok ? "var(--ok)" : "var(--line2)", ic: bad || ok ? "#fff" : "var(--lab)" };
      });
  const passed = checksRaw.filter((c) => c.pass === true).length;
  const tokenId = res?.tokenId;
  const lotInfo = tokenId !== undefined ? lots?.find((l) => BigInt(l.n) === tokenId) : undefined;
  const ap = lotInfo?.finalized ? artProps(lotInfo.traits) : null;
  const v = {
    th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label,
    q, onQ: (e: any) => setQ(e.target.value), runLabel: running ? "Checking…" : "Verify in this browser",
    run: (ev: any) => { ev?.preventDefault?.(); void run(); router.replace(q ? `/verify?${/^0x/.test(q) ? "tx" : "token"}=${encodeURIComponent(q)}` : "/verify"); },
    examples, isIdle: idle && !err, isFail: failed,
    title: idle ? "Nothing checked yet" : failed && fail ? fail.title : res ? `${tokenId !== undefined ? `Lot #${tokenId}` : `Request #${res.requestId}`}` : "Checking…",
    sum: idle ? (err ?? "waiting for input") : running ? "checking" : failed ? (fail ? `reverted · ${fail.detail}` : `${passed} of ${checksRaw.length} passed`) : `${passed} of ${checksRaw.length} passed`,
    sumC: idle ? (err ? "var(--bad)" : "var(--lab)") : running ? "var(--warn)" : failed ? "var(--bad)" : "var(--ok)",
    checks,
    f: ap?.field ?? "obsidian", g: ap?.glyph ?? "circle", e: ap?.engraving ?? "lines", s: ap?.seal ?? "dots", a: ap?.aura ?? "none", pend: !ap,
    label: failed && fail ? "NO LOT" : tokenId !== undefined ? `LOT #${tokenId}` : "LOT #…",
    lotTier: failed && fail ? "Rejected" : idle ? "No lot yet" : lotInfo?.finalized ? (lotInfo.floor ? "Floor" : TIERS[tierOf(lotInfo.traits)]) : res ? STATUS_LABEL[res.status as Status] : "…",
    lotName: failed && fail ? "No lot was minted" : idle ? "Pick a lot to check" : tokenId !== undefined ? `Lot #${tokenId}` : res ? `Request #${res.requestId}` : "…",
    lotHref: tokenId !== undefined ? `/lot/${tokenId}` : "/gallery",
    formulasHtml: highlight(FORMULAS), copyFormulas: () => { void navigator.clipboard?.writeText(FORMULAS).then(() => toast.push({ c: "var(--ok)", t: "Copied", d: "The formulas are on your clipboard." })); },
    what: WHAT.map((w) => ({ n: w[0], t: w[1], d: w[2] })),
  };
  return <VerifyView v={v} />;
}
export function VerifyPage() { return <Suspense><Inner /></Suspense>; }
