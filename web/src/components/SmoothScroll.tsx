"use client";

import { useLayoutEffect, useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

function toTop() {
  try {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const lenis = (window as any).__lenis as Lenis | undefined;
    lenis?.scrollTo(0, { immediate: true, force: true });
  } catch { /* never block navigation */ }
}

/**
 * Lenis drives wheel/trackpad. Native window scroll is reset on every route so a click
 * in the nav always opens the new page at the top, not where the last page was.
 */
export function SmoothScroll() {
  const path = usePathname();

  useEffect(() => {
    history.scrollRestoration = "manual";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      const lenis = new Lenis({
        autoRaf: true,
        lerp: 0.088,
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 0.8,
        anchors: false,
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

  useLayoutEffect(() => {
    toTop();
    const a = requestAnimationFrame(toTop);
    const b = window.setTimeout(toTop, 40);
    const c = window.setTimeout(toTop, 200);
    return () => { cancelAnimationFrame(a); clearTimeout(b); clearTimeout(c); };
  }, [path]);

  return null;
}
