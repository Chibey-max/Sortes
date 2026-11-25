import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { keccak256, type Hex } from "viem";

/**
 * The house hash chain. h[0] = keccak256(seed), h[i] = keccak256(h[i-1]); anchor = h[N];
 * request position p uses v[p] = h[N - p]. The links file is the house's secret: anyone who
 * reads it can predict every future house value. It is written 0600 and never leaves the server.
 */
export interface ChainFile {
  version: 1;
  n: number;
  anchor: Hex;
  links: Hex[]; // links[i] = h[i], i = 0..N
}

export function buildChain(n: number, seed: Uint8Array = randomBytes(32)): ChainFile {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const links: Hex[] = new Array(n + 1);
  let x = keccak256(seed);
  links[0] = x;
  for (let i = 1; i <= n; i++) {
    x = keccak256(x);
    links[i] = x;
  }
  return { version: 1, n, anchor: links[n], links };
}

export function valueAt(c: ChainFile, position: number): Hex {
  if (!Number.isInteger(position) || position < 1 || position > c.n) throw new Error(`position ${position} outside chain`);
  return c.links[c.n - position];
}

export function saveChain(path: string, c: ChainFile, overwrite = false): void {
  if (existsSync(path) && !overwrite) throw new Error(`refusing to overwrite ${path}`);
  writeFileSync(path, JSON.stringify(c), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function loadChain(path: string): ChainFile {
  const c = JSON.parse(readFileSync(path, "utf8")) as ChainFile;
  if (c.version !== 1 || c.links.length !== c.n + 1 || c.links[c.n] !== c.anchor) throw new Error("chain file is corrupted");
  return c;
}
