"use client";

import { useId } from "react";
import { LotArtView } from "./views/LotArtView";
import { greek, sectionLetter } from "@/lib/traits";

export interface LotArtProps {
  field?: string; glyph?: string; engraving?: string; seal?: string; aura?: string;
  pending?: boolean | string; live?: boolean | string; label?: string; n?: number | string;
}

/** metal: base, dark, light, engraving, letter on the incuse square */
const METAL: Record<string, string[]> = {
  bronze: ["#b47b45", "#6b4120", "#e8b77e", "#4a2b12", "#f3d3a6"],
  gold: ["#d6a64a", "#8a6420", "#f8dc96", "#5c3f0e", "#fff1cc"],
  pewter: ["#aeb2b6", "#5f6468", "#e6e8ea", "#3c4044", "#ffffff"],
  teal: ["#6a9e8b", "#2f5f50", "#b2dccb", "#183d32", "#e8f7f0"],
  slate: ["#646a72", "#2c3035", "#9aa1aa", "#e7e9ec", "#ffffff"],
  obsidian: ["#2c2c30", "#111113", "#5e5e65", "#d4d1ca", "#f4f1ea"],
};
const GL: Record<string, string> = { circle: "owl", arch: "column", hexagon: "amphora", diamond: "scales", cross: "laurel", kleros: "kleros" };
const PA: Record<string, string> = { lines: "bead", dots: "dentil", grid: "egg", waves: "wave", meander: "meander" };
const SE: Record<string, string> = { dots: "wheel", slash: "double", ring: "owl", triangle: "gorgon", star: "star" };
const METAL_NAME: Record<string, string> = { bronze: "bronze", gold: "gold", pewter: "silver", teal: "verdigris bronze", slate: "iron", obsidian: "black iron" };
const flag = (x: unknown) => x === true || x === "true";

/** One lot as a bronze allotment plate (a pinakion): metal, emblem, border, seal, frame, section letter, Greek numeral. */
export function LotArt(p: LotArtProps) {
  const u = "l" + useId().replace(/\W/g, "");
  const pending = flag(p.pending), live = flag(p.live);
  const m = METAL[p.field ?? "bronze"] ?? METAL.bronze;
  const g = GL[p.glyph ?? "circle"] ?? "owl", pat = PA[p.engraving ?? "meander"] ?? "meander", s = SE[p.seal ?? "ring"] ?? "owl", a = p.aura ?? "none";
  const num = parseInt(String(p.n ?? p.label ?? "").replace(/[^0-9]/g, ""), 10) || 0;
  const out: Record<string, any> = { u, live: live ? "la-live" : "", base: m[0], dark: m[1], light: m[2], eng: m[3], letterC: m[4], pat, patOp: pending ? 0 : 1 };
  for (const k of ["owl", "column", "amphora", "scales", "laurel", "kleros"]) out["g_" + k] = g === k ? 1 : 0;
  for (const k of ["owl", "double", "gorgon", "wheel", "star"]) out["s_" + k] = s === k ? 1 : 0;
  const x0 = 60, y0 = 40, x1 = 260, y1 = 352, c = 10;
  out.plateD = `M${x0 + c} ${y0} H${x1 - c} L${x1} ${y0 + c} V${y1 - c} L${x1 - c} ${y1} H${x0 + c} L${x0} ${y1 - c} V${y0 + c} Z`;
  const r = (o: number) => `M${x0 - o + c} ${y0 - o} H${x1 + o - c} L${x1 + o} ${y0 - o + c} V${y1 + o - c} L${x1 + o - c} ${y1 + o} H${x0 - o + c} L${x0 - o} ${y1 + o - c} V${y0 - o + c} Z`;
  out.frameD = r(10); out.frame2D = r(18);
  const tier = pending ? "none" : a;
  out.ringC = tier === "legendary" ? "#e2b65a" : tier === "rare" ? "#79b8d6" : "#6a9e8b";
  out.ringC2 = "#e0703f";
  out.ring1 = tier === "none" ? 0 : 1; out.ring2 = tier === "legendary" ? 1 : 0;
  out.inlay = "#e0703f";
  out.plateOp = pending ? 0.35 : 1; out.glyphOp = pending ? 0 : 1; out.pend = pending ? 1 : 0; out.dash = pending ? "6 6" : "none"; out.ballY = 196;
  out.letter = sectionLetter(num); out.greek = greek(num);
  out.label = p.label || `LOT #${num}`;
  out.tag = pending ? "BEING DRAWN" : tier === "legendary" ? "LEGENDARY" : tier === "rare" ? "RARE" : "";
  out.tagC = pending ? "#d6d3cc" : tier === "legendary" ? "#e2b65a" : "#79b8d6";
  const metal = METAL_NAME[p.field ?? "bronze"] ?? "bronze";
  out.alt = pending
    ? "A lot being drawn: an empty plate outline with a ball dropping in"
    : `Lot ${num}, a ${metal} allotment plate stamped with section letter ${out.letter}, a ${g} emblem, a ${pat} border and a ${s} seal${tier !== "none" ? ", " + tier + " frame" : ""}`;
  return <LotArtView v={out} />;
}
