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
