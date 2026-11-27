"use client";

import { useEffect, useState } from "react";
import { BuildView } from "@/design/views/BuildView";
import { COINFLIP, highlight } from "@/lib/code";
import { ABI, CONFIG, isDeployed } from "@/lib/config";
import { publicClient } from "@/lib/chain";
import { blocksToSeconds, fmtDuration, qor, useHouseParams } from "@/lib/data";
import { short } from "@/lib/live";
import { useTheme } from "@/lib/theme";
import { useWallet } from "@/lib/wallet";

const BROWSER = `import { keccak256, encodeAbiParameters, parseAbiParameters, toHex } from "viem";

const secret = toHex(crypto.getRandomValues(new Uint8Array(32))); // save it BEFORE sending
const commit = keccak256(encodeAbiParameters(
  parseAbiParameters("string, bytes32, address, address, uint256"),
  ["SORTES-COMMIT-v1", secret, player, yourContract, 9800n]));

await wallet.writeContract({ address: yourContract, abi, functionName: "flip", args: [commit], value: fee });
// once the house has revealed, post the secret: POST {daemon}/reveal  { id, secret }
// or send house.revealUser(id, secret) yourself. Anyone may; only the right secret passes.`;

const TOC: [string, string][] = [["quick", "Quickstart"], ["request", "Request a draw"], ["sdk", "From the browser"], ["contracts", "Contracts"], ["events", "Events and errors"], ["fees", "Fees and timeouts"]];

export function BuildPage() {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const params = useHouseParams().data;
  const [renderer, setRenderer] = useState<string>();
  const [active, setActive] = useState("quick");

  useEffect(() => {
    if (!isDeployed) return;
    publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: "renderer", args: [] }).then((a) => setRenderer(a as string)).catch(() => {});
  }, []);
  useEffect(() => {
    const els = TOC.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => { const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (vis) setActive(vis.target.id); }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const w = (n?: bigint | number) => (n === undefined ? "…" : `${n} blocks (about ${fmtDuration(blocksToSeconds(n))})`);
  const row = (n: string, a: string | undefined, d: string) => ({ n, a: a && a !== "0x0000000000000000000000000000000000000000" ? short(a, 8, 6) : "not deployed yet", d });
  const v = {
    th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label,
    toc: TOC.map(([id, t]) => ({ id, t, on: active === id ? "true" : "false" })),
    steps: [["01", "Copy the interface", "Add ISortesHouse to your project. It is five lines: request, resultOf, FEE and the Status enum."], ["02", "Request", "Call house.request with the player's commitment and the fee, from your contract."], ["03", "Read", "When resultOf says Fulfilled, use the result. A timeout is the floor: treat it as the worst outcome for the silent side."]].map((s) => ({ n: s[0], t: s[1], d: s[2] })),
    codeHtml: highlight(COINFLIP), browserHtml: highlight(BROWSER),
    contracts: [row("SortesHouse", CONFIG.house, "Requests, deadlines, bond, ML-DSA-87 gated money"), row("SortesMint", CONFIG.mint, "The Sortes Lots collection (a consumer)"), row("SortesRenderer", renderer, "Draws each lot's plate fully on chain"), row("SortesDice", CONFIG.dice, "A second consumer: pick 1 to 6")],
    events: [
      ["Requested(id, consumer, beneficiary, position, lockBlock)", "A request was opened and a chain position assigned.", "var(--ink)"],
      ["HouseRevealed(id, value, lockHash)", "The house revealed its value for that position.", "var(--ink)"],
      ["Fulfilled(id, secret, result)", "Both sides revealed. The result is final.", "var(--ok)"],
      ["TimedOut(id, status)", "A deadline passed. The request ended with the floor.", "var(--ok)"],
      ["BadReveal()", "The house value does not hash to the chain.", "var(--bad)"],
      ["BadSecret()", "The secret does not match the commitment.", "var(--bad)"],
      ["BadPqcSignature()", "House money moved without a valid ML-DSA-87 signature.", "var(--bad)"],
      ["BondTooLow()", "The bond would not cover the penalties of open requests.", "var(--bad)"],
    ].map((e) => ({ n: e[0], d: e[1], c: e[2] })),
    fees: [
      ["Draw fee", params ? `${qor(params.FEE as bigint, 0)} QOR per request` : "…"],
      ["House reveal window", w(params?.W_HOUSE as bigint | undefined)],
      ["User reveal window", w(params?.W_USER as bigint | undefined)],
      ["House silence penalty", params ? `${qor(params.PENALTY as bigint, 0)} QOR to the user, from the bond` : "…"],
      ["Lock block", params ? `request block + ${params.LOCK_DELAY}` : "request block + 2"],
    ].map((f) => ({ k: f[0], v: f[1] })),
  };
  return <BuildView v={v} />;
}
