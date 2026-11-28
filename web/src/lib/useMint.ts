"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { encodeFunctionData, parseEventLogs } from "viem";
import { useWriteContract } from "wagmi";
import { ABI, CONFIG } from "./config";
import { findRequestByCommit, publicClient, readLot, readMintStats, readRequest, relayReveal, tokenOfRequest, type HouseRequest, type Lot } from "./chain";
import { Status, commitmentOf } from "./protocol";
import { flattenErr, getQorexEvm, HOW_TO_SWITCH_DIANA, qorexCall, qorexCanSendFrom, qorexEvmAccounts, qorexEvmSend, type QorexAccount } from "./qorex";
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
  const m = flattenErr(e);
  if (/User rejected|rejected the request|denied|cancel/i.test(m)) return { kind: "rejected", title: "You rejected the signature.", desc: "Nothing was sent and no QOR moved. You can try again." };
  if (/no open EVM authori[sz]ation window|code 26|window/i.test(m) && /evm|window/i.test(m)) {
    return {
      kind: "window",
      title: "Your EVM window is closed.",
      desc: "MetaMask cannot open that window. In QoreX, select the Ethereum account whose 0x matches MetaMask Account 1 (the one with 100 QOR). Then use QoreX · free — QoreX opens a one-shot window when it sends. After that, paid MetaMask draws work too.",
    };
  }
  if (/PoolEmpty/.test(m)) return { kind: "pool", title: "The free-mint pool is empty.", desc: "Use the paid mint with MetaMask, or come back later." };
  if (/SponsorLimit/.test(m)) return { kind: "limit", title: "This wallet used its free mints.", desc: "Each wallet gets a few sponsored mints. Use the paid mint to draw more." };
  if (/SoldOut/.test(m)) return { kind: "soldout", title: "All 1,000 lots are drawn.", desc: "The collection is sold out." };
  if (/insufficient funds|exceeds the balance|balance/i.test(m) && !/qorechain/i.test(m)) return { kind: "balance", title: "Not enough QOR.", desc: extra?.need ? `You need ${extra.need}. Your balance is ${extra.have ?? "lower"}.` : "A paid draw costs 1 QOR plus a small network fee." };
  if (/not found on chain|fund it first/i.test(m)) {
    return { kind: "other", title: "QoreX is using an unfunded account.", desc: "The selected QoreX key has 0 QOR. Switch QoreX to the Ethereum account that matches MetaMask Account 1 (0xd910…, 100 QOR), then Draw again on QoreX · free." };
  }
  if (/cannot show what|will not display a Cross-VM/i.test(m)) {
    return { kind: "other", title: "QoreX cannot display this call.", desc: "This native QoreX account cannot mint from a website. In QoreX, select the Ethereum (coin 60) account that has your test QOR, then Draw again." };
  }
  if (/coin 118|cannot send on QoreChain's EVM/i.test(m)) {
    return { kind: "other", title: "This QoreX account uses a native key.", desc: "In QoreX, select an Ethereum account imported from MetaMask (coin 60), the same 0x that has your QOR, then Draw again." };
  }
  if (/pqc-key-missing/i.test(m)) {
    return { kind: "other", title: "This account has no post-quantum key yet.", desc: "In QoreX, with the funded Ethereum account selected, open the MetaMask on QoreChain card once so QoreX can register the key, then Draw again." };
  }
  if (/\b4100\b|unknown account|not been authorized|Unauthorized|different account/i.test(m) && !/vladi/i.test(m)) {
    return { kind: "other", title: "QoreX is on a different account.", desc: "QoreX is not signing as the funded MetaMask address. In QoreX, add/select the Ethereum (coin 60) account for the same phrase as MetaMask Account 1, then press QoreX · free → Draw." };
  }
  if (/qorechain-vladi|does not match the active network|switch the network in QoreX/i.test(m) && !/qorechain-diana/i.test(m)) {
    return { kind: "network", title: "QoreX is not on diana.", desc: HOW_TO_SWITCH_DIANA };
  }
  if (/\bwrong network\b|unrecognized chain|4902|wallet_addEthereumChain/i.test(m) && !/qorechain-diana/i.test(m)) {
    return { kind: "network", title: "Wrong network.", desc: HOW_TO_SWITCH_DIANA };
  }
  const desc = m.length > 220 ? m.slice(0, 220) + "…" : m || "The wallet did not say why.";
  return { kind: "other", title: "Something went wrong.", desc };
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
        const from = wallet.evmAddress ?? (wallet.kind === "evm" ? wallet.address : undefined);
        if (!from) throw new Error("connect MetaMask first");
        if (!wallet.evmChainOk) throw new Error("wrong network");
        const saved = begin(from, "evm");
        const { price } = await readMintStats();
        const bal = await publicClient.getBalance({ address: from });
        if (bal < price) throw Object.assign(new Error("insufficient funds"), { have: bal, need: price });
        const data = encodeFunctionData({ abi: ABI.mint, functionName: "mint", args: [saved.commit] });
        let hash: Hex;
        // Prefer MetaMask for this tab. QoreX only if it actually lists this 0x (opens the one-shot window).
        const qorexOwns = getQorexEvm() ? await qorexCanSendFrom(from) : false;
        if (qorexOwns) {
          hash = (await qorexEvmSend(from, CONFIG.mint, data, price)).txHash as Hex;
        } else {
          try {
            hash = await writeContractAsync({ address: CONFIG.mint, abi: ABI.mint, functionName: "mint", args: [saved.commit], value: price });
          } catch (e) {
            const m = flattenErr(e);
            if (getQorexEvm() && /no open EVM authori[sz]ation window|code 26/i.test(m)) {
              hash = (await qorexEvmSend(from, CONFIG.mint, data, price)).txHash as Hex;
            } else {
              throw e;
            }
          }
        }
        patch({ step: "committed", commitTx: hash });
        const rc = await publicClient.waitForTransactionReceipt({ hash });
        if (rc.status !== "success") throw new Error("the mint reverted (is your EVM window open in QoreX?)");
        const ev = parseEventLogs({ abi: ABI.mint, logs: rc.logs, eventName: "Minted" })[0] as any;
        track(saved, BigInt(ev.args.requestId), BigInt(ev.args.tokenId), "evm");
      } else {
        const acct = (wallet.qorex ?? (await wallet.connectQorex())) as QorexAccount | undefined;
        if (!acct) return;
        if (!acct.canSend) throw new Error("This QoreX build cannot sign dApp transactions yet. Update QoreX.");
        const evmAccts = getQorexEvm() ? await qorexEvmAccounts() : [];
        const extra = wallet.evmAddress ? [wallet.evmAddress] : [];
        const candidates = [...new Set([acct.evm, ...evmAccts, ...extra].map((a) => a.toLowerCase() as Address))];
        let from = acct.evm;
        let best = -1n;
        for (const a of candidates) {
          try {
            const b = await publicClient.getBalance({ address: a });
            if (b > best) { best = b; from = a; }
          } catch { /* skip */ }
        }
        if (best <= 0n) {
          throw new Error("QoreX is using an unfunded account (not found on chain — fund it first).");
        }
        const saved = begin(from, "qorex");
        const data = encodeFunctionData({ abi: ABI.mint, functionName: "mintSponsored", args: [saved.commit] });
        const qorexOwns = getQorexEvm() ? await qorexCanSendFrom(from) : false;
        const res = qorexOwns
          ? await qorexEvmSend(from, CONFIG.mint, data, 0n)
          : wallet.evmAddress && from.toLowerCase() === wallet.evmAddress.toLowerCase()
            ? { txHash: await writeContractAsync({ address: CONFIG.mint, abi: ABI.mint, functionName: "mintSponsored", args: [saved.commit] }), code: 0, evm: true }
            : await qorexCall(acct, CONFIG.mint, ABI.mint, "mintSponsored", [saved.commit], "Sortes mint");
        patch({ step: "committed", commitTx: res.txHash });
        if (res.evm && res.txHash.startsWith("0x")) {
          const rc = await publicClient.waitForTransactionReceipt({ hash: res.txHash as Hex });
          if (rc.status !== "success") throw new Error("the mint reverted");
          const ev = parseEventLogs({ abi: ABI.mint, logs: rc.logs, eventName: "Minted" })[0] as any;
          track(saved, BigInt(ev.args.requestId), BigInt(ev.args.tokenId), "qorex");
        } else {
          let id: bigint | undefined;
          for (let i = 0; i < 24 && id === undefined; i++) {
            id = await findRequestByCommit(from, saved.commit, 2_000n);
            if (id === undefined) await new Promise((r) => setTimeout(r, 1500));
          }
          if (id === undefined) throw new Error("Mint sent but the request was not found yet. Reopen this page shortly; your secret is saved.");
          track(saved, id, await tokenOfRequest(id), "qorex");
        }
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
