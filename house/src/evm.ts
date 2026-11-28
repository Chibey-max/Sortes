import { createPublicClient, createWalletClient, defineChain, http, type Hex, type PublicClient, type WalletClient, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Config } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));
/** ABIs exported from the Foundry build (contracts/export-abi.sh). */
export const HOUSE_ABI = JSON.parse(readFileSync(resolve(here, "../../contracts/abi/SortesHouse.json"), "utf8"));
export const MINT_ABI = JSON.parse(readFileSync(resolve(here, "../../contracts/abi/SortesMint.json"), "utf8"));

export function chainFor(cfg: Config) {
  return defineChain({
    id: cfg.evmChainId,
    name: cfg.evmChainId === 9800 ? "QoreChain Testnet" : `chain ${cfg.evmChainId}`,
    nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
    rpcUrls: { default: { http: [cfg.evmRpc] } },
  });
}

export function clients(cfg: Config, privateKey?: Hex): { pub: PublicClient; wallet?: WalletClient; account?: Account } {
  const chain = chainFor(cfg);
  const transport = http(cfg.evmRpc, { timeout: 20_000, retryCount: 5, retryDelay: 600 });
  const pub = createPublicClient({ chain, transport }) as PublicClient;
  if (!privateKey) return { pub };
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ chain, transport, account });
  return { pub, wallet, account };
}

export enum Status {
  None = 0,
  Requested = 1,
  HouseRevealed = 2,
  Fulfilled = 3,
  HouseTimedOut = 4,
  UserTimedOut = 5,
}

export interface OnchainRequest {
  consumer: Hex;
  beneficiary: Hex;
  commit: Hex;
  position: bigint;
  requestBlock: bigint;
  lockBlock: bigint;
  houseRevealBlock: bigint;
  status: number;
  fee: bigint;
  houseValue: Hex;
  lockHash: Hex;
  result: Hex;
}

export async function readRequest(pub: PublicClient, house: Hex, id: bigint): Promise<OnchainRequest> {
  return (await pub.readContract({ address: house, abi: HOUSE_ABI, functionName: "getRequest", args: [id] })) as OnchainRequest;
}

export async function readNumber(pub: PublicClient, house: Hex, fn: string): Promise<bigint> {
  return (await pub.readContract({ address: house, abi: HOUSE_ABI, functionName: fn, args: [] })) as bigint;
}
