"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { parseEventLogs } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { ABI, CONFIG } from "./config";
import { findRequestByCommit, publicClient, readLot, readRequest, relayReveal, tokenOfRequest } from "./chain";
import { Status, commitmentOf } from "./protocol";
import { connectQorex, qorexCall, type QorexAccount } from "./qorex";
import { downloadBackup, newSecret, saveSecret, secretForRequest, updateSecret, type SavedSecret } from "./secrets";

/**
 * The mint state machine, shared by both wallet paths:
 *
 *   idle → committing (wallet open) → committed (tx sent) → lockPassed → houseRevealed
 *        → userRevealSent → revealed (traits fixed)
 *
 * plus "timedOut" (floor; refund if the house was silent) and "error".
 */
export type Step = "idle" | "committing" | "committed" | "lockPassed" | "houseRevealed" | "userRevealSent" | "revealed" | "timedOut" | "error";

export interface MintState {
  step: Step;
  path?: "qorex" | "evm";
  requestId?: bigint;
  tokenId?: bigint;
  commitTx?: string;
  revealTx?: string;
  saved?: SavedSecret;
  status?: Status;
  floor?: boolean;
  message?: string;
}

export function useMint() {
  const { address: evmAddress } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<MintState>({ step: "idle" });
  const [qorex, setQorex] = useState<QorexAccount>();
  const poll = useRef<ReturnType<typeof setInterval>>();

  const patch = (p: Partial<MintState>) => setState((s) => ({ ...s, ...p }));

  /** Shared start: new secret, saved before anything is sent. */
  function prepare(minter: Address, path: "qorex" | "evm") {
    const secret = newSecret();
    const commit = commitmentOf(secret, minter, CONFIG.mint, BigInt(CONFIG.evmChainId));
    const saved: SavedSecret = { secret, commit, minter, createdAt: Date.now(), path };
    saveSecret(saved);
    setState({ step: "committing", path, saved });
    return saved;
  }

  const mintWithEvm = useCallback(async () => {
    if (!evmAddress) throw new Error("connect an EVM wallet first");
    const saved = prepare(evmAddress, "evm");
    try {
      const price = (await publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: "price", args: [] })) as bigint;
      const hash = await writeContractAsync({ address: CONFIG.mint, abi: ABI.mint, functionName: "mint", args: [saved.commit], value: price });
      patch({ step: "committed", commitTx: hash });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("mint reverted (is your EVM window open in QoreX?)");
      const ev = parseEventLogs({ abi: ABI.mint, logs: rc.logs, eventName: "Minted" })[0] as any;
      track(saved, BigInt(ev.args.requestId), BigInt(ev.args.tokenId));
    } catch (e: any) {
      patch({ step: "error", message: friendly(e) });
    }
  }, [evmAddress, writeContractAsync]);

  const mintWithQorex = useCallback(async () => {
    try {
      const acct = qorex ?? (await connectQorex());
      setQorex(acct);
      if (!acct.canSend) throw new Error("This QoreX build cannot sign dApp transactions yet (no signAndBroadcast). Update QoreX.");
      const saved = prepare(acct.evm, "qorex");
      const res = await qorexCall(acct, CONFIG.mint, ABI.mint, "mintSponsored", [saved.commit], "Sortes mint");
      patch({ step: "committed", commitTx: res.txHash });
      // The native tx does not carry the EVM request id: find it by our commitment.
      let id: bigint | undefined;
      for (let i = 0; i < 20 && id === undefined; i++) {
        id = await findRequestByCommit(acct.evm, saved.commit, 2_000n);
        if (id === undefined) await sleep(1500);
      }
      if (id === undefined) throw new Error("Mint sent but the request was not found yet. Reopen this page shortly; your secret is saved.");
      track(saved, id, await tokenOfRequest(id));
    } catch (e: any) {
      patch({ step: "error", message: friendly(e) });
    }
  }, [qorex]);

  /** Follow a request to the end. Also used to resume after a reload. */
  const track = useCallback((saved: SavedSecret, requestId: bigint, tokenId: bigint) => {
    updateSecret(saved.commit, { requestId: requestId.toString(), tokenId: tokenId.toString() });
    patch({ requestId, tokenId, saved: { ...saved, requestId: requestId.toString(), tokenId: tokenId.toString() } });
    let revealing = false;
    clearInterval(poll.current);
    const tick = async () => {
      try {
        const [r, head] = await Promise.all([readRequest(requestId), publicClient.getBlockNumber()]);
        const lot = await readLot(tokenId);
        if (lot.finalized) {
          clearInterval(poll.current);
          return patch({ step: lot.isFloor ? "timedOut" : "revealed", floor: lot.isFloor, status: r.status });
        }
        if (r.status === Status.Requested) return patch({ step: head > r.lockBlock ? "lockPassed" : "committed", status: r.status });
        if (r.status === Status.HouseRevealed && !revealing) {
          revealing = true;
          patch({ step: "houseRevealed", status: r.status });
          await sendUserReveal(saved, requestId);
          revealing = false;
          return;
        }
        if (r.status === Status.Fulfilled) return patch({ step: "userRevealSent", status: r.status });
        if (r.status === Status.HouseTimedOut || r.status === Status.UserTimedOut) return patch({ step: "timedOut", floor: true, status: r.status });
      } catch {
        /* transient RPC errors: keep polling */
      }
    };
    void tick();
    poll.current = setInterval(tick, 2500);
  }, []);

  /** Relay through the house daemon (no second signature); fall back to the wallet. */
  async function sendUserReveal(saved: SavedSecret, requestId: bigint) {
    const relayed = await relayReveal(requestId, saved.secret);
    if (relayed.ok) return patch({ step: "userRevealSent", revealTx: relayed.tx });
    try {
      if (saved.path === "qorex") {
        const acct = qorex ?? (await connectQorex());
        const res = await qorexCall(acct, CONFIG.house, ABI.house, "revealUser", [requestId, saved.secret], "Sortes reveal");
        patch({ step: "userRevealSent", revealTx: res.txHash });
      } else {
        const hash = await writeContractAsync({ address: CONFIG.house, abi: ABI.house, functionName: "revealUser", args: [requestId, saved.secret] });
        patch({ step: "userRevealSent", revealTx: hash });
      }
    } catch (e: any) {
      patch({ message: "Your reveal is needed: " + friendly(e) });
    }
  }

  /** Resume a request whose secret is saved in this browser. */
  const resume = useCallback(async (requestId: bigint) => {
    const saved = secretForRequest(requestId.toString());
    if (!saved) throw new Error("No saved secret for this request in this browser.");
    setState({ step: "committed", path: saved.path, saved });
    track(saved, requestId, await tokenOfRequest(requestId));
  }, [track]);

  useEffect(() => () => clearInterval(poll.current), []);

  return { state, mintWithEvm, mintWithQorex, resume, qorex, setQorex, backup: () => state.saved && downloadBackup(state.saved) };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function friendly(e: any): string {
  const m = String(e?.shortMessage ?? e?.message ?? e);
  if (/no open EVM authori[sz]ation window|code 26/i.test(m)) return "Your EVM window is closed. Open one in QoreX (EVM access window), then try again.";
  if (/User rejected|rejected the request|denied/i.test(m)) return "You cancelled in the wallet.";
  if (/PoolEmpty/.test(m)) return "The sponsor pool is empty right now. Use the paid mint, or try later.";
  if (/SponsorLimit/.test(m)) return "This wallet has used its free mints.";
  if (/SoldOut/.test(m)) return "Sold out.";
  return m.length > 220 ? m.slice(0, 220) + "…" : m;
}
