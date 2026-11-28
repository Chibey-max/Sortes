"use client";

import { MintCardView } from "./views/MintCardView";
import type { MintCtl } from "@/lib/useMint";
import { useWallet } from "@/lib/wallet";
import { useTheme } from "@/lib/theme";
import { blocksToSeconds, fmtDuration, qor, useEvmWindow, useHouseParams, useMintStats, useQorBalance, useSponsoredUsed } from "@/lib/data";
import { artProps, FLOOR, TIERS, TIER_VAR, sharePct, tierOf } from "@/lib/traits";
import { short, num } from "@/lib/live";
import { isDeployed } from "@/lib/config";
import { HOW_TO_SWITCH_DIANA } from "@/lib/qorex";
import { toQorAddress } from "@/lib/bech32";
import { verify } from "@/lib/verify";
import { useEffect, useState } from "react";
import { LotActions } from "@/components/LotActions";

/** The draw card of the Mint page: connect, choose how to pay, commit, wait for the lock block, reveal, drawn. */
export function MintCard({ ctl, dark }: { ctl: MintCtl; dark?: boolean | string }) {
  const wallet = useWallet();
  const { theme } = useTheme();
  const isDark = dark === undefined ? theme === "dark" : dark === true || dark === "true";
  const { state, path, setPath, secret } = ctl;
  const stats = useMintStats().data;
  const params = useHouseParams().data;
  const mintAddr = path === "evm" ? (wallet.evmAddress ?? wallet.address) : wallet.address;
  const win = useEvmWindow(mintAddr, path === "evm").data;
  const bal = useQorBalance(mintAddr).data;
  const used = useSponsoredUsed(mintAddr).data;
  const [checks, setChecks] = useState<string>();

  useEffect(() => {
    if (state.step !== "revealed" || state.requestId === undefined) return;
    verify({ requestId: state.requestId }).then((r) => { const ok = r.checks.filter((c) => c.pass === true).length; setChecks(`${ok} of ${r.checks.length} checks passed`); }).catch(() => setChecks("Verify it yourself on the Verify page"));
  }, [state.step, state.requestId]);

  const connected = wallet.kind !== null;
  const price = stats ? BigInt(stats.price) : undefined;
  const poolLeft = stats && price !== undefined && price > 0n ? Number(BigInt(stats.pool) / price) : undefined;
  const perWallet = stats ? Number(stats.perWallet) : 3;
  const sponsoredLeft = used === null || used === undefined ? perWallet : Math.max(0, perWallet - used);

  // which design step are we on?
  const s = state.step;
  const step = s === "idle" || s === "error" && state.requestId === undefined ? (connected ? "ready" : "connect")
    : s === "committing" ? "signing" : s === "committed" || s === "lockPassed" ? "committed"
    : s === "houseRevealed" || s === "userRevealSent" ? "revealing" : "drawn";
  const prog = ({ connect: 0, ready: 0, signing: 1, committed: 2, revealing: 3, drawn: 4 } as const)[step];

  const e = path === "evm" && /display|native QoreX key|Cross-VM|coin 118/i.test(`${state.error?.title ?? ""} ${state.error?.desc ?? ""}`)
    ? undefined
    : state.error;
  const errCls = e ? (e.kind === "rejected" || e.kind === "other" ? "bad" : "warn") : "";
  const retry = () => { ctl.dismissError(); void ctl.start(); };
  const errAction = e && (e.kind === "network" || e.kind === "rejected" || e.kind === "other" || e.kind === "window")
    ? { t: "Try again", go: retry }
    : e ? { t: "Back", go: ctl.dismissError } : undefined;
  // Connected QoreX already passed enable(diana); a leftover "network" flag is a false alarm.
  const werr = wallet.error === "no-qorex" && !wallet.qorex ? { t: "QoreX was not found.", d: "Sortes signs with QoreX because it supports post-quantum keys. Install the extension and reload this page." }
    : wallet.error === "no-metamask" ? { t: "MetaMask was not found.", d: "Install MetaMask, or use QoreX for a free draw." }
    : wallet.error === "rejected" ? { t: "You rejected the connection.", d: "Nothing was sent. You can try again." }
    : wallet.error === "network" && !wallet.qorex ? { t: "QoreX is not on diana.", d: HOW_TO_SWITCH_DIANA }
    : path === "evm" && !wallet.evmChainOk ? { t: "Wrong network.", d: "MetaMask is not on QoreChain diana. Switch to diana to draw." } : undefined;
  const hasErr = !!(e || werr);

  const evmNeeds = price !== undefined ? price : 10n ** 18n;
  const lowBalance = path === "evm" && bal !== null && bal !== undefined && bal < evmNeeds;
  const windowOpen = !!(win && (win as any).live);
  const blocked =
    !isDeployed || (path === "qorex" && (poolLeft === 0 || sponsoredLeft === 0)) || (path === "evm" && (!wallet.evmChainOk || lowBalance));
  const sec = secret ? `${secret.slice(0, 6)} •••• •••• ${secret.slice(-4)}` : "…";

  const req = state.req, head = state.head;
  const mined = req && head !== undefined ? Math.max(0, Math.min(2, Number(head - req.requestBlock))) : 0;
  const blocksLeft = req && head !== undefined ? Number(req.lockBlock) - Number(head) : 2;
  const wUser = params ? Number(params.W_USER) : 150;
  const userLeft = req && head !== undefined && req.houseRevealBlock > 0n ? Number(req.houseRevealBlock) + wUser - Number(head) : wUser;
  const lock = req?.lockHash && req.lockHash !== "0x" + "0".repeat(64) ? short(req.lockHash, 8, 6) : "zero on diana (not served to contracts)";
  const lot = state.lot;
  const traits = lot?.finalized ? lot.traits : FLOOR;
  const ap = artProps(traits);
  const t = tierOf(traits);

  const pathTabs = [
    { t: "QoreX · free", on: path === "qorex" ? "true" : "false", go: () => { ctl.dismissError(); setPath("qorex"); if (wallet.kind !== "qorex") void wallet.connectQorex(); } },
    { t: `MetaMask · ${price !== undefined ? qor(price, 0) : "1"} QOR`, on: path === "evm" ? "true" : "false", go: () => { ctl.dismissError(); setPath("evm"); void wallet.connectEvm(); } },
  ];
  const rows = path === "qorex"
    ? [{ k: "Price", v: "Free (sponsored)", b: true }, { k: "Free draws left for you", v: `${sponsoredLeft} of ${perWallet}` }, { k: "Free-draw pool", v: poolLeft === undefined ? "…" : `${num(poolLeft)} left` }]
    : [{ k: "Price", v: `${qor(price, 0)} QOR`, b: true }, { k: "Network fee", v: "≈ 0.004 QOR" }, { k: "Your balance", v: `${qor(bal ?? undefined)} QOR` }];
  const cta = !isDeployed ? "Contracts not configured" : path === "qorex" ? (sponsoredLeft === 0 ? "No free draws left" : poolLeft === 0 ? "Free pool is empty" : "Draw a lot, free") : lowBalance ? "Not enough QOR" : `Commit and pay ${qor(price, 0)} QOR`;

  const v = {
    th: isDark ? "dark" : "light", chip: path === "qorex" && connected ? "Free" : `${qor(price, 0)} QOR`,
    steps: ["Commit", "Lock", "Reveal", "Drawn"].map((tt, k) => ({ t: tt, c: k < prog ? "on" : "" })),
    hasErr, errCls: e ? errCls : "warn", errT: e?.title ?? werr?.t, errD: e?.desc ?? werr?.d, errAction: step === "connect" ? undefined : errAction,
    isConnect: step === "connect", isReady: step === "ready", isSigning: step === "signing", isCommitted: step === "committed", isRevealing: step === "revealing", isDrawn: step === "drawn",
    busy: wallet.busy, connectQorex: () => void wallet.connectQorex(), connectMetaMask: () => void wallet.connectEvm(),
    pathTabs, rows,
    windowWarn: path === "evm" && !!wallet.evmAddress && win !== null && !windowOpen,
    faucetWarn: path === "evm" && lowBalance,
    faucetQor: mintAddr ? toQorAddress(mintAddr) : "",
    faucetUrl: "https://docs.qorechain.io/dashboard/faucet",
    secretMask: sec, newSecret: ctl.regenerate,
    cta, blocked: blocked ? "true" : "false", start: () => void ctl.start(),
    readyNote: path === "qorex" ? "One approval in QoreX. We send your reveal for you." : "MetaMask pays 1 QOR. If the window is closed, select this same 0x in QoreX and use QoreX · free instead.",
    waitTitle: path === "qorex" ? "Waiting for QoreX" : "Waiting for QoreX / MetaMask", method: path === "qorex" ? "mintSponsored(bytes32)" : "mint(bytes32)",
    commitShort: state.saved ? short(state.saved.commit, 8, 6) : "…", valueLabel: path === "qorex" ? "free (sponsored)" : `${qor(price, 0)} QOR`,
    waitNote: path === "qorex" ? "Check the QoreX window. Only the hash of your secret leaves this browser." : "Approve in QoreX if it opens (it creates the EVM window for this one send). Only the hash of your secret leaves this browser.",
    commitLine: req ? "Commit included in block " : "Commit sent. Waiting for the block…", commitBlock: req ? `#${num(req.requestBlock)}` : "",
    hasRequest: !!req, lockBlock: req ? `#${num(req.lockBlock)}` : "", minedLabel: `${mined} of 2 mined`,
    lockBars: [{ on: mined >= 1, pulse: mined < 1 }, { on: mined >= 2, pulse: mined === 1 }],
    lockNote: blocksLeft > 0 ? `About ${fmtDuration(blocksToSeconds(blocksLeft))}. Nobody knows the lock block yet, not even you.` : "The lock block is sealed. Waiting for the house to reveal.",
    backup: ctl.backup,
    revealTitle: s === "userRevealSent" ? "Your reveal is" : "The house revealed.", revealTitleIt: s === "userRevealSent" ? "on its way." : "Almost there.",
    position: req ? String(req.position) : "…", houseValueShort: req ? short(req.houseValue, 6, 4) : "…", lockHashLabel: lock,
    windowLeft: `${fmtDuration(blocksToSeconds(Math.max(0, userLeft)))} left`,
    revealStatus: state.note ?? (s === "userRevealSent" ? "Reveal sent. Waiting for it to confirm and for the lot to be finalized." : "We are sending your reveal for you. This page keeps checking."),
    reveal: () => void ctl.reveal(), revealCta: state.note ? "Reveal and draw" : s === "userRevealSent" ? "Reveal sent" : "Sending your reveal…", revealDisabled: !state.note,
    art: { ...ap, n: Number(state.tokenId ?? 0), label: `LOT #${state.tokenId ?? ""}` },
    tierColor: TIER_VAR[t], tierLabel: state.floor ? "Floor lot" : `${TIERS[t]} · ${sharePct(4, t)}%`,
    drawnIt: state.floor ? "kept its floor." : "is yours.", checksLabel: state.floor ? "The draw ended by timeout" : checks ?? "Checking…",
    floorNote: state.floor ? (req?.status === 4 ? "The house missed its reveal, so you were made whole: 1 QOR back and a 2 QOR penalty from the house bond." : "The reveal window closed, so this lot has floor traits.") : undefined,
    again: ctl.reset,
  };
  return (
    <>
      <MintCardView v={v} />
      <LotActions requestId={state.requestId} tokenId={state.tokenId} />
    </>
  );
}
