import { encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex } from "viem";

/**
 * Browser mirror of SortesHouse / Traits / SortesRenderer formulas, so the verifier recomputes
 * everything locally instead of trusting the contract's own answer. Checked against vectors
 * generated from the Solidity code (test/vectors.json).
 */

export enum Status {
  None = 0,
  Requested = 1,
  HouseRevealed = 2,
  Fulfilled = 3,
  HouseTimedOut = 4,
  UserTimedOut = 5,
}

export const STATUS_LABEL: Record<number, string> = {
  0: "Unknown",
  1: "Waiting for the house",
  2: "Waiting for your reveal",
  3: "Fulfilled",
  4: "House timed out (floor + refund)",
  5: "Reveal timed out (floor)",
};

export function commitmentOf(secret: Hex, beneficiary: Address, consumer: Address, chainId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, address, address, uint256"), [
      "SORTES-COMMIT-v1", secret, beneficiary, consumer, chainId,
    ]),
  );
}

export function resultFrom(houseValue: Hex, secret: Hex, lockHash: Hex, id: bigint, house: Address, chainId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, bytes32, bytes32, uint256, address, uint256"), [
      "SORTES-RESULT-v1", houseValue, secret, lockHash, id, house, chainId,
    ]),
  );
}

/** Hash `value` forward `steps` times; v[p] hashed p times must equal the anchor. */
export function hashForward(value: Hex, steps: number): Hex {
  let h = value;
  for (let i = 0; i < steps; i++) h = keccak256(h);
  return h;
}

// ---------------------------------------------------------------- traits

export const TRAITS = ["Background", "Shape", "Pattern", "Eyes", "Aura"] as const;
export const TIERS = ["Common", "Uncommon", "Rare", "Legendary"] as const;

export function tierOf(roll: number): number {
  if (roll < 200) return 3;
  if (roll < 1200) return 2;
  if (roll < 4000) return 1;
  return 0;
}

export function variantsIn(tier: number): number {
  return tier === 0 ? 4 : tier === 1 ? 3 : 2;
}

export interface TraitSet {
  tier: number[];
  variant: number[];
}

export function deriveTraits(result: Hex): TraitSet {
  const tier: number[] = [];
  const variant: number[] = [];
  for (let i = 0; i < 5; i++) {
    const roll = Number(BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256"), [result, BigInt(i)]))) % 10000n);
    const t = tierOf(roll);
    const pick = BigInt(keccak256(encodeAbiParameters(parseAbiParameters("bytes32, uint256, string"), [result, BigInt(i), "v"])));
    tier.push(t);
    variant.push(Number(pick % BigInt(variantsIn(t))));
  }
  return { tier, variant };
}

export const FLOOR: TraitSet = { tier: [0, 0, 0, 0, 0], variant: [0, 0, 0, 0, 0] };

const NAMES: string[][] = [
  ["Chalk", "Sand", "Mist", "Clay", "Teal", "Plum", "Rust", "", "Midnight", "Forest", "", "", "Aurora", "Void", "", ""],
  ["Circle", "Square", "Diamond", "Pill", "Hexagon", "Triangle", "Shield", "", "Star", "Ring", "", "", "Crown", "Rune", "", ""],
  ["Plain", "Dots", "Stripes", "Grid", "Waves", "Checks", "Rays", "", "Spiral", "Lattice", "", "", "Glyphs", "Prism", "", ""],
  ["Calm", "Sleepy", "Wide", "Wink", "Starry", "Hearts", "Sharp", "", "Cyclops", "Visor", "", "", "Oracle", "Third Eye", "", ""],
  ["None", "Faint", "Haze", "Glow", "Halo", "Spark", "Ember", "", "Ring", "Pulse", "", "", "Corona", "Eclipse", "", ""],
];

export function variantName(trait: number, tier: number, variant: number): string {
  return NAMES[trait][tier * 4 + variant];
}

export function topTier(s: TraitSet): number {
  return Math.max(...s.tier);
}
