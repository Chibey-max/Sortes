"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { daemonHealth, readHouseParams } from "@/lib/chain";
import { CONFIG, addressUrl, isDeployed } from "@/lib/config";
import { NotDeployed } from "@/components/NotDeployed";

export default function House() {
  const [p, setP] = useState<Record<string, any>>();
  const [h, setH] = useState<any>();
  const [win, setWin] = useState<any>();

  useEffect(() => {
    if (!isDeployed) return;
    const load = async () => {
      const params = await readHouseParams().catch(() => undefined);
      setP(params);
      setH(await daemonHealth());
      if (params?.house) setWin(await fetch(`/api/window/${params.house}`).then((r) => r.json()).catch(() => undefined));
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <h1>House status</h1>
      <p className="lead">The house bonds QOR it loses if it goes silent, and every move of that money needs an ML-DSA-87 signature.</p>
      <NotDeployed />
      <div className="row">
        <section className="card">
          <h2>Contract</h2>
          {p ? (
            <table className="small"><tbody>
              <tr><td>House account</td><td className="mono"><a href={addressUrl(p.house)} target="_blank" rel="noreferrer">{p.house}</a></td></tr>
              <tr><td>Accepting requests</td><td>{p.accepting ? "yes" : "paused"}</td></tr>
              <tr><td>Bond</td><td>{formatEther(p.bond)} QOR</td></tr>
              <tr><td>Fees earned</td><td>{formatEther(p.earned)} QOR</td></tr>
              <tr><td>Open requests</td><td>{p.openRequests.toString()}</td></tr>
              <tr><td>Requests served</td><td>{p.requestCount.toString()}</td></tr>
              <tr><td>Chain used</td><td>{p.lastPos.toString()} of {p.chainLength.toString()} links revealed</td></tr>
              <tr><td>Anchor</td><td className="mono">{p.anchor}</td></tr>
              <tr><td>Admin actions signed</td><td>{p.adminNonce.toString()} (ML-DSA-87)</td></tr>
            </tbody></table>
          ) : <p className="muted">Loading…</p>}
        </section>
        <section className="card">
          <h2>Daemon</h2>
          {!CONFIG.daemonUrl && <p className="muted small">No daemon URL configured.</p>}
          {h ? (
            <table className="small"><tbody>
              <tr><td>Health</td><td className={h.ok ? "ok" : "bad"}>{h.ok ? "ok" : `error: ${h.lastError}`}</td></tr>
              <tr><td>Last block seen</td><td>{h.lastBlock}</td></tr>
              <tr><td>House reveals</td><td>{h.reveals}</td></tr>
              <tr><td>Reveals relayed for users</td><td>{h.relayedUserReveals}</td></tr>
              <tr><td>Oldest waiting request</td><td>{h.oldestUnrevealedAgeBlocks ?? 0} blocks</td></tr>
              <tr><td>Up since</td><td>{h.startedAt}</td></tr>
            </tbody></table>
          ) : CONFIG.daemonUrl && <p className="bad small">Daemon unreachable. Requests still settle by timeout; your funds are safe.</p>}
          <h2 style={{ marginTop: 16 }}>EVM window (scoped)</h2>
          {win?.found ? (
            <table className="small"><tbody>
              <tr><td>Live</td><td>{win.live ? "yes" : "no"}</td></tr>
              <tr><td>Transactions left</td><td>{win.remaining_txs ?? win.remainingTxs}</td></tr>
              <tr><td>Blocks left</td><td>{win.remaining_blocks ?? win.remainingBlocks}</td></tr>
              <tr><td>Allowed targets</td><td className="mono">{(win.allowed_targets ?? win.allowedTargets ?? []).join(", ")}</td></tr>
            </tbody></table>
          ) : <p className="muted small">No window data.</p>}
        </section>
      </div>
    </>
  );
}
