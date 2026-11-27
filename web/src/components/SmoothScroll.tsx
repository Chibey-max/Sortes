"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * Lenis smooth scrolling for wheel and trackpad. Touch keeps the browser's native momentum scroll
 * (smoother and cheaper on phones than any JS scroller), and reduced-motion users get plain scroll.
 * One rAF loop drives Lenis and stops when the page is still.
 */
export function SmoothScroll() {
  const path = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false, anchors: true, allowNestedScroll: true, autoRaf: false });
    (window as any).__lenis = lenis;
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = lenis.isScrolling ? requestAnimationFrame(loop) : 0; };
    const wake = () => { if (!raf) raf = requestAnimationFrame(loop); };
    // Wake the loop on any input that can start a scroll; Lenis itself sleeps when idle.
    const opts = { passive: true } as const;
    window.addEventListener("wheel", wake, opts);
    window.addEventListener("keydown", wake);
    window.addEventListener("scroll", wake, opts);
    const origScrollTo = lenis.scrollTo.bind(lenis);
    (lenis as any).scrollTo = (...a: Parameters<typeof lenis.scrollTo>) => { origScrollTo(...a); wake(); };
    wake();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("scroll", wake);
      lenis.destroy();
      delete (window as any).__lenis;
    };
  }, []);

  // New page: start at the top without an animated scroll.
  useEffect(() => {
    const lenis = (window as any).__lenis as Lenis | undefined;
    if (lenis && !location.hash) lenis.scrollTo(0, { immediate: true, force: true });
    lenis?.resize();
  }, [path]);

  return null;
}
