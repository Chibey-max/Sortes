"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/theme";
import { A } from "@/components/A";
import { useWallet } from "@/lib/wallet";
import { getQorexNative } from "@/lib/qorex";
import { qor, useQorBalance } from "@/lib/data";
import { short } from "@/lib/live";
import { useToast } from "@/lib/toast";
import { CONFIG } from "@/lib/config";

const QOREX_URL = "https://qorechain.io/qorex";
const METAMASK_URL = "https://metamask.io/download/";

/**
 * Connect / disconnect. Not connected: a button that opens a chooser (QoreX for free sponsored
 * draws, MetaMask for paid draws). Connected: an account chip that opens the account panel
 * (addresses, balance, network, your lots, disconnect). `inline` renders the panel content flat,
 * for the mobile menu sheet.
 */
export function WalletMenu({ inline = false, onDone }: { inline?: boolean; onDone?: () => void }) {
  const w = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [hasQorex, setHasQorex] = useState(true);
  const [hasMetaMask, setHasMetaMask] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>();
  const { theme } = useTheme();
  const id = useId();
  const asked = useRef(false);
  const bal = useQorBalance(w.address).data as bigint | undefined;

  useEffect(() => {
    setHasQorex(!!getQorexNative());
    setHasMetaMask(typeof window !== "undefined" && !!(window as any).ethereum);
  }, [open]);

  useEffect(() => {
    if (!open || inline) return;
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!root.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); (root.current?.querySelector("button") as HTMLButtonElement | null)?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open, inline]);

  // The popover lives in a portal on <body> (the page body is a later stacking context than the
  // header), so it is placed under the button by hand and follows it on scroll and resize.
  useLayoutEffect(() => {
    if (!open || inline) return;
    const place = () => { const r = root.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 10, right: Math.max(12, window.innerWidth - r.right) }); };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place); };
  }, [open, inline]);

  // Surface connection errors once, wherever the user connected from.
  useEffect(() => {
    if (!w.error || !asked.current) return;
    asked.current = false;
    const m = {
      "no-qorex": ["QoreX was not found.", "Install the QoreX extension, switch it to the diana testnet, then reload."],
      "no-metamask": ["MetaMask was not found.", "Install MetaMask, or use QoreX for a free draw."],
      rejected: ["Connection cancelled.", "Nothing was shared. You can try again."],
      network: ["Wrong network.", "Switch your wallet to QoreChain diana (testnet), then try again."],
    }[w.error];
    if (m) toast.push({ c: "var(--bad)", t: m[0], d: m[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.error]);

  const done = () => { setOpen(false); onDone?.(); };
  const pick = async (k: "qorex" | "evm") => {
    asked.current = true;
    if (k === "qorex" && !hasQorex) { window.open(QOREX_URL, "_blank", "noopener"); return; }
    if (k === "evm" && !hasMetaMask) { window.open(METAMASK_URL, "_blank", "noopener"); return; }
    if (k === "qorex") { const a = await w.connectQorex(); if (a) { done(); toast.push({ c: "var(--ok)", t: "QoreX connected", d: `${short(a.qor, 8, 6)} · free draws available` }); } }
    else { await w.connectEvm(); done(); }
  };
  const copy = async (s: string, what: string) => {
    try { await navigator.clipboard.writeText(s); toast.push({ c: "var(--ok)", t: `${what} copied`, ms: 2500 }); } catch {}
  };
  const disconnect = () => { w.disconnect(); done(); toast.push({ c: "var(--mut)", t: "Wallet disconnected", d: "Your saved secrets stay in this browser.", ms: 3500 }); };

  const chooser = (
    <div className="wm-list" role="group" aria-label="Choose a wallet">
      <button type="button" className="wm-opt" onClick={() => pick("qorex")} disabled={w.busy}>
        <span className="wm-ico" aria-hidden="true" style={{ background: "var(--ink)", color: "var(--acc)" }}>Q</span>
        <span className="wm-tx"><b>QoreX</b><span>{hasQorex ? "Free sponsored draws · post-quantum account" : "Not installed · get the extension"}</span></span>
        <span className="wm-tag">{hasQorex ? "Free" : "Install"}</span>
      </button>
      <button type="button" className="wm-opt" onClick={() => pick("evm")} disabled={w.busy}>
        <span className="wm-ico" aria-hidden="true" style={{ background: "#f6851b", color: "#fff" }}>M</span>
        <span className="wm-tx"><b>MetaMask</b><span>{hasMetaMask ? "Paid draws · 1 QOR inside a QoreX EVM window" : "Not installed · get the extension"}</span></span>
        <span className="wm-tag">{hasMetaMask ? "1 QOR" : "Install"}</span>
      </button>
      <p className="wm-note">{w.busy ? "Waiting for your wallet…" : "Sortes runs on QoreChain diana, the testnet. Nothing is sent until you approve a draw."}</p>
    </div>
  );

  const account = w.address && (
    <div className="wm-list">
      <div className="wm-head">
        <span className="wm-ico" aria-hidden="true" style={w.kind === "qorex" ? { background: "var(--ink)", color: "var(--acc)" } : { background: "#f6851b", color: "#fff" }}>{w.kind === "qorex" ? "Q" : "M"}</span>
        <span className="wm-tx"><b>{w.kind === "qorex" ? (w.qorex?.name || "QoreX") : "MetaMask"}</b><span>{bal !== undefined ? `${qor(bal)} QOR` : "Reading balance…"}</span></span>
      </div>
      {!w.evmChainOk && (
        <button type="button" className="wm-warn" onClick={() => w.switchToDiana()}>Wrong network. Switch to diana</button>
      )}
      {w.qorex && (
        <button type="button" className="wm-row" onClick={() => copy(w.qorex!.qor, "qor1 address")} title={w.qorex.qor}>
          <span>qor1 address</span><span className="mono">{short(w.qorex.qor, 8, 6)}</span>
        </button>
      )}
      <button type="button" className="wm-row" onClick={() => copy(w.address!, "EVM address")} title={w.address}>
        <span>EVM address</span><span className="mono">{short(w.address, 6, 4)}</span>
      </button>
      <A className="wm-row" href="/gallery?mine=1" onClick={done}><span>Your lots</span><span aria-hidden="true">→</span></A>
      <A className="wm-row" href={`${CONFIG.explorer}/address/${w.address}`} target="_blank" rel="noreferrer" onClick={done}><span>View on explorer</span><span aria-hidden="true">↗</span></A>
      <button type="button" className="wm-dis" onClick={disconnect}>Disconnect</button>
    </div>
  );

  if (inline) return <div className="wm wm-inline">{w.address ? account : chooser}</div>;

  return (
    <div className="wm" ref={root}>
      {w.address ? (
        <button type="button" className="btn btn-g btn-s cta wm-chip" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <span className="dot" style={{ background: w.evmChainOk ? "var(--ok)" : "var(--warn)" }} />
          <span className="mono" style={{ fontWeight: 500 }}>{w.label}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      ) : (
        <button type="button" className="btn btn-p btn-s cta" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} disabled={w.busy}>
          {w.busy ? "Connecting…" : "Connect wallet"}
        </button>
      )}
      {open && pos && createPortal(
        <div ref={pop} className={`wm-pop ${theme}`} id={id} role="dialog" aria-label={w.address ? "Your wallet" : "Connect a wallet"} style={{ top: pos.top, right: pos.right }}>{w.address ? account : chooser}</div>,
        document.body,
      )}
    </div>
  );
}
