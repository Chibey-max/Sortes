"use client";

import { useEffect, useState } from "react";
import { LotView } from "@/design/views/LotView";
import { ErrorPage } from "@/design/ErrorPage";
import { ownerOf, readLot, readRequest, requestTxs, type HouseRequest, type Lot } from "@/lib/chain";
import { CONFIG, addressUrl, isDeployed, txUrl } from "@/lib/config";
import { fmtDuration, blocksToSeconds, useHouseParams } from "@/lib/data";
import { num, short } from "@/lib/live";
import { Status } from "@/lib/protocol";
import { VARIANT_NAMES, TIERS, TIER_VAR, TRAIT_NAMES, artProps, sharePct, tierOf, fmtPct } from "@/lib/traits";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import { useWallet } from "@/lib/wallet";
import { verify, type Verification } from "@/lib/verify";
import { LotActions } from "@/components/LotActions";

const ZERO = "0x" + "0".repeat(64);

export function LotPage({ id }: { id: string }) {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const toast = useToast();
  const params = useHouseParams().data;
  const [lot, setLot] = useState<Lot | null>(null);
  const [req, setReq] = useState<HouseRequest | null>(null);
  const [owner, setOwner] = useState<string>();
  const [txs, setTxs] = useState<{ label: string; tx: string }[]>([]);
  const [ver, setVer] = useState<Verification | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const tokenId = /^\d+$/.test(id) ? BigInt(id) : null;

  useEffect(() => {
    if (tokenId === null || !isDeployed) { setState("missing"); return; }
    let live = true;
    const load = async () => {
      try {
        const l = await readLot(tokenId);
        const r = await readRequest(l.requestId);
        if (!live) return;
        setLot(l); setReq(r); setState("ok");
        const [o, t] = await Promise.all([ownerOf(tokenId), requestTxs(l.requestId).catch(() => [])]);
        if (!live) return;
        setOwner(o); setTxs(t);
        verify({ tokenId }).then((x) => live && setVer(x)).catch(() => {});
      } catch { if (live) setState((s) => (s === "loading" ? "missing" : s)); }
    };
    void load();
    const t = setInterval(() => { if (!lot?.finalized) void load(); }, 6000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lot?.finalized]);

  if (state === "missing") return <ErrorPage kind="404" />;
  if (state === "loading" || !lot || !req) return <LotView v={{ th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label, n: Number(id), ...skeleton(Number(id)) }} />;

  const n = Number(tokenId);
  const pending = !lot.finalized;
  const floor = lot.finalized && lot.isFloor;
  const t = tierOf(lot.traits);
  const ap = artProps(lot.traits);
  const checks = ver?.checks ?? [];
  const passed = checks.filter((c) => c.pass === true).length;
  const ok = (name: string, on: boolean) => ({ t: name, ok: on ? 1 : 0, bg: on ? "var(--ok)" : "transparent", bd: on ? "var(--ok)" : "var(--line2)", fg: on ? "var(--ink)" : "var(--lab)" });
  const byName = Object.fromEntries(checks.map((c) => [c.name, c.pass === true]));
  const checkRows = [["House chain", "House value hashes to the anchor"], ["Your secret", "Secret matches the commitment"], ["Lock block", "Lock hash is the lock block's"], ["Result hash", "Result recomputes from the inputs"], ["Traits", "Traits recompute from the result"], ["Deadlines", "Finished within its deadlines"]].map(([label, key]) => ok(label, !!byName[key]));
  const link = (label: string) => txs.find((x) => x.label === label)?.tx;
  const tx = (label: string) => { const h = link(label); return h ? { h: short(h, 8, 4), url: txUrl(h) } : { h: "", url: "" }; };
  const wHouse = params ? Number(params.W_HOUSE) : 100, wUser = params ? Number(params.W_USER) : 150;
  const sponsored = lot.sponsored;
  const houseMissed = req.status === Status.HouseTimedOut, userMissed = req.status === Status.UserTimedOut;
  const houseDone = req.houseValue !== ZERO;
  const secret = ver?.inputs.secret;

  const traitRows = lot.finalized
    ? lot.traits.map((tv, i) => ({ k: TRAIT_NAMES[i], v: VARIANT_NAMES[i][tv], r: floor ? "floor" : `${fmtPct(sharePct(i, tv))} of lots` }))
    : TRAIT_NAMES.map((k) => ({ k, v: "pending", r: "" }));

  const note = pending
    ? { cls: "info", t: req.status === Status.Requested ? `Waiting for lock block #${num(req.lockBlock)}.` : "The house revealed. Your reveal is on its way.", d: "Keep this tab open or come back later; your secret is saved in the browser you minted from." }
    : floor ? { cls: "warn", t: houseMissed ? "The house went silent, so you were made whole." : "The reveal window closed, so this lot kept its floor.", d: houseMissed ? "Your lot has floor traits, your fee came back and the house bond paid you a 2 QOR penalty." : "Your lot has floor traits. The house keeps the fee, as the rules say." } : undefined;
  const v = {
    th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label,
    n, f: ap.field, g: ap.glyph, e: ap.engraving, s: ap.seal, a: ap.aura, pending, label: `LOT #${n}`,
    tier: pending ? "Being drawn" : floor ? "Floor" : TIERS[t], tc: pending ? "var(--mut)" : floor ? "var(--t1)" : TIER_VAR[t],
    statusChip: pending ? "waiting for the draw" : floor ? (houseMissed ? "house missed its reveal" : "reveal window closed") : `${passed} of ${checks.length || 6} checks`,
    sub: pending ? "is being drawn." : floor ? "kept its floor." : "drawn fairly.",
    hasNote: !!note, noteCls: note?.cls, noteT: note?.t, noteD: note?.d,
    when: pending ? "in progress" : `request block #${num(req.requestBlock)}`,
    owner: owner ? short(owner, 6, 4) : "…", requestLabel: `#${req.id}`,
    explorerUrl: owner ? addressUrl(CONFIG.mint) : "/build",
    share: () => { void navigator.clipboard?.writeText(window.location.href).then(() => toast.push({ c: "var(--ok)", t: "Link copied", d: "Anyone with it can verify this lot." })); },
    traits: traitRows,
    checkC: pending || passed < checks.length ? "var(--warn)" : "var(--ok)",
    checksLabel: !ver ? "Checking…" : pending ? `${passed} of ${checks.length} checks so far` : `${passed} of ${checks.length} checks passed`,
    inputs: [
      { k: `House link #${req.position}`, v: houseDone ? short(req.houseValue, 6, 4) : houseMissed ? "never revealed" : "not revealed yet", c: "#b48a52" },
      { k: "Your secret", v: secret ? short(secret, 6, 4) : pending ? "hidden until reveal" : "none (timeout)", c: "#ffffff" },
      { k: `Lock block #${num(req.lockBlock)}`, v: req.lockHash && req.lockHash !== ZERO ? short(req.lockHash, 6, 4) : houseDone ? "zero on diana" : "not read yet", c: "#16110d" },
    ],
    result: pending ? "not drawn yet" : floor ? "floor (zero: nobody revealed)" : req.result,
    checks: checkRows,
    tl: [
      ["Commit", sponsored ? "You sent the hash of your secret. The fee came from the free-draw pool." : "You paid and sent the hash of your secret.", tx("Requested").h || `#${num(req.requestBlock)}`, 1, tx("Requested").url],
      ["Lock block", "Mined two blocks after your commit.", `#${num(req.lockBlock)}`, req.lockBlock > 0n ? 1 : 0, ""],
      ["House reveal", houseMissed ? `Missed. The window closed after ${wHouse} blocks (about ${fmtDuration(blocksToSeconds(wHouse))}).` : houseDone ? `Link #${req.position} hashed to the chain.` : "Waiting for the house.", houseMissed ? "missed" : tx("House revealed").h || (houseDone ? `#${num(req.houseRevealBlock)}` : "waiting"), houseMissed ? 2 : houseDone ? 1 : 0, tx("House revealed").url],
      ["Your reveal", userMissed ? `Missed. The window closed after ${wUser} blocks.` : req.status === Status.Fulfilled ? "Your secret matched your commitment." : "Waiting for your reveal.", userMissed ? "missed" : tx("Fulfilled").h || "waiting", userMissed ? 2 : req.status === Status.Fulfilled ? 1 : 0, tx("Fulfilled").url],
      ["Finalized", floor ? "Floor traits assigned." : lot.finalized ? "Traits painted from the result." : "Waiting for the result.", lot.finalized ? "done" : "waiting", lot.finalized ? 1 : 0, ""],
    ].map((s) => ({ t: s[0], d: s[1], h: s[2], url: s[4], c: s[3] === 2 ? "var(--warn)" : s[3] ? "var(--ok)" : "var(--line2)", f: s[3] === 1 ? "var(--ok)" : "transparent" })),
    noop: () => {},
  };
  return (
    <>
      <LotView v={v} />
      <LotActions requestId={req.id} tokenId={lot.tokenId} />
    </>
  );
}

function skeleton(n: number) {
  return {
    f: "obsidian", g: "circle", e: "lines", s: "dots", a: "none", pending: true, label: `LOT #${n}`, tier: "Loading", tc: "var(--mut)", statusChip: "loading from the chain", sub: "is loading.", hasNote: false,
    when: "…", owner: "…", requestLabel: "…", explorerUrl: "/build", share: () => {}, traits: TRAIT_NAMES.map((k) => ({ k, v: "…", r: "" })), checkC: "var(--warn)", checksLabel: "Checking…", inputs: [], result: "…", checks: [], tl: [], noop: () => {},
  };
}
