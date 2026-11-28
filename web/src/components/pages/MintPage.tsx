"use client";

import { useEffect, useState } from "react";
import { MintView } from "@/design/views/MintView";
import { STILL, frameUrl } from "@/design/frames";
import { useMint } from "@/lib/useMint";
import { useMintStats } from "@/lib/data";
import { allSecrets } from "@/lib/secrets";
import { lotsOf, readLots } from "@/lib/chain";
import { useTheme } from "@/lib/theme";
import { useWallet } from "@/lib/wallet";
import { WEIGHTS_BPS, TIERS, TIER_VAR, artProps } from "@/lib/traits";
import { num } from "@/lib/live";
import { isDeployed } from "@/lib/config";
import { qor } from "@/lib/data";

const SECTION_STEPS = ["connect", "ready", "signing", "committed", "revealing", "drawn"] as const;
const IMG: [number, string, string, string][] = [
  [STILL.hero, "1.08", "70% 50%", "The machine, waiting"], [STILL.hero, "1.08", "70% 50%", "Ready when you are"],
  [STILL.whiteBall, "1.5", "74% 30%", "Your white ball, in the air"], [STILL.blackBall, "1.5", "62% 30%", "The block ball follows"],
  [STILL.crank, "1.6", "72% 72%", "The crank turns"], [STILL.ticketOut, "1.12", "42% 50%", "Your plate comes out of the machine"],
];

export function MintPage() {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const ctl = useMint();
  const stats = useMintStats().data;
  const [mine, setMine] = useState<{ n: number; traits: number[] }[]>([]);
  const s = ctl.state.step;

  // which still to show
  const cardStep = s === "idle" || (s === "error" && ctl.state.requestId === undefined) ? (wallet.kind ? 1 : 0) : s === "committing" ? 2 : s === "committed" || s === "lockPassed" ? 3 : s === "houseRevealed" || s === "userRevealSent" ? 4 : 5;
  const [img, sc, origin, caption] = IMG[cardStep] ?? IMG[0];

  useEffect(() => {
    const addrs = [...new Set([wallet.address, wallet.evmAddress].filter(Boolean))] as string[];
    if (!addrs.length || !isDeployed) { setMine([]); return; }
    Promise.all(addrs.map((a) => lotsOf(a as `0x${string}`)))
      .then((lists) => readLots([...new Set(lists.flat().map(String))].map((x) => BigInt(x)).slice(0, 6)))
      .then((ls) => setMine(ls.filter((l) => l.finalized).map((l) => ({ n: Number(l.tokenId), traits: l.traits }))))
      .catch(() => {});
  }, [wallet.address, wallet.evmAddress, s]);

  // Progress lives on the mint card. A toast here became a full-height sheet over the page.

  const total = stats ? Number(stats.total) : undefined, max = stats ? Number(stats.max) : 1000;
  const v = {
    th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label, ctl,
    lead: "Choose how to pay, commit a secret, and let the lock block seal it. The result picks every trait of your plate.",
    drawnChip: total === undefined ? "… of 1,000 drawn" : `${num(total)} of ${num(max)} drawn`,
    priceChip: wallet.kind === "qorex" ? "free with QoreX" : `${qor(stats?.price, 0)} QOR with MetaMask`,
    img: frameUrl(img), sc, origin, caption, stepNo: "Step " + Math.max(1, Math.min(4, [1, 1, 1, 2, 3, 4][cardStep])) + " of 4",
    alt: "Rendered still of the Sortes allotment machine: " + caption.toLowerCase(),
    how: [["01", "Commit", "Your browser makes a secret and sends only its hash, with the price."], ["02", "Lock block", "Two blocks later a block nobody could predict seals the draw."], ["03", "Reveal", "The house reveals its next hash link, then your secret is revealed."], ["04", "Drawn", "The contract hashes all three and paints your plate from the result."], ["05", "Keep it", "Open the lot page, re-run the math on Verify, or find the plate in the gallery. The same house can feed other apps (dice is already deployed)."]].map((h) => ({ n: h[0], t: h[1], d: h[2] })),
    odds: [["Common", 0], ["Uncommon", 1], ["Rare", 2], ["Legendary", 3]].map(([t, i]) => { const p = WEIGHTS_BPS[4][i as number] / 100; return { t, p: `${p}%`, w: p, c: TIER_VAR[i as number] }; }),
    mine: (mine.length ? mine : []).map((l) => { const ap = artProps(l.traits); return { n: l.n, f: ap.field, g: ap.glyph, e: ap.engraving, s: ap.seal, a: ap.aura, l: `LOT #${l.n}` }; }),
    hasMine: mine.length > 0,
  };
  return <MintView v={v} />;
}
