"use client";

import { useTheme } from "./theme";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ToastInput { c?: string; t: string; d?: string; ms?: number }
interface Toast extends ToastInput { id: number }
const Ctx = createContext<{ push: (t: ToastInput) => void }>({ push: () => {} });

/** Toasts from the design: a dot, a bold line, one line of help, and a dismiss button. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const { theme } = useTheme();
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setList((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = ++n.current;
    setList((l) => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), t.ms ?? 7000);
  }, [dismiss]);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts-host" role="region" aria-label="Notifications">
        {list.map((t) => (
          <div key={t.id} className={`toast pg ${theme}`} role="status" style={{ background: "var(--surface)" }}>
            <span className="dot" style={{ width: 10, height: 10, marginTop: 4, background: t.c ?? "var(--acc)" }} />
            <span style={{ flex: 1 }}>
              <b style={{ display: "block", fontSize: 14, marginBottom: 2 }}>{t.t}</b>
              {t.d && <span className="small">{t.d}</span>}
            </span>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} style={{ border: 0, background: "none", color: "var(--lab)", cursor: "pointer", width: 28, height: 28 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
