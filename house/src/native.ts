import {
  EthNativeSigner,
  buildRegisterPqcKeyMsg,
  deriveUnifiedAccount,
  fetchEvmWindow,
  openEvmWindowMsg,
  signProofOfPossession,
} from "@qorechain/sdk";
import { StargateClient } from "@cosmjs/stargate";
import type { Config } from "./config.js";

export type Unified = Awaited<ReturnType<typeof deriveUnifiedAccount>>;

/** The house account, derived from its mnemonic (eth-native, coin type 60). One secp256k1 key
 * signs both lanes; the canonical ML-DSA-87 keypair signs admin digests and the hybrid layer. */
export async function houseAccount(mnemonic: string): Promise<Unified> {
  return deriveUnifiedAccount(mnemonic, 0);
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> HTTP ${r.status}`);
  return r.json();
}

export async function accountSequence(cfg: Config, address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const j = await getJson(`${cfg.rest}/cosmos/auth/v1beta1/account_info/${address}`);
  const info = j.info ?? j.account ?? {};
  return { accountNumber: BigInt(info.account_number ?? 0), sequence: BigInt(info.sequence ?? 0) };
}

export async function pqcAccount(cfg: Config, address: string): Promise<any> {
  try {
    return await getJson(`${cfg.rest}/qorechain/pqc/v1/account/${address}`);
  } catch {
    return { found: false };
  }
}

/** Sign (hybrid unless told otherwise) and broadcast native-lane messages. */
export async function sendNative(
  cfg: Config,
  acct: Unified,
  messages: { typeUrl: string; value: unknown }[],
  opts: { classical?: boolean; gas?: number; memo?: string } = {},
): Promise<{ code: number; transactionHash: string; rawLog?: string; height?: number }> {
  const signer = new EthNativeSigner(acct, { rest: cfg.rest, signMode: opts.classical ? "classical" : "hybrid" });
  const { accountNumber, sequence } = await accountSequence(cfg, acct.cosmos);
  const gas = opts.gas ?? 400_000;
  const client = await StargateClient.connect(cfg.cometRpc);
  try {
    const res = await signer.signAndBroadcast(client as any, {
      chainId: cfg.cosmosChainId,
      messages: messages as any,
      fee: { amount: [{ denom: "uqor", amount: String(Math.ceil(gas * 0.2)) }], gas: String(gas) },
      memo: opts.memo ?? "sortes-house",
      accountNumber,
      sequence,
    });
    return res as any;
  } finally {
    client.disconnect();
  }
}

/** Register the house's ML-DSA-87 key with a proof of possession. Idempotent: skips when the
 * registered key is already this account's key. */
export async function registerPqcKey(cfg: Config, acct: Unified): Promise<string> {
  const status = await pqcAccount(cfg, acct.cosmos);
  if (status?.found || status?.account) return "already registered";
  const proof = signProofOfPossession({ chainId: cfg.cosmosChainId, account: acct.cosmos, keypair: acct.pqc, algorithmId: 1 });
  const msg = buildRegisterPqcKeyMsg(acct.cosmos, {
    pqcKeypair: acct.pqc,
    ecdsaPubkey: hexToBytes(acct.publicKey),
    proofOfPossession: proof,
  });
  // Registration is the one message sent classical: the key is not on chain yet.
  const res = await sendNative(cfg, acct, [msg as any], { classical: true, memo: "sortes-house register key" });
  if (res.code !== 0) throw new Error(`register failed: code ${res.code} ${res.rawLog ?? ""}`);
  return res.transactionHash;
}

export interface WindowState {
  found: boolean;
  live: boolean;
  remainingBlocks: bigint;
  remainingTxs: bigint;
  remainingValue: bigint;
  maxTxs: bigint;
  allowedTargets: string[];
  expiryHeight: bigint;
}

export async function readWindow(cfg: Config, address: string): Promise<WindowState> {
  const w = await fetchEvmWindow({ rest: cfg.rest, address });
  return w as unknown as WindowState;
}

/** Open (or replace) a window scoped to the house contract only. Opening advances the nonce. */
export async function openScopedWindow(cfg: Config, acct: Unified): Promise<string> {
  const msg = openEvmWindowMsg({
    sender: acct.cosmos,
    blocks: cfg.windowBlocks,
    maxTxs: cfg.windowMaxTxs,
    maxValue: cfg.windowMaxValueUqor,
    allowedTargets: windowTargets(cfg),
  });
  const res = await sendNative(cfg, acct, [msg as any], { memo: "sortes-house window" });
  if (res.code !== 0) throw new Error(`open window failed: code ${res.code} ${res.rawLog ?? ""}`);
  return res.transactionHash;
}

/** Open an unscoped, short window, e.g. to deploy contracts (scoped windows refuse creation). */
export async function openDeployWindow(cfg: Config, acct: Unified, blocks: number, maxTxs: number, maxValueUqor: bigint): Promise<string> {
  const msg = openEvmWindowMsg({ sender: acct.cosmos, blocks, maxTxs, maxValue: maxValueUqor });
  const res = await sendNative(cfg, acct, [msg as any], { memo: "sortes-house deploy window" });
  if (res.code !== 0) throw new Error(`open window failed: code ${res.code} ${res.rawLog ?? ""}`);
  return res.transactionHash;
}

/** The only contracts the daemon's window admits: the house, and the mint when configured. */
export function windowTargets(cfg: Config): string[] {
  const t = [cfg.houseAddress];
  if (cfg.mintAddress) t.push(cfg.mintAddress);
  if (cfg.probeAddress) t.push(cfg.probeAddress);
  return t;
}

export function needsRenewal(w: WindowState, cfg: Config): boolean {
  if (!w.found || !w.live) return true;
  const targets = (w.allowedTargets ?? []).map((t) => t.toLowerCase()).sort().join(",");
  if (targets !== windowTargets(cfg).map((t) => t.toLowerCase()).sort().join(",")) return true;
  if (w.remainingTxs < BigInt(cfg.renewBelowTxs)) return true;
  if (Number(w.remainingBlocks) < cfg.windowBlocks * cfg.renewBelowFraction) return true;
  if (Number(w.remainingValue) < Number(cfg.windowMaxValueUqor) * cfg.renewBelowFraction) return true;
  return false;
}

export function hexToBytes(h: string): Uint8Array {
  const s = h.replace(/^0x/, "");
  return Uint8Array.from(s.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}
