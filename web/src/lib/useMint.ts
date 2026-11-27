"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { parseEventLogs } from "viem";
import { useWriteContract } from "wagmi";
import { ABI, CONFIG } from "./config";
import { findRequestByCommit, publicClient, readLot, readMintStats, readRequest, relayReveal, tokenOfRequest, type HouseRequest, type Lot } from "./chain";
import { Status, commitmentOf } from "./protocol";
import { qorexCall, type QorexAccount } from "./qorex";
import { downloadBackup, newSecret, saveSecret, secretForRequest, updateSecret, type SavedSecret } from "./secrets";
import { useWallet } from "./wallet";

/**
 * The mint state machine, shared by both wallet paths:
 *
 *   idle → committing (wallet open) → committed (tx sent) → lockPassed → houseRevealed
 *        → userRevealSent → revealed (traits fixed)
 *
 * plus "timedOut" (floor; refund if the house was silent) and "error".
 */
export type Step = "idle" | "committing" | "committed" | "lockPassed" | "houseRevealed" | "userRevealSent" | "revealed" | "timedOut" | "error";
export type Path = "qorex" | "evm";
export type ErrorKind = "rejected" | "balance" | "network" | "window" | "pool" | "limit" | "soldout" | "other";

export interface MintError { kind: ErrorKind; title: string; desc: string }

export interface MintState {
  step: Step;
  path?: Path;
  requestId?: bigint;
  tokenId?: bigint;
  commitTx?: string;
  revealTx?: string;
  saved?: SavedSecret;
  req?: HouseRequest;
  head?: bigint;
  lot?: Lot;
  floor?: boolean;
  error?: MintError;
  /** A softer note, e.g. the relay was down and the user's own reveal is needed. */
  note?: string;
}

export function classify(e: any, extra?: { have?: string; need?: string }): MintError {
  const m = String(e?.shortMessage ?? e?.message ?? e);
  if (/User rejected|rejected the request|denied|cancel/i.test(m)) return { kind: "rejected", title: "You rejected the signature.", desc: "Nothing was sent and no QOR moved. You can try again." };
  if (/no open EVM authori[sz]ation window|code 26|window/i.test(m) && /evm|window/i.test(m)) return { kind: "window", title: "Your EVM window is closed.", desc: "Open an EVM access window in QoreX, then try again. Nothing was sent." };
  if (/PoolEmpty/.test(m)) return { kind: "pool", title: "The free-mint pool is empty.", desc: "Use the paid mint with MetaMask, or come back later." };
  if (/SponsorLimit/.test(m)) return { kind: "limit", title: "This wallet used its free mints.", desc: "Each wallet gets a few sponsored mints. Use the paid mint to draw more." };
  if (/SoldOut/.test(m)) return { kind: "soldout", title: "All 1,000 lots are drawn.", desc: "The collection is sold out." };
  if (/insufficient funds|exceeds the balance|balance/i.test(m)) return { kind: "balance", title: "Not enough QOR.", desc: extra?.need ? `You need ${extra.need}. Your balance is ${extra.have ?? "lower"}.` : "A paid draw costs 1 QOR plus a small network fee." };
  if (/qorechain-vladi|not been authorized/i.test(m)) return { kind: "network", title: "QoreX is on mainnet.", desc: "Open the extension, tap the version number at the bottom seven times, choose Switch to testnet (diana), reload this page, then mint again and approve the popup." };
  if (/chain|network|unsupported/i.test(m)) return { kind: "network", title: "Wrong network.", desc: "Switch to QoreChain diana, then try again. Nothing has been sent." };
  return { kind: "other", title: "Something went wrong.", desc: m.length > 220 ? m.slice(0, 220) + "…" : m };
}

export function useMint() {
  const wallet = useWallet();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<MintState>({ step: "idle" });
  const [path, setPath] = useState<Path>("qorex");
  const [secret, setSecret] = useState<Hex | null>(null);
  const poll = useRef<ReturnType<typeof setInterval>>();
  const patch = (p: Partial<MintState>) => setState((s) => ({ ...s, ...p }));

  // A secret is made as soon as the page opens so the card can show it (masked) before the commit.
  useEffect(() => { setSecret(newSecret()); }, []);
  const regenerate = useCallback(() => setSecret(newSecret()), []);

  /** Follow a request to the end. Also used to resume after a reload. */
  const track = useCallback((saved: SavedSecret, requestId: bigint, tokenId: bigint, p: Path) => {
    updateSecret(saved.commit, { requestId: requestId.toString(), tokenId: tokenId.toString() });
    patch({ requestId, tokenId, saved: { ...saved, requestId: requestId.toString(), tokenId: tokenId.toString() }, path: p });
    let revealing = false;
    clearInterval(poll.current);
    const tick = async () => {
      try {
        const [req, head, lot] = await Promise.all([readRequest(requestId), publicClient.getBlockNumber(), readLot(tokenId)]);
        if (lot.finalized) {
          clearInterval(poll.current);
          return patch({ req, head, lot, step: lot.isFloor ? "timedOut" : "revealed", floor: lot.isFloor });
        }
        if (req.status === Status.Requested) return patch({ req, head, lot, step: head > req.lockBlock ? "lockPassed" : "committed" });
        if (req.status === Status.HouseRevealed) {
          patch({ req, head, lot, step: "houseRevealed" });
          if (!revealing) { revealing = true; await sendUserReveal(saved, requestId, p); revealing = false; }
          return;
        }
        if (req.status === Status.Fulfilled) return patch({ req, head, lot, step: "userRevealSent" });
        if (req.status === Status.HouseTimedOut || req.status === Status.UserTimedOut) return patch({ req, head, lot, step: "timedOut", floor: true });
      } catch { /* transient RPC errors: keep polling */ }
    };
    void tick();
    poll.current = setInterval(tick, 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Relay through the house daemon (no second signature); fall back to the wallet. */
  async function sendUserReveal(saved: SavedSecret, requestId: bigint, p: Path) {
    const relayed = await relayReveal(requestId, saved.secret);
    if (relayed.ok) { patch({ revealTx: relayed.tx, note: undefined }); return; }
    patch({ note: "The house relay did not answer, so your own reveal is needed. Press Reveal and draw." });
  }

  const reveal = useCallback(async () => {
    const s = state.saved, id = state.requestId;
    if (!s || id === undefined) return;
    try {
      patch({ note: undefined });
      if (s.path === "qorex") {
        const acct = wallet.qorex ?? (await wallet.connectQorex());
        if (!acct) return;
        const res = await qorexCall(acct, CONFIG.house, ABI.house, "revealUser", [id, s.secret], "Sortes reveal");
        patch({ revealTx: res.txHash });
      } else {
        const hash = await writeContractAsync({ address: CONFIG.house, abi: ABI.house, functionName: "revealUser", args: [id, s.secret] });
        patch({ revealTx: hash });
      }
    } catch (e: any) { patch({ error: classify(e) }); }
  }, [state.saved, state.requestId, wallet, writeContractAsync]);

  function begin(minter: Address, p: Path) {
    const sec = secret ?? newSecret();
    const commit = commitmentOf(sec, minter, CONFIG.mint, BigInt(CONFIG.evmChainId));
    const saved: SavedSecret = { secret: sec, commit, minter, createdAt: Date.now(), path: p };
    saveSecret(saved);
    setState({ step: "committing", path: p, saved });
    return saved;
  }

  const start = useCallback(async () => {
    try {
      if (path === "evm") {
        if (!wallet.address || wallet.kind !== "evm") throw new Error("connect MetaMask first");
        if (!wallet.evmChainOk) throw new Error("wrong network");
        const saved = begin(wallet.address, "evm");
        const { price } = await readMintStats();
        const bal = await publicClient.getBalance({ address: wallet.address });
        if (bal < price) throw Object.assign(new Error("insufficient funds"), { have: bal, need: price });
        const hash = await writeContractAsync({ address: CONFIG.mint, abi: ABI.mint, functionName: "mint", args: [saved.commit], value: price });
        patch({ step: "committed", commitTx: hash });
        const rc = await publicClient.waitForTransactionReceipt({ hash });
        if (rc.status !== "success") throw new Error("the mint reverted (is your EVM window open in QoreX?)");
        const ev = parseEventLogs({ abi: ABI.mint, logs: rc.logs, eventName: "Minted" })[0] as any;
        track(saved, BigInt(ev.args.requestId), BigInt(ev.args.tokenId), "evm");
      } else {
        const acct = (wallet.qorex ?? (await wallet.connectQorex())) as QorexAccount | undefined;
        if (!acct) return;
        if (!acct.canSend) throw new Error("This QoreX build cannot sign dApp transactions yet. Update QoreX.");
        const saved = begin(acct.evm, "qorex");
        const res = await qorexCall(acct, CONFIG.mint, ABI.mint, "mintSponsored", [saved.commit], "Sortes mint");
        patch({ step: "committed", commitTx: res.txHash });
        // The native tx does not carry the EVM request id: find it by our commitment.
        let id: bigint | undefined;
        for (let i = 0; i < 24 && id === undefined; i++) {
          id = await findRequestByCommit(acct.evm, saved.commit, 2_000n);
          if (id === undefined) await new Promise((r) => setTimeout(r, 1500));
        }
        if (id === undefined) throw new Error("Mint sent but the request was not found yet. Reopen this page shortly; your secret is saved.");
        track(saved, id, await tokenOfRequest(id), "qorex");
      }
    } catch (e: any) {
      const price = "1 QOR";
      setState((s) => ({ ...s, step: "error", error: classify(e, e?.have !== undefined ? { have: `${(Number(e.have) / 1e18).toFixed(2)} QOR`, need: `${(Number(e.need) / 1e18).toFixed(3)} QOR` } : { need: price }) }));
    }
  }, [path, wallet, writeContractAsync, secret, track]);

  /** Resume a request whose secret is saved in this browser. */
  const resume = useCallback(async (requestId: bigint) => {
    const saved = secretForRequest(requestId.toString());
    if (!saved) throw new Error("No saved secret for this request in this browser.");
    setPath(saved.path);
    setState({ step: "committed", path: saved.path, saved });
    track(saved, requestId, await tokenOfRequest(requestId), saved.path);
  }, [track]);

  const reset = useCallback(() => { clearInterval(poll.current); setState({ step: "idle" }); setSecret(newSecret()); }, []);
  const dismissError = useCallback(() => setState((s) => ({ ...s, step: s.requestId !== undefined ? s.step : "idle", error: undefined })), []);

  useEffect(() => () => clearInterval(poll.current), []);

  return { state, path, setPath, secret, regenerate, start, reveal, resume, reset, dismissError, backup: () => state.saved && downloadBackup(state.saved) };
}

export type MintCtl = ReturnType<typeof useMint>;
