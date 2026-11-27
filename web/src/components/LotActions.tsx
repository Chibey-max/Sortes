"use client";

import { useEffect, useState } from "react";
import { useWriteContract } from "wagmi";
import { ABI, CONFIG } from "@/lib/config";
import { publicClient, readHouseParams, readLot, readRequest } from "@/lib/chain";
import { Status } from "@/lib/protocol";
import { classify } from "@/lib/useMint";

/**
 * Permissionless settle buttons. The daemon normally claims timeouts and finalizes lots.
 * These stay so a closed browser or a silent daemon never leaves a mint stuck.
 */
export function LotActions({ requestId, tokenId }: { requestId?: bigint; tokenId?: bigint }) {
  const { writeContractAsync } = useWriteContract();
  const [view, setView] = useState<{ houseLate: boolean; userLate: boolean; canFinalize: boolean }>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    if (requestId === undefined || tokenId === undefined) return;
    let stop = false;
    const load = async () => {
      const [req, head, params, lot] = await Promise.all([
        readRequest(requestId),
        publicClient.getBlockNumber(),
        readHouseParams(),
        readLot(tokenId),
      ]);
      if (stop) return;
      if (lot.finalized) { stop = true; clearInterval(t); }
      const houseDeadline = req.lockBlock + BigInt(params.W_HOUSE);
      const userDeadline = req.houseRevealBlock > 0n ? req.houseRevealBlock + BigInt(params.W_USER) : 0n;
      setView({
        houseLate: req.status === Status.Requested && head > houseDeadline,
        userLate: req.status === Status.HouseRevealed && userDeadline > 0n && head > userDeadline,
        canFinalize: !lot.finalized && (req.status === Status.Fulfilled || req.status === Status.HouseTimedOut || req.status === Status.UserTimedOut),
      });
    };
    const t: ReturnType<typeof setInterval> = setInterval(() => { if (!document.hidden && !stop) void load().catch(() => {}); }, 4000);
    void load().catch(() => {});
    return () => { stop = true; clearInterval(t); };
  }, [requestId, tokenId]);

  if (!view || requestId === undefined || tokenId === undefined) return null;
  if (!view.houseLate && !view.userLate && !view.canFinalize) return null;

  async function send(kind: "claim" | "finalize") {
    setBusy(true);
    setMsg(undefined);
    try {
      const hash = kind === "claim"
        ? await writeContractAsync({ address: CONFIG.house, abi: ABI.house, functionName: "claimTimeout", args: [requestId] })
        : await writeContractAsync({ address: CONFIG.mint, abi: ABI.mint, functionName: "finalize", args: [tokenId] });
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("transaction reverted");
      setMsg(kind === "claim" ? "Timeout settled." : "Traits finalized.");
    } catch (e: any) {
      const err = classify(e);
      setMsg(`${err.title} ${err.desc}`);
    } finally {
      setBusy(false);
    }
  }

  const text = view.houseLate
    ? "The house missed its window. Claim the refund: your fee plus a 2 QOR penalty, and this lot gets floor traits."
    : view.userLate
      ? "The reveal window closed. Settle the timeout so this lot gets floor traits instead of waiting."
      : "The result is fixed. Finalize to lock the traits and the on-chain art.";

  return (
    <div className="alert warn" style={{ margin: "16px auto", maxWidth: 720 }} role="status">
      <span>
        <b style={{ display: "block", marginBottom: 6 }}>Act needed.</b>
        {text}
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {(view.houseLate || view.userLate) && (
            <button className="btn btn-p btn-s" disabled={busy} onClick={() => send("claim")}>{view.houseLate ? "Claim refund" : "Settle timeout"}</button>
          )}
          {view.canFinalize && <button className="btn btn-p btn-s" disabled={busy} onClick={() => send("finalize")}>Finalize</button>}
        </span>
        {msg && <span className="small" style={{ display: "block", marginTop: 8 }}>{msg}</span>}
      </span>
    </div>
  );
}
