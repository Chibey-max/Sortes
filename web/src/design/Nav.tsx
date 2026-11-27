"use client";

import { useState } from "react";
import { NavView } from "./views/NavView";

export interface NavProps {
  active?: string;
  dark?: boolean | string;
  wallet?: string;
  menuOpen?: boolean | string;
  showToggle?: boolean | string;
  cta?: string;
  onTheme?: (t: "light" | "dark") => void;
  onCta?: () => void;
}

const LINKS: [string, string][] = [["Mint", "/mint"], ["Gallery", "/gallery"], ["Verify", "/verify"], ["Attacks", "/attacks"], ["Build", "/build"], ["House", "/house"]];
const on = (x: unknown) => x === true || x === "true";

export function Nav(p: NavProps) {
  const [openState, setOpen] = useState(false);
  const dark = on(p.dark);
  const open = on(p.menuOpen) || openState;
  const w = p.wallet || "";
  const v = {
    th: dark ? "dark" : "light", isDark: dark, isLight: !dark,
    links: LINKS.map(([t, href]) => ({ t, href, cur: p.active === t ? "page" : undefined })),
    hasToggle: p.showToggle !== false && p.showToggle !== "false",
    tgLabel: dark ? "Switch to light mode" : "Switch to dark mode",
    toggle: () => p.onTheme?.(dark ? "light" : "dark"),
    connected: !!w, notConnected: !w, wallet: w, cta: p.cta || "Connect QoreX",
    open, closed: !open, openStr: open ? "true" : "false", menuLabel: open ? "Close menu" : "Open menu",
    toggleMenu: () => setOpen(!open),
  };
  return <NavView v={v} />;
}
