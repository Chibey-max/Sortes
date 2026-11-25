"use client";

import { useEffect, useState } from "react";
import { readTokenUri } from "@/lib/chain";

/** On-chain art for a lot, read from tokenURI (no IPFS). */
export function LotArt({ tokenId, refreshKey }: { tokenId: bigint; refreshKey?: unknown }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    readTokenUri(tokenId).then((m) => live && setSrc(m.image)).catch(() => {});
    return () => { live = false; };
  }, [tokenId, refreshKey]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="art" src={src} alt={`Sortes Lot #${tokenId}`} /> : <div className="art" aria-label="loading art" />;
}
