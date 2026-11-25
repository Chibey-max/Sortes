import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex, type Hex } from "viem";

/** Off-chain mirror of SortesHouse's formulas. Tested against the contract in test/. */

export const ACTIONS = {
  ENROLL: keccak256(stringToHex("ENROLL")),
  WITHDRAW: keccak256(stringToHex("WITHDRAW")),
  SET_PAYOUT: keccak256(stringToHex("SET_PAYOUT")),
  ROTATE_ANCHOR: keccak256(stringToHex("ROTATE_ANCHOR")),
  SET_ACCEPTING: keccak256(stringToHex("SET_ACCEPTING")),
} as const;

export function adminDigest(a: {
  action: Hex;
  params: Hex;
  chainId: bigint;
  contract: Hex;
  house: Hex;
  nonce: bigint;
}): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, uint256, address, address, bytes32, uint256"), [
      "SORTES-ADMIN-v1",
      a.action,
      a.chainId,
      a.contract,
      a.house,
      keccak256(a.params),
      a.nonce,
    ]),
  );
}

export const params = {
  enroll: (anchor: Hex, n: bigint, bond: bigint) =>
    encodeAbiParameters(parseAbiParameters("bytes32, uint64, uint256"), [anchor, n, bond]),
  withdraw: (amount: bigint) => encodeAbiParameters(parseAbiParameters("uint256"), [amount]),
  setPayout: (addr: Hex) => encodeAbiParameters(parseAbiParameters("address"), [addr]),
  rotate: (anchor: Hex, n: bigint) => encodeAbiParameters(parseAbiParameters("bytes32, uint64"), [anchor, n]),
  setAccepting: (on: boolean) => encodeAbiParameters(parseAbiParameters("bool"), [on]),
};

export function commitmentOf(secret: Hex, beneficiary: Hex, consumer: Hex, chainId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, address, address, uint256"), [
      "SORTES-COMMIT-v1",
      secret,
      beneficiary,
      consumer,
      chainId,
    ]),
  );
}

export function resultFrom(houseValue: Hex, secret: Hex, lockHash: Hex, id: bigint, contract: Hex, chainId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string, bytes32, bytes32, bytes32, uint256, address, uint256"), [
      "SORTES-RESULT-v1",
      houseValue,
      secret,
      lockHash,
      id,
      contract,
      chainId,
    ]),
  );
}
