import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";

/**
 * Browser mirror of contracts/src/lib/Traits.sol and SortesRenderer's names and numerals, so the
 * verifier recomputes traits locally. Tested against vectors generated from the Solidity.
 *
 * A lot has five traits, [metal, emblem, border, seal, frame]; the frame is the lot's tier.
 */
export const TRAIT_NAMES = ["Metal", "Emblem", "Border", "Seal", "Frame"] as const;
export const TIERS = ["Common", "Uncommon", "Rare", "Legendary"] as const;

/** Basis points per variant, in variant order. Each row sums to 10,000. */
export const WEIGHTS_BPS: number[][] = [
  [2600, 2200, 1800, 1400, 1200, 800],
  [2500, 2200, 1800, 1600, 1400, 500],
  [2800, 2400, 2000, 1600, 1200],
  [3000, 2500, 2000, 1600, 900],
  [6000, 2600, 1000, 400],
];

export const VARIANT_NAMES: string[][] = [
  ["Bronze", "Silver", "Iron", "Verdigris", "Black iron", "Gold"],
  ["Owl", "Column", "Amphora", "Scales", "Laurel", "Kleros"],
  ["Bead and reel", "Dentil", "Egg and dart", "Running wave", "Meander"],
  ["Wheel", "Double owl", "Owl in wreath", "Gorgon", "Star"],
  ["Common", "Uncommon", "Rare", "Legendary"],
];

/** Art props of the LotArt component, per variant index. */
export const ART = {
  field: ["bronze", "pewter", "slate", "teal", "obsidian", "gold"],
  glyph: ["circle", "arch", "hexagon", "diamond", "cross", "kleros"],
  engraving: ["lines", "dots", "grid", "waves", "meander"],
  seal: ["dots", "slash", "ring", "triangle", "star"],
  aura: ["none", "none", "rare", "legendary"],
} as const;

export type Traits = [number, number, number, number, number];
export const FLOOR: Traits = [1, 0, 0, 0, 0];

export function deriveTraits(result: Hex): Traits {
  const t = [0, 0, 0, 0, 0] as Traits;
  for (let i = 0; i < 5; i++) {
    const roll = Number(BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [result, BigInt(i)]))) % 10000n);
    const w = WEIGHTS_BPS[i];
    let acc = 0, pick = w.length - 1;
    for (let k = 0; k < w.length; k++) { acc += w[k]; if (roll < acc) { pick = k; break; } }
    t[i] = pick;
  }
  return t;
}

export const variantName = (trait: number, v: number) => VARIANT_NAMES[trait][v];
export const tierOf = (t: ArrayLike<number>) => Number(t[4]);
export const tierName = (t: ArrayLike<number>) => TIERS[tierOf(t)];
/** Share of all lots with this variant, in percent. */
export const sharePct = (trait: number, v: number) => WEIGHTS_BPS[trait][v] / 100;
export const fmtPct = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(1)}%`;

export function artProps(t: ArrayLike<number>) {
  return { field: ART.field[t[0]], glyph: ART.glyph[t[1]], engraving: ART.engraving[t[2]], seal: ART.seal[t[3]], aura: ART.aura[t[4]] };
}

/** Section letter and Greek numeral, as the renderer draws them. */
export const sectionLetter = (n: number) => "ΑΒΓΔΕΖΗΘΙΚ"[n % 10];
export function greek(n: number): string {
  if (!n) return "·";
  const U = ["", "Α", "Β", "Γ", "Δ", "Ε", "Ϛ", "Ζ", "Η", "Θ"], T = ["", "Ι", "Κ", "Λ", "Μ", "Ν", "Ξ", "Ο", "Π", "Ϙ"], H = ["", "Ρ", "Σ", "Τ", "Υ", "Φ", "Χ", "Ψ", "Ω", "Ϡ"];
  let r = "";
  if (n >= 1000) r += "͵" + U[Math.floor(n / 1000) % 10];
  r += H[Math.floor(n / 100) % 10] + T[Math.floor(n / 10) % 10] + U[n % 10];
  return r + "ʹ";
}

/** Tier colours as CSS variables of the design system. */
export const TIER_VAR = ["var(--t1)", "var(--t2)", "var(--t3)", "var(--t4)"];
