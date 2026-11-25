"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readLot, readMintStats, type Lot } from "@/lib/chain";
import { isDeployed } from "@/lib/config";
import { TIERS } from "@/lib/protocol";
import { LotArt } from "@/components/LotArt";
import { NotDeployed } from "@/components/NotDeployed";

export default function Gallery() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [filter, setFilter] = useState(-1);

  useEffect(() => {
    if (!isDeployed) return;
    (async () => {
      const { total } = await readMintStats();
      const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(Number(total) - i));
      for (let i = 0; i < ids.length; i += 12) {
        const batch = await Promise.all(ids.slice(i, i + 12).map((id) => readLot(id).catch(() => undefined)));
        setLots((cur) => [...cur, ...(batch.filter(Boolean) as Lot[])]);
      }
    })();
  }, []);

  const shown = lots.filter((l) => filter < 0 || (l.finalized && Math.max(...l.tier) === filter));
  return (
    <>
      <h1>Gallery</h1>
      <p className="lead">Every minted lot, newest first. Art is drawn on chain from each lot&apos;s traits.</p>
      <NotDeployed />
      <p>
        <label className="small">Highest tier{" "}
          <select value={filter} onChange={(e) => setFilter(Number(e.target.value))}>
            <option value={-1}>All</option>
            {TIERS.map((t, i) => <option key={t} value={i}>{t}</option>)}
          </select>
        </label>{" "}
        <span className="small muted">{shown.length} shown</span>
      </p>
      <div className="grid">
        {shown.map((l) => (
          <Link key={l.tokenId.toString()} href={`/lot/${l.tokenId}`}>
            <LotArt tokenId={l.tokenId} />
            #{l.tokenId.toString()} {l.finalized ? (l.isFloor ? "· floor" : `· ${TIERS[Math.max(...l.tier)]}`) : "· revealing"}
          </Link>
        ))}
      </div>
    </>
  );
}
