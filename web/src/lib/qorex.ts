import { encodeFunctionData, type Address, type Hex } from "viem";
import { CONFIG } from "./config";

/**
 * The QoreX path. QoreX does not send EVM transactions yet ("EVM method not yet supported"), so
 * the app sends a native-lane MsgCrossVMCall through window.qorex.native.signAndBroadcast. The
 * EVM contract sees the user's own 0x address as msg.sender. A cross-VM call carries no value,
 * which is why QoreX users mint through SortesMint.mintSponsored.
 *
 * The protobuf encoder below was checked byte for byte against @qorechain/sdk's codec.
 */

export interface QorexNative {
  capabilities?: string[];
  enable(chainId: string): Promise<unknown>;
  getKey(chainId: string): Promise<{ bech32Address: string; address: number[]; name: string }>;
  signAndBroadcast(req: { chainId: string; messages: { typeUrl: string; value: string }[]; memo?: string; gasLimit?: string | number }): Promise<{ txHash: string; code: number; height?: number; shield?: string }>;
}

export function getQorexNative(): QorexNative | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as any).qorex?.native;
}

export interface QorexAccount {
  qor: string;
  evm: Address;
  name: string;
  canSend: boolean;
}

export async function connectQorex(): Promise<QorexAccount> {
  const native = getQorexNative();
  if (!native) throw new Error("QoreX not found. Install the QoreX extension (0.3.x) and reload.");
  await native.enable(CONFIG.cosmosChainId);
  const key = await native.getKey(CONFIG.cosmosChainId);
  const evm = ("0x" + key.address.map((b) => b.toString(16).padStart(2, "0")).join("")) as Address;
  return { qor: key.bech32Address, evm, name: key.name, canSend: (native.capabilities ?? []).includes("signAndBroadcast") };
}

// ---------------------------------------------------------------- MsgCrossVMCall encoding

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
    ...field(10, utf8(sender)), // sender
    ...field(18, utf8("cosmwasm")), // source_vm: ignored by the chain, kept for wire compatibility
    ...field(26, utf8("evm")), // target_vm
    ...field(34, utf8(target)), // target_contract
    ...field(42, hexBytes(calldata)), // payload
  ]);
}

function toBase64(u8: Uint8Array): string {
  let s = "";
  u8.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

/** Call an EVM contract from QoreX. Resolves with the native tx hash once broadcast. */
export async function qorexCall(account: QorexAccount, target: Address, abi: any[], functionName: string, args: unknown[], memo: string) {
  const native = getQorexNative();
  if (!native) throw new Error("QoreX not found");
  const data = encodeFunctionData({ abi, functionName, args });
  const res = await native.signAndBroadcast({
    chainId: CONFIG.cosmosChainId,
    messages: [{ typeUrl: "/qorechain.crossvm.v1.MsgCrossVMCall", value: toBase64(encodeCrossVmCall(account.qor, target, data)) }],
    memo,
    gasLimit: 800_000,
  });
  if (res.code !== 0) throw new Error(`QoreX transaction failed with code ${res.code} (${res.txHash})`);
  return res;
}
