"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GalleryView } from "@/design/views/GalleryView";
import { useAllLots, type GalleryLot } from "@/lib/allLots";
import { ownerShort } from "@/lib/format";
import { num } from "@/lib/live";
import { useMintStats } from "@/lib/data";
import { TIERS, TIER_VAR, VARIANT_NAMES, artProps, fmtPct, greek, sharePct, tierOf } from "@/lib/traits";
import { useTheme } from "@/lib/theme";
import { useWallet } from "@/lib/wallet";

const PAGE = 24;
const SAMPLE_FEAT = { n: 271, f: "gold", g: "kleros", e: "meander", s: "star", a: "legendary", gr: greek(271), owner: "not drawn yet", label: "Example plate" };

function Inner() {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const q = useSearchParams();
  const stats = useMintStats().data;
  const { lots, error: lotsErr } = useAllLots();
  const [tier, setTier] = useState(-1);
  const [mineOnly, setMineOnly] = useState(q.get("mine") === "1");
  const [dense, setDense] = useState(false);
  const [asc, setAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  const all = lots ?? [];
  const done = all.filter((l) => l.finalized);
  const counts = [0, 1, 2, 3].map((t) => done.filter((l) => tierOf(l.traits) === t).length);
  const total = all.length, max = stats ? Number(stats.max) : 1000;
  const holders = new Set(all.map((l) => l.owner.toLowerCase())).size;

  const filtered = useMemo(() => {
    let r: GalleryLot[] = all;
    if (tier >= 0) r = r.filter((l) => l.finalized && tierOf(l.traits) === tier);
    if (mineOnly && wallet.address) r = r.filter((l) => l.owner.toLowerCase() === wallet.address!.toLowerCase());
    const s = search.trim().toLowerCase();
    if (s) r = r.filter((l) => String(l.n) === s.replace(/^n?º?\s*#?/, "") || l.owner.toLowerCase().includes(s));
    return asc ? r.slice().reverse() : r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, tier, mineOnly, wallet.address, search, asc]);

  const mk = (l: GalleryLot, i: number) => {
    const pend = !l.finalized, t = tierOf(l.traits), ap = artProps(l.traits);
    return {
      n: l.n, d: (i % 12) * 45, f: pend ? "obsidian" : ap.field, g: ap.glyph, e: ap.engraving, s: ap.seal, a: pend ? "none" : ap.aura, p: pend, lab: "LOT #" + l.n,
      t: pend ? "Drawing" : l.floor ? "Floor" : TIERS[t], c: pend ? "var(--mut)" : l.floor ? "var(--t1)" : TIER_VAR[t], tier: t, gr: greek(l.n), leg: !pend && !l.floor && t === 3 ? "leg" : "",
      tr: pend ? [] : [VARIANT_NAMES[0][l.traits[0]], VARIANT_NAMES[1][l.traits[1]], VARIANT_NAMES[2][l.traits[2]]],
      aria: `Lot ${l.n}, ${pend ? "being drawn" : l.floor ? "floor" : TIERS[t]}`,
    };
  };
  const grid = filtered.slice(0, shown).map(mk);
  const stripSrc = all.length ? all : [];
  const strip = [...stripSrc];
  while (strip.length && strip.length < 6) strip.push(...stripSrc);
  const marquee = strip.map(mk);
  const featSrc = done.find((l) => tierOf(l.traits) === 3 && !l.floor) ?? done.find((l) => !l.floor) ?? null;
  const feat = featSrc
    ? { n: featSrc.n, ...(({ field: f, glyph: g, engraving: e, seal: s, aura: a }) => ({ f, g, e, s, a }))(artProps(featSrc.traits)), gr: greek(featSrc.n), owner: `owner ${ownerShort(featSrc.owner)}`, label: tierOf(featSrc.traits) === 3 ? "Latest Legendary" : "Latest lot" }
    : { ...SAMPLE_FEAT, owner: "Draw the first one" };
  const featRows = featSrc ? featSrc.traits.map((tv, i) => ({ k: ["Metal", "Emblem", "Border", "Seal", "Frame"][i], v: VARIANT_NAMES[i][tv], r: `${fmtPct(sharePct(i, tv))} of lots` })) : [];

  const tiers = [["All rooms", -1, "var(--ink)", total], ["Common", 0, "var(--t1)", counts[0]], ["Uncommon", 1, "var(--t2)", counts[1]], ["Rare", 2, "var(--t3)", counts[2]], ["Legendary", 3, "var(--t4)", counts[3]]];
  const pct = (n: number) => (max ? (n / max) * 100 : 0);
  const empty = filtered.length === 0 && lots !== null;
  const v = {
    th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label,
    drawn: lots === null ? (stats ? num(Number(stats.total)) : "…") : num(total), ofMax: `of ${num(max)} drawn`, holdersLine: `${num(holders)} ${holders === 1 ? "holder" : "holders"}`,
    rar: counts.map((c, i) => ({ w: pct(c), c: TIER_VAR[i] })), rarLabel: `Drawn so far: ${counts.map((c, i) => `${c} ${TIERS[i]}`).join(", ")}, ${Math.max(0, max - total)} still to draw`,
    legend: counts.map((c, i) => `${TIERS[i]} ${c}`),
    feat, ftr: featRows, hasLive: marquee.length > 0, live: marquee.concat(marquee),
    tiers: tiers.map(([t, k, c, n]) => ({ t, n: String(n), c, on: tier === k ? "true" : "false", go: () => { setTier(k as number); setShown(PAGE); } })),
    grid, empty, clear: () => { setTier(-1); setMineOnly(false); setSearch(""); },
    emptyNote: lotsErr ? "Could not read lots from the node. Reload this page." : lots && lots.length === 0 ? "No lots have been drawn yet. Be the first." : mineOnly ? "None of the lots in this room belong to this address. Clear the filter, or draw one." : `${counts[3]} Legendary lots have been drawn, and none match this filter. Clear it, or draw one.`,
    dense: dense ? "dense" : "", densePressed: dense ? "true" : "false", toggleDense: () => setDense(!dense),
    sortLabel: asc ? "Oldest first" : "Newest first", sortPressed: asc ? "true" : "false", toggleSort: () => setAsc(!asc),
    search, onSearch: (e: any) => { setSearch(e.target.value); setShown(PAGE); },
    more: () => setShown((s) => s + PAGE), hasMore: shown < filtered.length, moreLabel: `Show ${Math.min(PAGE, filtered.length - shown)} more`, showing: `Showing ${Math.min(shown, filtered.length)} of ${filtered.length}`,
  };
  return <GalleryView v={v} />;
}

export function GalleryPage() { return <Suspense><Inner /></Suspense>; }
