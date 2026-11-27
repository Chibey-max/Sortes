"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
const KEY = "sortes:theme";
const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "light", setTheme: () => {} });

/** Runs before hydration (see layout) so a dark-mode visitor never sees a white flash. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server and first client render are both "light" so hydration matches; the real theme lands in an effect.
  const [theme, set] = useState<Theme>("light");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "dark" || t === "light") set(t);
  }, []);
  const setTheme = useCallback((t: Theme) => {
    set(t);
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(KEY, t); } catch {}
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
