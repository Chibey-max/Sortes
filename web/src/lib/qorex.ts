import { encodeFunctionData, type Address, type Hex } from "viem";
import { CONFIG } from "./config";

/**
 * QoreX writes:
 *  - Coin-60 (imported from MetaMask): window.qorex.evm eth_sendTransaction.
 *  - Coin-118 (native QoreX key): cannot use the EVM lane. Native signAndBroadcast
 *    of MsgCrossVMCall into mintSponsored (no value). Docs: number[] or base64.
 *
 * A page cannot switch QoreX between vladi and diana. The user does that in the extension.
 */

export const HOW_TO_SWITCH_DIANA =
  "If QoreX already says Switch back to mainnet, you are on diana — close that menu and try again. A site cannot switch the wallet. Only if it says Switch to testnet: tap the version number seven times and pick diana.";

export interface QorexNative {
  capabilities?: string[];
  enable(chainId: string): Promise<unknown>;
  getKey(chainId: string): Promise<{ bech32Address: string; address: number[]; name: string; algo?: string }>;
  signAndBroadcast(req: { chainId: string; messages: { typeUrl: string; value: string | Uint8Array | number[] }[]; memo?: string; gasLimit?: string | number }): Promise<{ txHash: string; code: number; height?: number; shield?: string }>;
}

export function getQorexNative(): QorexNative | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).qorex?.native;
}

export function getQorexEvm(): { request: (args: { method: string; params?: unknown[] }) => Promise<any> } | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).qorex?.evm;
}

export function flattenErr(e: unknown, seen = new Set<unknown>()): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  if (typeof e === "object" && seen.has(e)) return "";
  if (typeof e === "object") seen.add(e);
  const x = e as { shortMessage?: string; message?: string; reason?: string; code?: unknown; data?: { message?: string }; cause?: unknown; rawLog?: string };
  const bits = [x.shortMessage, x.message, x.reason, x.rawLog, x.data?.message, x.code != null ? String(x.code) : ""];
  if (x.cause && x.cause !== e) bits.push(flattenErr(x.cause, seen));
  return bits.filter(Boolean).join(" | ") || String(e);
}

export function parseChainId(id: unknown): number | undefined {
  if (typeof id === "number" && Number.isFinite(id)) return id;
  const s = String(id ?? "").trim();
  if (!s) return undefined;
  if (s.startsWith("0x") || s.startsWith("0X")) return parseInt(s, 16);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? n : undefined;
}

export async function qorexActiveEvmChainId(): Promise<number | undefined> {
  const evm = getQorexEvm();
  if (!evm) return undefined;
  try {
    return parseChainId(await evm.request({ method: "eth_chainId" }));
  } catch {
    return undefined;
  }
}

/** True only when QoreX is clearly on vladi, not for 4100 / "not authorized" (those are approvals). */
export function isVladiMismatch(m: string): boolean {
  if (/qorechain-diana/i.test(m) && !/qorechain-vladi/i.test(m)) return false;
  return /qorechain-vladi|does not match the active network|switch the network in QoreX/i.test(m);
}

function assertDiana(m: string): void {
  if (isVladiMismatch(m)) throw new Error(HOW_TO_SWITCH_DIANA);
}

/** Connect on diana. Cosmos enable is the source of truth; EVM chainId 9801 is not. */
export async function enableDiana(): Promise<QorexNative> {
  const native = getQorexNative();
  if (!native) throw new Error("QoreX not found. Install the QoreX extension and reload.");
  try {
    await native.enable(CONFIG.cosmosChainId);
  } catch (e) {
    const m = flattenErr(e);
    if (/already|enabled|approved/i.test(m) && !/vladi/i.test(m)) return native;
    assertDiana(m);
    throw e;
  }
  return native;
}

export interface QorexAccount {
  qor: string;
  evm: Address;
  name: string;
  canSend: boolean;
  /** ethsecp256k1 = MetaMask-imported, can use window.qorex.evm. secp256k1 = coin 118. */
  evmLane: boolean;
}

function evmFromKeyAddress(address: unknown): Address {
  if (typeof address === "string") {
    return (address.startsWith("0x") ? address : "0x" + address) as Address;
  }
  const arr = Array.from((address ?? []) as ArrayLike<number>);
  return ("0x" + arr.map((b) => Number(b).toString(16).padStart(2, "0")).join("")) as Address;
}

export async function connectQorex(): Promise<QorexAccount> {
  const native = await enableDiana();
  const key = await native.getKey(CONFIG.cosmosChainId);
  const evm = evmFromKeyAddress(key.address);
  const evmLane = /eth/i.test(String(key.algo || ""));
  const canSend = (native.capabilities ?? []).includes("signAndBroadcast") || typeof native.signAndBroadcast === "function" || !!getQorexEvm();
  return { qor: key.bech32Address, evm, name: key.name, canSend, evmLane };
}

// ---------------------------------------------------------------- MsgCrossVMCall encoding (fallback)

function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n >>>= 7;
  }
  out.push(n);
  return out;
}
const field = (tag: number, bytes: number[]) => [...varint(tag), ...varint(bytes.length), ...bytes];
const utf8 = (s: string) => Array.from(new TextEncoder().encode(s));
const hexBytes = (h: Hex) => Array.from(h.slice(2).match(/.{2}/g) ?? [], (b) => parseInt(b, 16));

export function encodeCrossVmCall(sender: string, target: Address, calldata: Hex): Uint8Array {
  return Uint8Array.from([
    ...field(10, utf8(sender)),
    ...field(18, utf8("cosmwasm")),
    ...field(26, utf8("evm")),
    ...field(34, utf8(target)),
    ...field(42, hexBytes(calldata)),
  ]);
}

function toBase64(u8: Uint8Array): string {
  let s = "";
  u8.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export interface QorexTx {
  txHash: string;
  code: number;
  /** True when the hash is an EVM 0x tx (receipt can be waited on). */
  evm: boolean;
}

function asAddresses(a: unknown): Address[] {
  if (!Array.isArray(a)) return [];
  return a.filter((x) => typeof x === "string" && x.startsWith("0x")).map((x) => x.toLowerCase() as Address);
}

export async function qorexEvmAccounts(): Promise<Address[]> {
  const evm = getQorexEvm();
  if (!evm) return [];
  try {
    const requested = asAddresses(await evm.request({ method: "eth_requestAccounts" }));
    if (requested.length) return requested;
  } catch { /* locked or refused */ }
  try {
    return asAddresses(await evm.request({ method: "eth_accounts" }));
  } catch {
    return [];
  }
}

/** True when QoreX's EVM provider currently lists this 0x (it can open a one-shot window for it). */
export async function qorexCanSendFrom(from: Address): Promise<boolean> {
  const want = from.toLowerCase();
  return (await qorexEvmAccounts()).some((a) => a === want);
}

async function sendViaEvm(from: Address, to: Address, data: Hex, value: bigint = 0n): Promise<QorexTx> {
  const evm = getQorexEvm();
  if (!evm) throw new Error("no-evm");
  let accts = await qorexEvmAccounts();
  const want = from.toLowerCase();
  if (!accts.includes(want as Address)) {
    try {
      await evm.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    } catch { /* optional picker */ }
    accts = await qorexEvmAccounts();
  }
  if (!accts.includes(want as Address)) {
    throw Object.assign(new Error("QoreX is on a different account (4100)."), { code: 4100 });
  }
  const hexVal = value === 0n ? "0x0" : `0x${value.toString(16)}`;
  const hash = await evm.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data, value: hexVal }],
  });
  if (!hash) throw new Error("QoreX returned no transaction hash.");
  return { txHash: String(hash), code: 0, evm: true };
}

/** Paid or sponsored EVM send through QoreX so it can open a one-shot access window. */
export async function qorexEvmSend(from: Address, to: Address, data: Hex, value: bigint = 0n): Promise<QorexTx> {
  return sendViaEvm(from, to, data, value);
}

const CROSSVM = "/qorechain.crossvm.v1.MsgCrossVMCall";
const COIN118 = /coin 118|cannot send on QoreChain's EVM|coin type 118/i;

async function sendViaCrossVm(account: QorexAccount, target: Address, data: Hex, memo: string): Promise<QorexTx> {
  const native = await enableDiana();
  if (!(native.capabilities ?? []).includes("signAndBroadcast") && typeof native.signAndBroadcast !== "function") {
    throw new Error("Please update QoreX so it can sign native transactions.");
  }
  const bytes = encodeCrossVmCall(account.qor, target, data);
  // Docs: value is protobuf bytes as Uint8Array, number[], or a base64 string.
  const encodings: (string | Uint8Array | number[])[] = [toBase64(bytes), bytes, Array.from(bytes)];
  let last: unknown;
  for (const value of encodings) {
    try {
      const res = await native.signAndBroadcast({
        chainId: CONFIG.cosmosChainId,
        messages: [{ typeUrl: CROSSVM, value }],
        memo,
        gasLimit: 2_000_000,
      });
      if (res.code !== 0) throw new Error(`QoreX transaction failed with code ${res.code} (${res.txHash})`);
      return { txHash: res.txHash, code: res.code, evm: false };
    } catch (e) {
      const m = flattenErr(e);
      if (/reject|denied|cancel|4001/i.test(m)) throw e;
      assertDiana(m);
      last = e;
    }
  }
  throw last;
}

function crossVmDisplayError(e: unknown): Error {
  const m = flattenErr(e);
  if (/cannot show what/i.test(m)) {
    return new Error("QoreX will not display a Cross-VM call for this native account. In QoreX, switch to an account imported from MetaMask, then press Draw again (that account can send the free mint on the EVM lane). Or use MetaMask · 1 QOR.");
  }
  return e instanceof Error ? e : new Error(m || "QoreX native send failed.");
}

/** Call an EVM contract from QoreX. Coin-118 uses Cross-VM; coin-60 uses eth_sendTransaction. */
export async function qorexCall(account: QorexAccount, target: Address, abi: any[], functionName: string, args: unknown[], memo: string): Promise<QorexTx> {
  const data = encodeFunctionData({ abi, functionName, args });
  if (account.evmLane === false) {
    try {
      return await sendViaCrossVm(account, target, data, memo);
    } catch (e) {
      throw crossVmDisplayError(e);
    }
  }
  try {
    return await sendViaEvm(account.evm, target, data);
  } catch (e) {
    const m = flattenErr(e);
    if (/reject|denied|cancel|4001/i.test(m)) throw e;
    assertDiana(m);
    if (/no-evm|4200|not yet supported|EVM method/i.test(m) || COIN118.test(m)) {
      try {
        return await sendViaCrossVm(account, target, data, memo);
      } catch (e2) {
        throw crossVmDisplayError(e2);
      }
    }
    throw e;
  }
}
