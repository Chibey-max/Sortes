/**
 * End-to-end test of the house daemon against a local anvil chain.
 *
 * The real QoreChain precompiles don't exist locally, so the PQC mocks from contracts/test/mocks
 * are etched at 0x0a01 / 0x0a02 (as in the Foundry tests). Everything else is real: the
 * contracts, the daemon process, its CLI, the hash chain and the off-chain protocol mirror.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, createTestClient, createWalletClient, http, keccak256, encodeAbiParameters,
  parseAbiParameters, parseEther, toHex, type Hex, defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildChain, saveChain } from "../src/chain.js";
import { ACTIONS, adminDigest, commitmentOf, params, resultFrom } from "../src/protocol.js";

const here = dirname(fileURLToPath(import.meta.url));
const contracts = resolve(here, "../../contracts");
const PORT = 18545;
const RPC = `http://127.0.0.1:${PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk";
const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

let anvil: ChildProcess;
let daemon: ChildProcess | undefined;
const dataDir = mkdtempSync(join(tmpdir(), "sortes-e2e-"));
const pub = createPublicClient({ chain, transport: http(RPC) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });

function artifact(file: string, name: string) {
  return JSON.parse(readFileSync(resolve(contracts, "out", file, `${name}.json`), "utf8"));
}

async function waitFor(cond: () => Promise<boolean>, ms = 30_000, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("timed out waiting");
}

let houseAddr: Hex;
let houseAcct: ReturnType<typeof privateKeyToAccount>;
let userAcct: ReturnType<typeof privateKeyToAccount>;
const HOUSE_ABI = JSON.parse(readFileSync(resolve(contracts, "abi/SortesHouse.json"), "utf8"));
const pqcPub: Hex = "0xa11ce0";

function startDaemon(): ChildProcess {
  const p = spawn(process.execPath, ["--import", "tsx", resolve(here, "../src/cli.ts"), "run"], {
    env: {
      ...process.env,
      SORTES_LOCAL: "1",
      SORTES_EVM_RPC: RPC,
      SORTES_EVM_CHAIN_ID: "31337",
      SORTES_HOUSE_CONTRACT: houseAddr,
      SORTES_DATA_DIR: dataDir,
      SORTES_KEY_PASSWORD: "e2e-password-not-secret",
      SORTES_POLL_MS: "500",
      SORTES_HEALTH_PORT: "18787",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  p.stdout!.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write("[daemon] " + d));
  p.stderr!.on("data", (d) => process.stdout.write("[daemon:err] " + d));
  return p;
}

before(async () => {
  anvil = spawn("anvil", ["--port", String(PORT), "--block-time", "1", "--silent", "--mnemonic", MNEMONIC]);
  await waitFor(async () => {
    try { await pub.getBlockNumber(); return true; } catch { return false; }
  });

  // House account = first anvil account, derived the same way the daemon derives it.
  const { deriveUnifiedAccount } = await import("@qorechain/sdk");
  const unified = await deriveUnifiedAccount(MNEMONIC, 0);
  houseAcct = privateKeyToAccount(unified.privateKey as Hex);
  userAcct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

  // Etch the PQC mocks and register the house key in the key-status mock.
  await testClient.setCode({ address: "0x0000000000000000000000000000000000000a01", bytecode: artifact("PqcMock.sol", "PqcVerifyMock").deployedBytecode.object });
  await testClient.setCode({ address: "0x0000000000000000000000000000000000000a02", bytecode: artifact("PqcMock.sol", "PqcKeyStatusMock").deployedBytecode.object });
  const w = createWalletClient({ chain, transport: http(RPC), account: houseAcct });
  const keyAbi = artifact("PqcMock.sol", "PqcKeyStatusMock").abi;
  await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: "0x0000000000000000000000000000000000000a02", abi: keyAbi, functionName: "setKey", args: [houseAcct.address, true, 1, pqcPub] }) });

  // Deploy the house with short windows so timeouts are testable.
  const h = artifact("SortesHouse.sol", "SortesHouse");
  const deployHash = await w.deployContract({ abi: h.abi, bytecode: h.bytecode.object, args: [houseAcct.address, houseAcct.address, 2n, 20n, 15n, 32n, parseEther("1"), parseEther("2"), parseEther("200")] });
  houseAddr = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;

  // Keystore + chain via the real CLI, then enroll with a mock signature over the real digest.
  execFileSync(process.execPath, ["--import", "tsx", resolve(here, "../src/cli.ts"), "keystore-import"], {
    input: MNEMONIC,
    env: { ...process.env, SORTES_DATA_DIR: dataDir, SORTES_KEY_PASSWORD: "e2e-password-not-secret" },
  });
  const c = buildChain(64);
  saveChain(join(dataDir, "chain.json"), c);
  const bond = parseEther("200");
  const digest = adminDigest({ action: ACTIONS.ENROLL, params: params.enroll(c.anchor, 64n, bond), chainId: 31337n, contract: houseAddr, house: houseAcct.address, nonce: 0n });
  const onchainDigest = await pub.readContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "adminDigest", args: [ACTIONS.ENROLL, params.enroll(c.anchor, 64n, bond)] });
  assert.equal(digest, onchainDigest, "off-chain admin digest must match the contract");
  const mockSig = keccak256(encodeAbiParameters(parseAbiParameters("bytes, bytes"), [pqcPub, digest]));
  await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "enroll", args: [c.anchor, 64n, mockSig], value: bond }) });
  writeFileSync(join(dataDir, "anchor.txt"), c.anchor);
});

after(() => {
  daemon?.kill("SIGKILL");
  anvil?.kill("SIGKILL");
});

async function openRequest(secret: Hex): Promise<bigint> {
  const w = createWalletClient({ chain, transport: http(RPC), account: userAcct });
  const commit = commitmentOf(secret, userAcct.address, userAcct.address, 31337n);
  const onchain = await pub.readContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "commitmentOf", args: [secret, userAcct.address, userAcct.address] });
  assert.equal(commit, onchain, "off-chain commitment must match the contract");
  const hash = await w.writeContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "request", args: [commit, userAcct.address], value: parseEther("1") });
  await pub.waitForTransactionReceipt({ hash });
  return (await pub.readContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "requestCount", args: [] })) as bigint;
}

async function status(id: bigint): Promise<number> {
  const [s] = (await pub.readContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "resultOf", args: [id] })) as [number, Hex];
  return s;
}

test("daemon reveals a request and the result matches the off-chain formula", async () => {
  daemon = startDaemon();
  const secret = keccak256(toHex("e2e secret 1"));
  const id = await openRequest(secret);
  await waitFor(async () => (await status(id)) === 2); // HouseRevealed
  const w = createWalletClient({ chain, transport: http(RPC), account: userAcct });
  await pub.waitForTransactionReceipt({ hash: await w.writeContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "revealUser", args: [id, secret] }) });
  const req = (await pub.readContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "getRequest", args: [id] })) as any;
  assert.equal(req.status, 3);
  assert.equal(req.result, resultFrom(req.houseValue, secret, req.lockHash, id, houseAddr, 31337n));
  const health = await (await fetch("http://127.0.0.1:18787/health")).json();
  assert.equal(health.ok, true);
  assert.ok(health.reveals >= 1);
});

test("daemon claims a user timeout so the fee is credited", async () => {
  const id = await openRequest(keccak256(toHex("silent user")));
  await waitFor(async () => (await status(id)) === 2);
  await waitFor(async () => (await status(id)) === 5, 60_000); // UserTimedOut, claimed by the daemon
  const earned = (await pub.readContract({ address: houseAddr, abi: HOUSE_ABI, functionName: "earned", args: [] })) as bigint;
  assert.equal(earned, parseEther("2"));
});

test("kill and restart: requests opened while the daemon is down are still revealed", async () => {
  daemon!.kill("SIGKILL");
  const ids = [await openRequest(keccak256(toHex("down 1"))), await openRequest(keccak256(toHex("down 2")))];
  daemon = startDaemon();
  for (const id of ids) await waitFor(async () => (await status(id)) === 2);
});

test("attack runner: every attack hits its expected error on chain", async () => {
  const w = createWalletClient({ chain, transport: http(RPC), account: houseAcct });
  const p = artifact("RandomnessProbe.sol", "RandomnessProbe");
  const probe = (await pub.waitForTransactionReceipt({ hash: await w.deployContract({ abi: p.abi, bytecode: p.bytecode.object, args: [] }) })).contractAddress!;
  execFileSync(process.execPath, ["--import", "tsx", resolve(here, "../src/attacks.ts"), "all"], {
    env: {
      ...process.env,
      SORTES_LOCAL: "1",
      SORTES_EVM_RPC: RPC,
      SORTES_EVM_CHAIN_ID: "31337",
      SORTES_HOUSE_CONTRACT: houseAddr,
      SORTES_PROBE_CONTRACT: probe,
      SORTES_MOCK_PQC: "1",
      SORTES_MOCK_PQC_PUBKEY: pqcPub,
      SORTES_DATA_DIR: dataDir,
      SORTES_KEY_PASSWORD: "e2e-password-not-secret",
    },
    stdio: "inherit",
    timeout: 240_000,
  });
  const results = JSON.parse(readFileSync(join(dataDir, "attacks.json"), "utf8")) as { name: string; passed: boolean; observed: string }[];
  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  for (const name of ["txhash", "forged-reveal", "swapped-secret", "ecdsa-thief", "replay", "silent-house", "silent-user"]) {
    assert.ok(byName[name], `missing result for ${name}`);
    assert.equal(byName[name].passed, true, `${name}: ${byName[name].observed}`);
  }
  // anvil's prevrandao changes per block (unlike diana), so only check the probe ran.
  assert.ok(byName["prevrandao"]);
});
