"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { readMintStats } from "@/lib/chain";
import { isDeployed } from "@/lib/config";
import { allSecrets, storageWorks } from "@/lib/secrets";
import { useMint } from "@/lib/useMint";
import { connectQorex } from "@/lib/qorex";
import { LotArt } from "@/components/LotArt";
import { NotDeployed } from "@/components/NotDeployed";
import { StepTracker } from "@/components/StepTracker";

export default function MintPage() {
  const { isConnected } = useAccount();
  const { state, mintWithEvm, mintWithQorex, resume, qorex, setQorex, backup } = useMint();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof readMintStats>>>();
  const [pending, setPending] = useState<{ requestId?: string; tokenId?: string }[]>([]);
  const [canStore, setCanStore] = useState(true);

  useEffect(() => {
    if (isDeployed) readMintStats().then(setStats).catch(() => {});
    setCanStore(storageWorks());
    setPending(allSecrets().filter((s) => s.requestId).slice(-5).reverse());
  }, [state.step]);

  const busy = state.step !== "idle" && state.step !== "error" && state.step !== "revealed" && state.step !== "timedOut";
  const left = stats ? stats.max - stats.total : undefined;

  return (
    <>
      <h1>Mint a Sortes Lot</h1>
      <p className="lead">
        Traits nobody can rig, not even the collection&apos;s creator. Each mint mixes a value the house locked in advance, a
        secret only your browser knows, and a block nobody knew yet. Whoever stays silent gets the floor.
      </p>
      <NotDeployed />

      <div className="row">
        <section className="card">
          <h2>1 · Choose how to mint</h2>
          {stats && (
            <p className="small muted">
              {left?.toString()} of {stats.max.toString()} left · price {formatEther(stats.price)} QOR · sponsor pool {formatEther(stats.pool)} QOR
            </p>
          )}
          {!canStore && <div className="banner bad">This browser blocks storage. Download your secret backup right after minting.</div>}

          <h3 className="small">With QoreX (free, sponsored)</h3>
          <p className="small muted">
            One approval in QoreX. QoreX signs a native QoreChain transaction (hybrid ML-DSA-87), which calls the mint
            contract cross-VM. No EVM window needed. Limited to {stats?.perWallet?.toString() ?? "a few"} per wallet.
          </p>
          {qorex ? (
            <p className="small mono">{qorex.qor} · {qorex.evm}</p>
          ) : (
            <button className="btn secondary" onClick={() => connectQorex().then(setQorex).catch((e) => alert(e.message))}>Connect QoreX</button>
          )}{" "}
          <button className="btn" disabled={busy || !isDeployed} onClick={mintWithQorex}>Mint with QoreX</button>

          <h3 className="small" style={{ marginTop: 20 }}>With MetaMask (paid, {stats ? formatEther(stats.price) : "1"} QOR)</h3>
          <p className="small muted">
            QoreChain admits an EVM transaction only inside an <b>EVM window</b> opened from QoreX: add your MetaMask phrase
            in QoreX as an Ethereum (coin 60) account, open its EVM access window, then mint here.
          </p>
          <ConnectButton showBalance={false} chainStatus="icon" />{" "}
          <button className="btn" disabled={busy || !isConnected || !isDeployed} onClick={mintWithEvm} style={{ marginTop: 8 }}>Mint with MetaMask</button>
          <p className="small warn" style={{ marginTop: 14 }}>
            Your secret is saved in this browser before the mint is sent. If it is lost before your reveal, the lot gets
            floor traits. Keep the backup.
          </p>
        </section>

        <section className="card">
          <h2>2 · Progress</h2>
          {state.step === "idle" && <p className="muted">Nothing in progress.</p>}
          {state.step === "committing" && <p>Approve in your wallet…</p>}
          {state.step !== "idle" && state.step !== "committing" && <StepTracker step={state.step} />}
          {state.message && <div className={`banner ${state.step === "error" ? "bad" : ""}`}>{state.message}</div>}
          {state.saved && (
            <p className="small">
              <button className="btn secondary" onClick={backup}>Download secret backup</button>
            </p>
          )}
          {state.tokenId !== undefined && (
            <>
              <div style={{ maxWidth: 280 }}><LotArt tokenId={state.tokenId} refreshKey={state.step} /></div>
              <p>
                <Link href={`/lot/${state.tokenId}`}>Lot #{state.tokenId.toString()}</Link> · request #{state.requestId?.toString()} ·{" "}
                <Link href={`/verify?token=${state.tokenId}`}>Verify this lot</Link>
              </p>
            </>
          )}
          {state.step === "timedOut" && (
            <p className="small">This lot ended by timeout and has floor traits. If the house was silent, its fee and a 2 QOR penalty were paid to you.</p>
          )}
        </section>
      </div>

      {pending.length > 0 && (
        <section className="card">
          <h2>Your recent lots in this browser</h2>
          <ul>
            {pending.map((p) => (
              <li key={p.requestId}>
                Lot #{p.tokenId} (request #{p.requestId}) · <Link href={`/lot/${p.tokenId}`}>open</Link> ·{" "}
                <button className="btn secondary small" onClick={() => resume(BigInt(p.requestId!))}>Resume</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
