import { createPublicClient, http, parseAbiItem, type Address, type Hex } from "viem";
import { qorechainTestnet } from "@qorechain/qorex-rainbowkit";
import { ABI, CONFIG } from "./config";
import { Status } from "./protocol";

export const publicClient = createPublicClient({ chain: qorechainTestnet as any, transport: http(CONFIG.evmRpc) });

export interface HouseRequest {
  id: bigint;
  consumer: Address;
  beneficiary: Address;
  commit: Hex;
  position: bigint;
  requestBlock: bigint;
  lockBlock: bigint;
  houseRevealBlock: bigint;
  status: Status;
  fee: bigint;
  houseValue: Hex;
  lockHash: Hex;
  result: Hex;
}

export interface Lot {
  tokenId: bigint;
  requestId: bigint;
  finalized: boolean;
  isFloor: boolean;
  sponsored: boolean;
  /** [metal, emblem, border, seal, frame]; the frame is the lot's tier. */
  traits: number[];
}

export async function readRequest(id: bigint): Promise<HouseRequest> {
  const r = (await publicClient.readContract({ address: CONFIG.house, abi: ABI.house, functionName: "getRequest", args: [id] })) as any;
  return { id, ...r, status: Number(r.status), position: BigInt(r.position), requestBlock: BigInt(r.requestBlock), lockBlock: BigInt(r.lockBlock), houseRevealBlock: BigInt(r.houseRevealBlock) };
}

export async function readLot(tokenId: bigint): Promise<Lot> {
  const l = (await publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: "lotOf", args: [tokenId] })) as any;
  return { tokenId, requestId: l.requestId, finalized: l.finalized, isFloor: l.isFloor, sponsored: l.sponsored, traits: l.traits.map(Number) };
}

export async function readTokenUri(tokenId: bigint): Promise<{ name: string; image: string; attributes: { trait_type: string; value: string }[] }> {
  const uri = (await publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: "tokenURI", args: [tokenId] })) as string;
  const json = atob(uri.split(",")[1]);
  return JSON.parse(json);
}

export async function readHouseParams() {
  const names = ["W_HOUSE", "W_USER", "LOCK_DELAY", "FEE", "PENALTY", "MIN_BOND", "anchor", "chainLength", "bond", "earned", "openRequests", "requestCount", "accepting", "house", "payout", "adminNonce", "lastPos", "heldFees"] as const;
  const vals = await Promise.all(names.map((fn) => publicClient.readContract({ address: CONFIG.house, abi: ABI.house, functionName: fn, args: [] })));
  return Object.fromEntries(names.map((n, i) => [n, vals[i]])) as Record<(typeof names)[number], any>;
}

export async function readOwed(who: Address): Promise<bigint> {
  return (await publicClient.readContract({ address: CONFIG.house, abi: ABI.house, functionName: "owed", args: [who] })) as bigint;
}

export async function readMintStats() {
  const [total, max, pool, price, perWallet] = await Promise.all(
    ["totalMinted", "MAX_SUPPLY", "sponsorPool", "price", "SPONSORED_PER_WALLET"].map((fn) =>
      publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: fn, args: [] }),
    ),
  );
  return { total: total as bigint, max: max as bigint, pool: pool as bigint, price: price as bigint, perWallet: perWallet as bigint };
}

const REQUESTED = parseAbiItem("event Requested(uint256 indexed id, address indexed consumer, address indexed beneficiary, uint64 position, uint64 lockBlock)");

/** Find the request a commitment opened (used after a QoreX mint, whose native tx hash does
 * not give the EVM request id directly). Scans recent Requested events for this beneficiary. */
export async function findRequestByCommit(beneficiary: Address, commit: Hex, lookback = 5_000n): Promise<bigint | undefined> {
  const head = await publicClient.getBlockNumber();
  const from = head > lookback ? head - lookback : 0n;
  const logs = await publicClient.getLogs({ address: CONFIG.house, event: REQUESTED, args: { beneficiary }, fromBlock: from < CONFIG.fromBlock ? CONFIG.fromBlock : from, toBlock: head });
  for (const log of logs.reverse()) {
    const id = log.args.id!;
    const r = await readRequest(id);
    if (r.commit.toLowerCase() === commit.toLowerCase()) return id;
  }
  return undefined;
}

export async function tokenOfRequest(requestId: bigint): Promise<bigint> {
  return (await publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: "tokenOfRequest", args: [requestId] })) as bigint;
}

/** Block numbers of every transaction in a request's life, for the lot page's links. */
export async function requestTxs(id: bigint): Promise<{ label: string; tx: Hex }[]> {
  const events = [
    ["Requested", "event Requested(uint256 indexed id, address indexed consumer, address indexed beneficiary, uint64 position, uint64 lockBlock)"],
    ["House revealed", "event HouseRevealed(uint256 indexed id, bytes32 value, bytes32 lockHash)"],
    ["Fulfilled", "event Fulfilled(uint256 indexed id, bytes32 secret, bytes32 result)"],
    ["Timed out", "event TimedOut(uint256 indexed id, uint8 status)"],
  ] as const;
  const r = await readRequest(id);
  const from = r.requestBlock;
  const out: { label: string; tx: Hex }[] = [];
  for (const [label, sig] of events) {
    const logs = await publicClient.getLogs({ address: CONFIG.house, event: parseAbiItem(sig) as any, args: { id } as any, fromBlock: from, toBlock: from + 2_000n });
    for (const l of logs) out.push({ label, tx: l.transactionHash! });
  }
  return out;
}

export async function daemonHealth(): Promise<any | null> {
  if (!CONFIG.daemonUrl) return null;
  try {
    const r = await fetch(`${CONFIG.daemonUrl}/health`, { cache: "no-store" });
    return await r.json();
  } catch {
    return null;
  }
}

/** Hand the secret to the house daemon after the house reveal (saves the user a second
 * signature). Safe: the house value is already fixed on chain. Returns false if the daemon is
 * unreachable so the app can fall back to sending revealUser from the wallet. */
export async function relayReveal(requestId: bigint, secret: Hex): Promise<{ ok: boolean; tx?: string; error?: string }> {
  if (!CONFIG.daemonUrl) return { ok: false, error: "no daemon configured" };
  try {
    const r = await fetch(`${CONFIG.daemonUrl}/reveal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requestId.toString(), secret }) });
    const j = await r.json();
    return r.ok ? { ok: true, tx: j.tx } : { ok: false, error: j.error };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export async function ownerOf(tokenId: bigint): Promise<Address | undefined> {
  try { return (await publicClient.readContract({ address: CONFIG.mint, abi: ABI.mint, functionName: "ownerOf", args: [tokenId] })) as Address; } catch { return undefined; }
}

/** Read many lots at once (the gallery). Unknown ids are skipped. */
export async function readLots(ids: bigint[]): Promise<Lot[]> {
  const got = await Promise.all(ids.map((id) => readLot(id).catch(() => undefined)));
  return got.filter(Boolean) as Lot[];
}

/** Lots (token ids) owned by an address, newest first, found by scanning Minted events. */
export async function lotsOf(owner: Address): Promise<bigint[]> {
  const logs = await publicClient.getLogs({ address: CONFIG.mint, event: parseAbiItem("event Minted(uint256 indexed tokenId, address indexed to, uint256 indexed requestId, bool sponsored)"), args: { to: owner }, fromBlock: CONFIG.fromBlock, toBlock: "latest" });
  return logs.map((l) => l.args.tokenId as bigint).reverse();
}

/** Block time of a block, as an epoch-seconds number. */
export async function blockTime(n: bigint): Promise<number> {
  return Number((await publicClient.getBlock({ blockNumber: n })).timestamp);
}
