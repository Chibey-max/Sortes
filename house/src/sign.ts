import { mldsa87 } from "@qorechain/pqc";
import { encodeAbiParameters, keccak256, parseAbiParameters, toHex, type Hex } from "viem";
import type { Config } from "./config.js";

/**
 * Sign a 32-byte admin digest with the house's ML-DSA-87 key (FIPS-204, empty context): the
 * exact bytes pqcVerify checks on chain (verified live on diana on day 0).
 *
 * Local test chains (SORTES_LOCAL=1 only) run the PqcVerifyMock from contracts/test/mocks,
 * which cannot check ML-DSA, so there the matching mock "signature" is produced instead.
 */
export function signDigest(cfg: Config, secretKey: Uint8Array, digest: Hex, mockPubkey?: Hex): Hex {
  if (cfg.local && process.env.SORTES_MOCK_PQC === "1") {
    if (!mockPubkey) throw new Error("mock signing needs the registered pubkey");
    return keccak256(encodeAbiParameters(parseAbiParameters("bytes, bytes"), [mockPubkey, digest]));
  }
  return toHex(mldsa87.sign(secretKey, Uint8Array.from(Buffer.from(digest.slice(2), "hex"))));
}
