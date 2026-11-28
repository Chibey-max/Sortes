"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { StoryView } from "./views/StoryView";
import { FRAME_COUNT, frameUrl } from "./frames";

export interface StoryProps { mode?: "auto" | "scroll" | "fixed"; theme?: "light" | "dark"; p?: number; h?: string }
const FEND = 0.9;
const STEPS: [string, string, number][] = [["I", "House", 0.16], ["II", "You", 0.32], ["III", "Block", 0.46], ["IV", "Draw", 0.61], ["V", "Lot", 0.96]];
const cl = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The pinned scroll story. The section is pinned for about 6 screens; scroll progress is smoothed
 * (lerp 0.09 per frame) and scrubs 144 rendered frames of the kleroterion. The cards on top walk
 * through one draw (an illustrative sample, not live data). Reduced motion stops the smoothing.
 */
export const Story = memo(function Story({ mode = "auto", theme = "light", p: pProp = 0.03, h = "900px" }: StoryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = useCallback((el: HTMLDivElement | null) => { rootRef.current = el; }, []);
  const [p, setP] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const kickRef = useRef<() => void>(() => {});
  const cur = useRef(0), tgt = useRef(0), acc = useRef(0), last = useRef<number | null>(null), rm = useRef(false), pausedRef = useRef(false), shown = useRef(-1);
  pausedRef.current = paused;

  useEffect(() => {
    rm.current = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const imgs: HTMLImageElement[] = [];
    const load = (i: number) => { const im = new Image(); im.decoding = "async"; im.src = frameUrl(i + 1); imgs[i] = im; };
    for (let i = 0; i < FRAME_COUNT; i += 6) load(i);
    const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 400));
    const cancelIdle = (window as any).cancelIdleCallback ?? clearTimeout;
    const lt = idle(() => { for (let i = 0; i < FRAME_COUNT; i++) if (!imgs[i]) load(i); });
    if (mode === "fixed") return () => cancelIdle(lt);

    let raf = 0, visible = true, lastUi = 0, lastFrame = -1;
    const paintFrame = (pp: number) => {
      const n = Math.round(1 + cl(pp / FEND) * 143);
      if (n === lastFrame) return;
      lastFrame = n;
      const img = rootRef.current?.querySelector("img.seq") as HTMLImageElement | null;
      if (img) img.src = frameUrl(n);
    };
    const measure = () => {
      const root = rootRef.current;
      const host = root?.closest("[data-scrub]") as HTMLElement | null;
      if (host && root) { const r = host.getBoundingClientRect(); const span = r.height - root.offsetHeight; tgt.current = span > 0 ? cl(-r.top / span) : 0; }
    };
    const smooth = () => (rm.current ? 1 : (window as any).__lenis ? 0.42 : 0.14);
    const tick = (now: number) => {
      raf = 0;
      if (mode === "scroll") {
        measure();
        const d = tgt.current - cur.current;
        cur.current = Math.abs(d) < 0.0004 ? tgt.current : cur.current + d * smooth();
      } else {
        const dt = Math.min(64, now - (last.current ?? now)); last.current = now;
        if (!pausedRef.current && !rm.current) acc.current += dt;
        const cyc = 26000; const t = (acc.current % cyc) / cyc;
        cur.current = rm.current ? 0.03 : Math.min(1, t * 1.1);
      }
      paintFrame(cur.current);
      if (now - lastUi > 32 || Math.abs(shown.current - cur.current) > 0.012) {
        lastUi = now;
        shown.current = cur.current;
        setP(cur.current);
      }
      const moving = mode === "scroll" ? cur.current !== tgt.current : !pausedRef.current && !rm.current;
      if (visible && moving) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf && visible) { last.current = null; raf = requestAnimationFrame(tick); } };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { rootMargin: "200px" });
    if (rootRef.current) io.observe(rootRef.current);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    kickRef.current = kick;
    kick();
    return () => { cancelAnimationFrame(raf); cancelIdle(lt); io.disconnect(); window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); };
  }, [mode]);

  const jump = (to: number | "past") => {
    if (mode === "scroll") {
      const root = rootRef.current; const host = root?.closest("[data-scrub]") as HTMLElement | null;
      if (!host || !root) return;
      const r = host.getBoundingClientRect(); const span = r.height - root.offsetHeight;
      const y = to === "past" ? window.scrollY + r.bottom : window.scrollY + r.top + span * to;
      const lenis = (window as any).__lenis;
      if (lenis && !rm.current) lenis.scrollTo(y, { duration: 1.4 });
      else window.scrollTo({ top: y, behavior: rm.current ? "auto" : "smooth" });
    } else if (mode === "auto" && to !== "past") {
      acc.current = (to / 1.1) * 26000; cur.current = to; setP(to); kickRef.current();
    }
  };

  const pp = mode === "fixed" || p == null ? cl(pProp) : p;
  const k = (a: number, b: number) => cl((pp - a) / (b - a));
  const win = (a: number, b: number, f: number) => Math.min(cl((pp - a) / f), cl((b - pp) / f));
  const want = 1 + cl(pp / FEND) * 143;
  const dark = theme === "dark";
  const C = dark
    ? { g: "#5e8a4a", a: "#e0703f", lab: "#a89a87", ink: "#f7f2e9", on: "#2a211a", off: "#140f0b", ond: "rgba(240,163,122,.4)", offd: "rgba(240,200,160,.1)" }
    : { g: "#4f7a3d", a: "#a3401d", lab: "#6f6558", ink: "#16110d", on: "#f1e8da", off: "#efe8dc", ond: "rgba(196,85,45,.35)", offd: "rgba(22,17,13,.08)" };
  const out: Record<string, any> = { setRoot, h, frame: frameUrl(want), theme: dark ? "dark" : "light" };
  out.alt = "A marble allotment machine with rows of bronze tickets and a bronze tube with a funnel.";
  out.veinOp = dark ? "0" : "1";
  const segs: [number, number, number][] = [[-1, 0.07, 0.045], [0.085, 0.23, 0.04], [0.245, 0.38, 0.04], [0.395, 0.52, 0.04], [0.535, 0.67, 0.04], [0.9, 2, 0.05]];
  segs.forEach((s, i) => {
    const o = win(s[0], s[1], s[2]);
    out["o" + i] = o.toFixed(3); out["pe" + i] = o > 0.5 ? "auto" : "none";
    const dir = pp < (s[0] + s[1]) / 2 ? 1 : -1;
    out["y" + i] = (dir * (1 - o) * 16).toFixed(1); out["r" + i] = (dir * (1 - o) * 4).toFixed(1);
  });
  const lp = (i: number) => cl((pp - segs[i][0]) / (segs[i][1] - segs[i][0]));
  const l1 = lp(1);
  out.chain = [{ n: 126, v: "0x2f40…b13d", vc: C.lab }, { n: 127, v: "0x9b2e…41c0", vc: C.lab }, { n: 128, v: l1 > 0.62 ? "0x4e17…a9c3" : "sealing…", vc: l1 > 0.62 ? C.a : C.lab }];
  out.h1w = (Math.min(1, l1 / 0.62) * 100).toFixed(1);
  out.h1s = l1 > 0.78 ? "Locked, ML-DSA-87 signature verified" : l1 > 0.62 ? "Link #128 locked on chain" : "Writing link #128";
  out.h1d = l1 > 0.62 ? C.g : C.a;
  const l2 = lp(2);
  const pressed = l2 > 0.48 && l2 < 0.58, done = l2 >= 0.58;
  out.wallet = [{ k: "Method", v: "commit(bytes32)" }, { k: "Commitment", v: "0x6c40…b215" }, { k: "Value", v: "1 QOR" }];
  out.apBg = done ? C.g : C.a; out.apS = pressed ? "0.95" : "1"; out.apG = pressed ? 18 : 0;
  out.apT = done ? "Approved" : "Approve"; out.rejOp = done ? "0.35" : "1";
  out.h2s = done ? "Commitment on chain. Your secret never left this browser." : "Waiting for your signature";
  out.h2d = done ? C.g : C.a;
  const l3 = lp(3);
  const bl = (i: number, t: number) => { const on = l3 > t; return { bg: i === 2 && on ? C.a : on ? C.on : C.off, bd: on ? C.ond : C.offd, fg: i === 2 && on ? "#f7f2e9" : C.ink }; };
  out.blocks = [
    { l: "Commit", n: "#…905", s: l3 > 0.12 ? "included" : "pending", ...bl(0, 0.12) },
    { l: "+1", n: "#…906", s: l3 > 0.42 ? "mined" : "waiting", ...bl(1, 0.42) },
    { l: "Lock", n: "#…907", s: l3 > 0.72 ? "sealed" : "unknown", ...bl(2, 0.72) },
  ];
  out.h3s = l3 > 0.72 ? "Lock block #…907 sealed the draw" : "Waiting two blocks after your commit";
  out.h3d = l3 > 0.72 ? C.g : C.a;
  const l4 = lp(4);
  out.inputs = [
    { k: "House value", v: "0x4e17…a9c3", c: "#c39556", o: (0.25 + 0.75 * cl(l4 / 0.12)).toFixed(2) },
    { k: "Your secret", v: "0x1f88…07de", c: dark ? "#f6f1e8" : "#ffffff", o: (0.25 + 0.75 * cl((l4 - 0.12) / 0.12)).toFixed(2) },
    { k: "Lock block", v: "0xd03a…5e19", c: "#141110", o: (0.25 + 0.75 * cl((l4 - 0.24) / 0.12)).toFixed(2) },
  ];
  const full = "0x3f9a2c71e08bd4c21e";
  const nch = Math.round(cl((l4 - 0.38) / 0.4) * full.length);
  out.res = nch < 3 ? "0x……" : full.slice(0, Math.min(nch, 6)) + (nch >= full.length ? "…c21e" : "…");
  out.resB = (0.15 + 0.5 * cl((l4 - 0.78) / 0.1)).toFixed(2);
  out.h4s = l4 > 0.8 ? "One white ball out. Row seven lit." : l4 > 0.38 ? "Hashing the three inputs" : "Inputs arriving";
  out.h4d = l4 > 0.8 ? C.g : C.a;
  const cap = win(0.69, 0.83, 0.025);
  out.capOp = cap.toFixed(3); out.capY = ((1 - cap) * 24).toFixed(1); out.capHidden = cap > 0.5 ? "false" : "true";
  out.wmOp = k(0.84, 0.92).toFixed(3); out.wmx = (6 - 12 * ease(k(0.84, 1))).toFixed(2);
  out.d1y = ((1 - ease(k(0.88, 0.95))) * 60).toFixed(1); out.d1o = k(0.88, 0.93).toFixed(3);
  out.d2y = ((1 - ease(k(0.9, 0.97))) * -60).toFixed(1); out.d2o = k(0.9, 0.95).toFixed(3);
  const l5 = k(0.92, 1);
  out.checks = ["House chain", "Your secret", "Lock block", "Result hash", "Traits", "Deadlines"].map((t, i) => { const ok = l5 > 0.1 + i * 0.13; return { t, ok: ok ? 1 : 0, bg: ok ? C.a : "transparent", bd: ok ? C.a : C.offd, fg: ok ? C.ink : C.lab }; });
  const ev: [string, string, string][] = [["house_locked", "#128 0x4e17…a9c3", "#b48a52"], ["commit_received", "0x6c40…b215", dark ? "#f6f1e8" : "#a89a87"], ["block_sealed", "#…907 0xd03a…5e19", "#16110d"], ["lot_drawn", "#271 legendary", C.a], ["proof_verified", "6 of 6 checks", C.g]];
  out.events = ev.concat(ev).map((x) => ({ k: x[0], v: x[1], c: x[2] }));
  const active = pp >= 0.86 ? 4 : pp >= 0.53 ? 3 : pp >= 0.39 ? 2 : pp >= 0.24 ? 1 : pp >= 0.08 ? 0 : -1;
  out.marks = STEPS.map((s, i) => ({ n: s[0], t: s[1], go: () => jump(s[2]), cur: i === active ? "step" : "false", bg: i === active ? C.ink : "transparent", fg: i === active ? (dark ? "#16110d" : "#f7f2e9") : i < active ? C.ink : C.lab }));
  out.auto = mode === "auto";
  out.playing = !paused; out.paused = paused; out.playLabel = paused ? "Play the story" : "Pause the story";
  out.togglePlay = () => { pausedRef.current = !paused; setPaused((x) => !x); kickRef.current(); };
  out.canSkip = mode === "scroll"; out.skip = () => jump("past"); out.skOp = (1 - k(0.8, 0.86)).toFixed(2);
  out.live = active < 0 ? "Introduction" : "Step " + STEPS[active][0] + ", " + STEPS[active][1];
  return <StoryView v={out} />;
});
