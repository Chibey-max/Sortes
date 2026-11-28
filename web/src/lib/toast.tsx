"use client";

import { useTheme } from "./theme";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastInput { c?: string; t: string; d?: string; ms?: number }
interface Toast extends ToastInput { id: number }
const Ctx = createContext<{ push: (t: ToastInput) => void }>({ push: () => {} });

/** Compact notices. Do not put `.pg` on these — that class is the full page shell (100vh). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const { theme } = useTheme();
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setList((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = ++n.current;
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), t.ms ?? 5200);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);
  const host = (
    <div
      className={theme}
      role="region"
      aria-label="Notifications"
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 2147483646,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: 300,
        maxWidth: "calc(100vw - 32px)",
        pointerEvents: "none",
        transform: "none",
      }}
    >
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          style={{
            pointerEvents: "auto",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            minHeight: 0,
            height: "auto",
            padding: "12px 12px 12px 14px",
            borderRadius: 14,
            background: "var(--surface)",
            color: "var(--ink)",
            border: "1px solid var(--line2)",
            boxShadow: "0 12px 32px rgba(22,17,13,.16)",
            fontFamily: "Manrope, sans-serif",
          }}
        >
          <span className="dot" style={{ width: 8, height: 8, marginTop: 6, background: t.c ?? "var(--acc)", flex: "none" }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 13.5, marginBottom: 2 }}>{t.t}</b>
            {t.d && <span style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--mut)" }}>{t.d}</span>}
          </span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} style={{ border: 0, background: "none", color: "var(--lab)", cursor: "pointer", width: 24, height: 24, flex: "none" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {host}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
