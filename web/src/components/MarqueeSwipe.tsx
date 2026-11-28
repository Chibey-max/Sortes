"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Lets the lot strips be swiped; they keep drifting on their own when the pointer is up. */
export function MarqueeSwipe() {
  const path = usePathname();

  useEffect(() => {
    const bound = new WeakSet<HTMLElement>();
    const offs: (() => void)[] = [];

    const attach = (mq: HTMLElement) => {
      if (bound.has(mq)) return;
      const trk = mq.querySelector<HTMLElement>(".trk");
      if (!trk) return;
      bound.add(mq);
      trk.style.animation = "none";
      mq.style.overflowX = "auto";
      mq.style.overflowY = "hidden";
      const reverse = trk.classList.contains("rev");
      const dur = reverse ? 72000 : mq.closest(".pg-Gallery") ? 48000 : 60000;
      let hold = false;
      let dragged = 0;
      let last = performance.now();
      let raf = 0;
      if (reverse) mq.scrollLeft = 8;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(48, now - last);
        last = now;
        if (hold || document.hidden) return;
        const half = trk.scrollWidth / 2;
        if (half < 16) return;
        mq.scrollLeft += (reverse ? -1 : 1) * (half * dt / dur);
        if (!reverse && mq.scrollLeft >= half) mq.scrollLeft -= half;
        if (reverse && mq.scrollLeft <= 0) mq.scrollLeft += half;
      };
      const down = (e: PointerEvent) => { hold = true; dragged = 0; mq.dataset.px = String(e.clientX); };
      const move = (e: PointerEvent) => {
        if (!hold) return;
        dragged += Math.abs(e.clientX - Number(mq.dataset.px || 0));
        mq.dataset.px = String(e.clientX);
      };
      const up = () => { hold = false; last = performance.now(); };
      const click = (e: Event) => { if (dragged > 8) e.preventDefault(); };
      mq.addEventListener("pointerdown", down);
      mq.addEventListener("pointermove", move);
      mq.addEventListener("click", click, true);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      raf = requestAnimationFrame(loop);
      offs.push(() => {
        cancelAnimationFrame(raf);
        mq.removeEventListener("pointerdown", down);
        mq.removeEventListener("pointermove", move);
        mq.removeEventListener("click", click, true);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        trk.style.animation = "";
      });
    };

    const scan = () => { document.querySelectorAll<HTMLElement>(".mq").forEach(attach); };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    offs.push(() => mo.disconnect());
    return () => offs.forEach((fn) => fn());
  }, [path]);

  return null;
}
