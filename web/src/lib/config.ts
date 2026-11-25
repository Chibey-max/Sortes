import type { Address } from "viem";
import HouseAbi from "@/abi/SortesHouse.json";
import MintAbi from "@/abi/SortesMint.json";
import DiceAbi from "@/abi/SortesDice.json";
import RendererAbi from "@/abi/SortesRenderer.json";

const zero = "0x0000000000000000000000000000000000000000" as Address;

export const CONFIG = {
  evmChainId: 9800,
  cosmosChainId: "qorechain-diana",
  evmRpc: process.env.NEXT_PUBLIC_EVM_RPC || "https://evm-testnet.qore.host",
  rest: "https://api-testnet.qore.host",
  explorer: "https://explore.qore.network",
  house: (process.env.NEXT_PUBLIC_HOUSE || zero) as Address,
  mint: (process.env.NEXT_PUBLIC_MINT || zero) as Address,
  dice: (process.env.NEXT_PUBLIC_DICE || zero) as Address,
  daemonUrl: (process.env.NEXT_PUBLIC_DAEMON_URL || "").replace(/\/$/, ""),
  walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "sortes-local",
  fromBlock: BigInt(process.env.NEXT_PUBLIC_FROM_BLOCK || "0"),
  /** Blocks per second on diana, measured on day 0 (1.43 s per block). */
  secondsPerBlock: 1.43,
};

export const isDeployed = CONFIG.house !== zero && CONFIG.mint !== zero;

export const ABI = {
  house: HouseAbi as any,
  mint: MintAbi as any,
  dice: DiceAbi as any,
  renderer: RendererAbi as any,
};

export function txUrl(hash: string) {
  return `${CONFIG.explorer}/tx/${hash}`;
}
export function addressUrl(a: string) {
  return `${CONFIG.explorer}/address/${a}`;
}
