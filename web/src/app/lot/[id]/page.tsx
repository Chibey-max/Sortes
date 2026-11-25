"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readLot, readRequest, requestTxs, type HouseRequest, type Lot } from "@/lib/chain";
import { txUrl } from "@/lib/config";
import { STATUS_LABEL, TIERS, TRAITS, variantName } from "@/lib/protocol";
import { LotArt } from "@/components/LotArt";

export default function LotPage({ params }: { params: { id: string } }) {
  const tokenId = BigInt(params.id);
  const [lot, setLot] = useState<Lot>();
  const [req, setReq] = useState<HouseRequest>();
  const [txs, setTxs] = useState<{ label: string; tx: string }[]>([]);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    (async () => {
      try {
        const l = await readLot(tokenId);
        setLot(l);
        setReq(await readRequest(l.requestId));
        setTxs(await requestTxs(l.requestId));
      } catch (e: any) {
        setErr(e?.shortMessage ?? e?.message);
      }
    })();
  }, [params.id]);

  if (err) return <p className="bad">Lot #{params.id}: {err}</p>;
  return (
    <>
      <h1>Sortes Lot #{params.id}</h1>
      <div className="row">
        <div style={{ maxWidth: 420 }}><LotArt tokenId={tokenId} refreshKey={lot?.finalized} /></div>
        <section className="card">
          <h2>{lot?.finalized ? (lot.isFloor ? "Floor traits (timeout)" : "Fair roll") : "Revealing…"}</h2>
          {lot?.finalized && (
            <table>
              <tbody>
                {TRAITS.map((t, i) => (
                  <tr key={t}>
                    <td>{t}</td>
                    <td>{variantName(i, lot.tier[i], lot.variant[i])}</td>
                    <td className={`tier-${lot.tier[i]}`}>{TIERS[lot.tier[i]]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small">
            Request #{lot?.requestId.toString()} · {req ? STATUS_LABEL[req.status] : "…"} · {lot?.sponsored ? "QoreX (sponsored)" : "paid"} mint
          </p>
          <h2 style={{ marginTop: 16 }}>Transactions</h2>
          <ul className="small">
            {txs.map((t) => (
              <li key={t.tx + t.label}>{t.label}: <a className="mono" href={txUrl(t.tx)} target="_blank" rel="noreferrer">{t.tx.slice(0, 18)}…</a></li>
            ))}
            {txs.length === 0 && <li className="muted">Loading…</li>}
          </ul>
          <Link className="btn" href={`/verify?token=${params.id}`}>Verify this lot</Link>
        </section>
      </div>
    </>
  );
}
