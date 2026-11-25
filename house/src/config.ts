import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/** Daemon settings, all from the environment. Secrets are never read from here except the
 * keystore password, which should come from the process manager, not a committed file. */
export interface Config {
  evmRpc: string;
  rest: string;
  cometRpc: string;
  cosmosChainId: string;
  evmChainId: number;
  houseAddress: `0x${string}`;
  keystorePath: string;
  dataDir: string;
  healthPort: number;
  pollMs: number;
  windowBlocks: number;
  windowMaxTxs: number;
  windowMaxValueUqor: bigint;
  renewBelowTxs: number;
  renewBelowFraction: number;
  /** Set for local runs (anvil): skips the native lane and the window keeper. */
  local: boolean;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`missing environment variable ${name}`);
  return v;
}

export function loadConfig(opts: { needHouse?: boolean } = {}): Config {
  const dataDir = resolve(env("SORTES_DATA_DIR", "./data"));
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const houseAddress = (opts.needHouse === false
    ? process.env.SORTES_HOUSE_CONTRACT ?? "0x0000000000000000000000000000000000000000"
    : env("SORTES_HOUSE_CONTRACT")) as `0x${string}`;
  return {
    evmRpc: env("SORTES_EVM_RPC", "https://evm-testnet.qore.host"),
    rest: env("SORTES_REST", "https://api-testnet.qore.host"),
    cometRpc: env("SORTES_COMET_RPC", "https://rpc-testnet.qore.host"),
    cosmosChainId: env("SORTES_COSMOS_CHAIN_ID", "qorechain-diana"),
    evmChainId: Number(env("SORTES_EVM_CHAIN_ID", "9800")),
    houseAddress,
    keystorePath: resolve(env("SORTES_KEYSTORE", resolve(dataDir, "house.key.json"))),
    dataDir,
    healthPort: Number(env("SORTES_HEALTH_PORT", "8787")),
    pollMs: Number(env("SORTES_POLL_MS", "5000")),
    windowBlocks: Number(env("SORTES_WINDOW_BLOCKS", "17280")),
    windowMaxTxs: Number(env("SORTES_WINDOW_MAX_TXS", "1000")),
    // value + max fee of every admitted tx, in uqor (1 QOR = 1,000,000 uqor). Default 500 QOR.
    windowMaxValueUqor: BigInt(env("SORTES_WINDOW_MAX_VALUE_UQOR", "500000000")),
    renewBelowTxs: Number(env("SORTES_RENEW_BELOW_TXS", "50")),
    renewBelowFraction: Number(env("SORTES_RENEW_BELOW_FRACTION", "0.2")),
    local: env("SORTES_LOCAL", "0") === "1",
  };
}
