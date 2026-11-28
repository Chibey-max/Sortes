"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * Lenis (https://lenis.dev) drives wheel and trackpad. autoRaf keeps one compositor-friendly
 * loop running so the first tick after a flick is never late. Touch stays native.
 */
export function SmoothScroll() {
  const path = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      const lenis = new Lenis({
        autoRaf: true,
        lerp: 0.088,
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 0.8,
        anchors: true,
        allowNestedScroll: true,
        overscroll: false,
      });
      (window as any).__lenis = lenis;
      return () => {
        try { lenis.destroy(); } catch { /* already gone */ }
        delete (window as any).__lenis;
      };
    } catch (e) {
      console.warn("Lenis did not start; native scroll stays on.", e);
    }
  }, []);

  useEffect(() => {
    try {
      const lenis = (window as any).__lenis as Lenis | undefined;
      if (lenis && !location.hash) lenis.scrollTo(0, { immediate: true, force: true });
      lenis?.resize();
    } catch { /* a failed scroll reset must not blank the page */ }
  }, [path]);

  return null;
}
