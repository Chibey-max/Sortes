"use client";

import { useEffect, useRef, useState } from "react";
import { NavView } from "./views/NavView";
import { WalletMenu } from "@/components/WalletMenu";

export interface NavProps {
  active?: string;
  dark?: boolean | string;
  wallet?: string;
  menuOpen?: boolean | string;
  showToggle?: boolean | string;
  cta?: string;
  overlay?: boolean | string;
  onTheme?: (t: "light" | "dark") => void;
  onCta?: () => void;
}

const LINKS: [string, string][] = [["Mint", "/mint"], ["Gallery", "/gallery"], ["Verify", "/verify"], ["Attacks", "/attacks"], ["Build", "/build"], ["House", "/house"]];
const on = (x: unknown) => x === true || x === "true";

export function Nav(p: NavProps) {
  const [openState, setOpen] = useState(false);
  const [hid, setHid] = useState(false);
  const openRef = useRef(false);
  const dark = on(p.dark);
  const open = on(p.menuOpen) || openState;
  openRef.current = open;

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      if (openRef.current || y < 96) setHid(false);
      else if (delta > 8) setHid(true);
      else if (delta < -8) setHid(false);
      if (Math.abs(delta) > 8 || y < 96) last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const w = p.wallet || "";
  const v = {
    th: `${dark ? "dark" : "light"}${hid && !open ? " off" : ""}`, isDark: dark, isLight: !dark,
    overlay: on(p.overlay),
    links: LINKS.map(([t, href]) => ({ t, href, cur: p.active === t ? "page" : undefined })),
    hasToggle: p.showToggle !== false && p.showToggle !== "false",
    tgLabel: dark ? "Switch to light mode" : "Switch to dark mode",
    toggle: () => p.onTheme?.(dark ? "light" : "dark"),
    connected: !!w, notConnected: !w, wallet: w, cta: p.cta || "Connect QoreX",
    open, closed: !open, openStr: open ? "true" : "false", menuLabel: open ? "Close menu" : "Open menu",
    toggleMenu: () => setOpen(!open),
    walletSlot: <WalletMenu />,
    sheetWallet: <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}><WalletMenu inline onDone={() => setOpen(false)} /></div>,
  };
  return <NavView v={v} />;
}
