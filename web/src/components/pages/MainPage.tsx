"use client";

import { useEffect, useRef, useState } from "react";
import { MainView } from "@/design/views/MainView";
import { STILL, frameUrl } from "@/design/frames";
import { ATTACKS, type AttackResult } from "@/lib/attacks";
import { COINFLIP_SHORT, highlight } from "@/lib/code";
import { num, short } from "@/lib/live";
import { useRecentLots } from "@/lib/lots";
import { Status } from "@/lib/protocol";
import { TIERS, TIER_VAR, artProps, tierOf } from "@/lib/traits";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import { useWallet } from "@/lib/wallet";

/** Sample plates shown only until the first real lots are drawn (the design's marquee). */
const SAMPLE: [number, string, string, string, string, string][] = [
  [271, "gold", "kleros", "meander", "star", "legendary"], [128, "obsidian", "diamond", "grid", "ring", "rare"], [156, "teal", "hexagon", "dots", "ring", "none"],
  [41, "slate", "circle", "lines", "slash", "none"], [244, "teal", "cross", "waves", "triangle", "rare"], [203, "bronze", "arch", "grid", "slash", "none"],
  [87, "pewter", "arch", "dots", "dots", "none"], [309, "bronze", "kleros", "meander", "triangle", "legendary"],
];
const SAMPLE_TIER = ["Legendary", "Rare", "Uncommon", "Common", "Rare", "Uncommon", "Common", "Legendary"];

const DESK = [
  { t: "Commit", s: "commit received", d: [["COMMITMENT", "0x6c40…b215", "H(secret, you, mint)"], ["VALUE", "1 QOR", "mint price"], ["BLOCK", "#4,182,905", "commit block"], ["LOCK BLOCK", "#4,182,907", "two blocks later"]], img: STILL.funnel, pos: "62% 34%", cap: "A white ball enters the funnel" },
  { t: "Lock block", s: "lock block mined", d: [["LOCK BLOCK", "#4,182,907", "mined two blocks on"], ["HASH", "0xd03a…5e19", "unknown until now"], ["PROPOSER", "0x8e2c…44a1", "knew no other input"], ["HOUSE DEADLINE", "#4,183,007", "100 blocks"]], img: STILL.blackBall, pos: "62% 34%", cap: "The black ball follows" },
  { t: "House", s: "house revealed", d: [["HOUSE VALUE", "0x4e17…a9c3", "revealed"], ["H(VALUE)", "0x9b2e…41c0", "hash of it"], ["CHAIN LINK", "#127 ✓", "matches the anchor"], ["TX", "0x51d9…e03b", "within seconds"]], img: STILL.houseTicket, pos: "80% 42%", cap: "The house ticket seats in its slot" },
  { t: "You", s: "secret revealed", d: [["SECRET", "0x1f88…07de", "from your browser"], ["H(SECRET, YOU)", "0x6c40…b215", "matches commit"], ["TX", "0x2a7f…c8d4", "relayed for you"], ["YOUR DEADLINE", "#4,183,061", "150 blocks"]], img: STILL.seated, pos: "62% 34%", cap: "Your secret matches its commit" },
  { t: "Drawn", s: "lot drawn", d: [["RESULT", "0x3f9a…c21e", "H(house, secret, lock)"], ["METAL", "Gold", "8% of lots"], ["EMBLEM", "Kleros", "5% of lots"], ["CHECKS", "6 / 6", "verifiable in browser"]], img: STILL.ticketOut, pos: "62% 55%", cap: "Ticket 271 comes out as the lot" },
];
const FAQ: [string, string][] = [
  ["Is this gambling?", "No. The flagship is an NFT mint: you pay a fixed price for a lot, and the fair result only decides its traits."],
  ["What if the house goes offline?", "You still get your lot with floor traits, plus your 1 QOR back and a 2 QOR penalty paid to you from the house bond."],
  ["What is ML-DSA-87?", "A post-quantum signature standard. The house money only moves with an ML-DSA-87 signature, so a stolen ECDSA key moves nothing."],
  ["Why not Chainlink VRF?", "It is not on QoreChain, and its elliptic-curve cryptography breaks on Q-Day. Sortes uses only hashes and post-quantum signatures."],
  ["Is this on mainnet?", "Testnet only for now. The post-quantum precompiles Sortes relies on are live on the QoreChain testnet."],
];
const FORGE = `[PASS] test_guarantee1_houseCannotSteer()
  revealHouse(1, 0x7a1f…)
  └─ ← revert BadReveal
       H(value) 0x51ce…  ≠  chain checkpoint 0x9b2e…

1 passed · 0 failed`;

export function MainPage() {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const toast = useToast();
  const [scroll, setScroll] = useState(false);
  const [step, setStep] = useState(0);
  const [deskPaused, setDeskPaused] = useState(false);
  const [open, setOpen] = useState(0);
  const [results, setResults] = useState<Record<string, AttackResult>>({});
  const pausedRef = useRef(false); pausedRef.current = deskPaused;
  const { rows, total } = useRecentLots(16);

  useEffect(() => {
    if (window.innerHeight < 1500) setScroll(true);
    const t = setInterval(() => { if (!pausedRef.current && !document.hidden) setStep((s) => (s + 1) % 5); }, 4200);
    fetch("/attacks.json").then((r) => (r.ok ? r.json() : [])).then((l: AttackResult[]) => setResults(Object.fromEntries(l.map((x) => [x.name, x])))).catch(() => {});
    return () => clearInterval(t);
  }, []);

  const real = (rows?.length ?? 0) > 0;
  const lotCard = (n: number, f: string, g: string, e: string, s: string, a: string, tier: string, tc: string) => ({ n, field: f, glyph: g, eng: e, seal: s, aura: a, tier, label: "LOT #" + n, tc });
  const cards = real
    ? rows!.filter((r) => r.lot.finalized).map((r) => { const ap = artProps(r.lot.traits); return lotCard(r.n, ap.field, ap.glyph, ap.engraving, ap.seal, ap.aura, TIERS[tierOf(r.lot.traits)], TIER_VAR[tierOf(r.lot.traits)]); })
    : SAMPLE.map((x, i) => lotCard(x[0], x[1], x[2], x[3], x[4], x[5], SAMPLE_TIER[i], TIER_VAR[TIERS.indexOf(SAMPLE_TIER[i] as any)]));
  const base = cards.length >= 4 ? cards : SAMPLE.map((x, i) => lotCard(x[0], x[1], x[2], x[3], x[4], x[5], SAMPLE_TIER[i], TIER_VAR[TIERS.indexOf(SAMPLE_TIER[i] as any)]));
  const lotsA = base.concat(base), lotsB = base.slice().reverse().concat(base.slice().reverse());

  const proofs = (real ? rows!.slice(0, 5) : []).map((r) => ({
    n: r.n, h: r.result && r.result !== "0x" + "0".repeat(64) ? short(r.result, 10, 6) : "floor result",
    t: r.block ? `request block #${num(r.block)}` : "request", chip: r.status === Status.Fulfilled ? "Fulfilled" : r.status === Status.None ? "—" : r.status >= Status.HouseTimedOut ? "Floor" : "In progress",
  }));
  const sampleProofs = [312, 311, 310, 309, 308].map((n) => ({ n, h: "0x…", t: "sample", chip: "Sample" }));

  const cur = DESK[step];
  const refusal = (a: (typeof ATTACKS)[number]) => { const r = results[a.key]; return { id: a.id, t: a.title, res: a.res, c: a.kind === "reverted" ? "var(--acc)" : a.kind === "floor" ? "var(--warn)" : "var(--mut)", live: !!r }; };
  const v = {
    theme, isDark: theme === "dark", setTheme,
    wallet: wallet.label, mode: scroll ? "scroll" : "auto", pinH: scroll ? "min(640vh, 5760px)" : "900px", storyH: scroll ? "min(100svh, 900px)" : "900px",
    forgeHtml: highlight(FORGE).replace(/(\[PASS\] [^\n]*)/, '<span style="color:#8cc27a">$1</span>').replace(/(1 passed · 0 failed)/, '<span style="color:#f0a37a">$1</span>'),
    codeHtml: highlight(COINFLIP_SHORT),
    copyCode: () => { navigator.clipboard?.writeText(COINFLIP_SHORT).then(() => toast.push({ c: "var(--ok)", t: "Copied", d: "The example contract is on your clipboard." })); },
    inputs: [
      { img: frameUrl(STILL.houseTicket), pos: "80% 42%", cap: "ticket into the top row", alt: "A bronze ticket sliding into a slot of the marble machine", r: "I", who: "The house", tag: "locked first", t: "A value", ti: "locked in advance", p: "The house commits to a hash chain before anyone arrives. Its reveal must hash to the next link, or it reverts.", mb: "var(--acc)", mf: "var(--btnInk)", rows: [{ k: "link #127", v: "0x9b2e…41c0", c: "var(--mut)" }, { k: "link #128", v: "sealed", c: "var(--acc)" }, { k: "forged reveal", v: "reverts", c: "var(--acc)" }] },
      { img: frameUrl(STILL.funnel), pos: "74% 32%", cap: "white ball, the funnel", alt: "A white ball dropping into the bronze funnel", r: "II", who: "You", tag: "committed blind", t: "A secret,", ti: "sent as a hash", p: "Your browser keeps the secret and sends only its hash. Swapping it later reverts; staying silent gets you the floor.", mb: "#f7f2e9", mf: "#16110d", rows: [{ k: "commitment", v: "0x6c40…b215", c: "var(--mut)" }, { k: "value", v: "1 QOR", c: "var(--mut)" }, { k: "swapped secret", v: "reverts", c: "var(--acc)" }] },
      { img: frameUrl(STILL.blackBall), pos: "62% 33%", cap: "black ball, sealed", alt: "A black ball dropping into the bronze funnel", r: "III", who: "The block", tag: "nobody had seen", t: "A block", ti: "nobody could know", p: "The lock block lands two blocks after your commit. Its hash did not exist when the house or you chose.", mb: "#16110d", mf: "#f7f2e9", rows: [{ k: "commit", v: "#4,182,905", c: "var(--mut)" }, { k: "lock", v: "#4,182,907", c: "var(--mut)" }, { k: "hash", v: "0xd03a…5e19", c: "var(--ink)" }] },
    ],
    deskPos: cur.pos, deskImg: frameUrl(cur.img), deskKey: String(step), deskCap: cur.cap, deskAlt: "Rendered still of the allotment machine at the " + cur.t + " stop",
    desk: cur.d.map((x) => ({ k: x[0], v: x[1], n: x[2], c: x[0] === "RESULT" || x[0] === "CHECKS" ? "#f0a37a" : "#f7f2e9" })),
    deskStatus: cur.s,
    tabs: DESK.map((d, i) => ({ t: d.t, n: "0" + (i + 1), sel: i === step ? "true" : "false", c: i === step ? "#f7f2e9" : "#a89a87", w: i < step ? 100 : i === step ? 60 : 0, pick: () => { setStep(i); setDeskPaused(true); } })),
    toggleDesk: () => setDeskPaused((x) => !x), deskLabel: deskPaused ? "Play the desk" : "Pause the desk",
    deskIcon: deskPaused ? "M7 4l13 8-13 8z" : "M5 4h5v16H5zM14 4h5v16h-5z",
    proofs: proofs.length ? proofs : sampleProofs,
    refusals: ATTACKS.map(refusal),
    lotsA, lotsB,
    faq: FAQ.map((f, i) => ({ q: f[0], a: f[1], open: open === i, exp: open === i ? "true" : "false", rot: open === i ? 45 : 0, bg: open === i ? "var(--ink)" : "transparent", fg: open === i ? "var(--bg)" : "var(--ink)", toggle: () => setOpen(open === i ? -1 : i) })),
    total,
  };
  return <MainView v={v} />;
}
