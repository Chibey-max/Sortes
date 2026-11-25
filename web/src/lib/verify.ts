import { parseAbiItem, zeroHash, type Hex } from "viem";
import { CONFIG } from "./config";
import { publicClient, readHouseParams, readLot, readRequest, tokenOfRequest } from "./chain";
import { FLOOR, Status, commitmentOf, deriveTraits, hashForward, resultFrom } from "./protocol";

export interface Check {
  name: string;
  pass: boolean | null; // null = not applicable yet
  detail: string;
}

export interface Verification {
  requestId: bigint;
  tokenId?: bigint;
  status: Status;
  checks: Check[];
}

const FULFILLED = parseAbiItem("event Fulfilled(uint256 indexed id, bytes32 secret, bytes32 result)");
const ROTATED = parseAbiItem("event AnchorRotated(bytes32 anchor, uint64 chainLength)");
const ENROLLED = parseAbiItem("event Enrolled(bytes32 anchor, uint64 chainLength, uint256 bond)");

/** The anchor in force when `requestBlock` was mined (the house may have rotated since). */
async function anchorAt(requestBlock: bigint): Promise<Hex> {
  const [enrolled, rotated] = await Promise.all([
    publicClient.getLogs({ address: CONFIG.house, event: ENROLLED, fromBlock: CONFIG.fromBlock, toBlock: requestBlock }),
    publicClient.getLogs({ address: CONFIG.house, event: ROTATED, fromBlock: CONFIG.fromBlock, toBlock: requestBlock }),
  ]);
  const all = [...enrolled, ...rotated].sort((a, b) => Number(a.blockNumber! - b.blockNumber!));
  const last = all.at(-1);
  if (last) return last.args.anchor as Hex;
  return (await readHouseParams()).anchor as Hex;
}

/** Recompute everything about a request in the browser. Input: request id, or token id. */
export async function verify(input: { requestId?: bigint; tokenId?: bigint }): Promise<Verification> {
  let requestId = input.requestId;
  let tokenId = input.tokenId;
  if (tokenId !== undefined && requestId === undefined) requestId = (await readLot(tokenId)).requestId;
  if (requestId === undefined) throw new Error("give a request id or a token id");
  if (tokenId === undefined) {
    const t = await tokenOfRequest(requestId).catch(() => 0n);
    if (t !== 0n) tokenId = t;
  }

  const r = await readRequest(requestId);
  if (r.status === Status.None) throw new Error(`request #${requestId} does not exist`);
  const params = await readHouseParams();
  const checks: Check[] = [];

  // 1. House value hashes forward to the anchor.
  if (r.houseValue !== zeroHash) {
    const anchor = await anchorAt(r.requestBlock);
    const ok = hashForward(r.houseValue, Number(r.position)) === anchor;
    checks.push({ name: "House value hashes to the anchor", pass: ok, detail: `keccak256 applied ${r.position} time${r.position === 1n ? "" : "s"} to ${short(r.houseValue)} ${ok ? "=" : "≠"} anchor ${short(anchor)}` });
  } else {
    checks.push({ name: "House value hashes to the anchor", pass: null, detail: r.status === Status.HouseTimedOut ? "The house never revealed (timed out)." : "Not revealed yet." });
  }

  // 2. Secret matches the commitment (secret read from the Fulfilled event).
  let secret: Hex | undefined;
  if (r.status === Status.Fulfilled) {
    const logs = await publicClient.getLogs({ address: CONFIG.house, event: FULFILLED, args: { id: requestId }, fromBlock: r.houseRevealBlock, toBlock: r.houseRevealBlock + BigInt(params.W_USER) + 1n });
    secret = logs[0]?.args.secret as Hex | undefined;
    if (secret) {
      const c = commitmentOf(secret, r.beneficiary, r.consumer, BigInt(CONFIG.evmChainId));
      checks.push({ name: "Secret matches the commitment", pass: c === r.commit, detail: `commit(${short(secret)}, beneficiary, consumer) ${c === r.commit ? "=" : "≠"} ${short(r.commit)}` });
    } else {
      checks.push({ name: "Secret matches the commitment", pass: false, detail: "Fulfilled event not found." });
    }
  } else {
    checks.push({ name: "Secret matches the commitment", pass: null, detail: "The user has not revealed." });
  }

  // 3. Lock hash.
  if (r.houseValue !== zeroHash) {
    const block = await publicClient.getBlock({ blockNumber: r.lockBlock });
    const ok = r.lockHash === block.hash || r.lockHash === zeroHash;
    checks.push({
      name: "Lock hash is the lock block's",
      pass: ok,
      detail: r.lockHash === zeroHash
        ? `Stored zero: diana's EVM serves no block hashes to contracts (checked on day 0), so the result uses two inputs. RPC hash of block ${r.lockBlock}: ${short(block.hash!)}.`
        : `${short(r.lockHash)} ${r.lockHash === block.hash ? "=" : "≠"} hash of block ${r.lockBlock}`,
    });
  } else {
    checks.push({ name: "Lock hash is the lock block's", pass: null, detail: "Not recorded yet." });
  }

  // 4. Result recomputes.
  if (secret) {
    const res = resultFrom(r.houseValue, secret, r.lockHash, requestId, CONFIG.house, BigInt(CONFIG.evmChainId));
    checks.push({ name: "Result recomputes from the inputs", pass: res === r.result, detail: `${short(res)} ${res === r.result ? "=" : "≠"} stored ${short(r.result)}` });
  } else {
    checks.push({ name: "Result recomputes from the inputs", pass: r.status >= Status.HouseTimedOut ? true : null, detail: r.status >= Status.HouseTimedOut ? "Timed out: the result is the floor (zero), by rule." : "No result yet." });
  }

  // 5. Traits recompute.
  if (tokenId !== undefined) {
    const lot = await readLot(tokenId);
    if (lot.finalized) {
      const expect = r.status === Status.Fulfilled ? deriveTraits(r.result) : FLOOR;
      const ok = JSON.stringify(expect.tier) === JSON.stringify(lot.tier) && JSON.stringify(expect.variant) === JSON.stringify(lot.variant);
      checks.push({ name: "Traits recompute from the result", pass: ok, detail: ok ? `tiers [${lot.tier}] variants [${lot.variant}] match` : `expected [${expect.tier}]/[${expect.variant}], token has [${lot.tier}]/[${lot.variant}]` });
    } else {
      checks.push({ name: "Traits recompute from the result", pass: null, detail: "Lot not finalized yet." });
    }
  }

  // 6. Deadlines.
  const houseDeadline = r.lockBlock + BigInt(params.W_HOUSE);
  let deadlineOk: boolean | null = null;
  let detail = "Still open.";
  if (r.status === Status.Fulfilled) {
    deadlineOk = r.houseRevealBlock > r.lockBlock && r.houseRevealBlock <= houseDeadline;
    detail = `House revealed at block ${r.houseRevealBlock} (window ${r.lockBlock + 1n}–${houseDeadline}); user revealed within ${params.W_USER} blocks after.`;
  } else if (r.status === Status.HouseTimedOut || r.status === Status.UserTimedOut) {
    deadlineOk = true;
    detail = "Ended by timeout after its deadline (the contract refuses an early claim).";
  }
  checks.push({ name: "Finished within its deadlines", pass: deadlineOk, detail });

  return { requestId, tokenId, status: r.status, checks };
}

function short(h: string) {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}
