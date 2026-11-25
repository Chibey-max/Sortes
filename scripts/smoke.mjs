#!/usr/bin/env node
/**
 * Full-stack smoke test, all local:
 *   anvil (chain id 9800) → contracts deployed + PQC mocks etched → house enrolled →
 *   real house daemon running → lots minted (paid) and one sponsored → secrets relayed →
 *   web app built against this chain → headless browser checks every page and the verifier.
 *
 * Run from the repo root after `forge build` (contracts), `npm i` in house/ and web/:
 *   node scripts/smoke.mjs
 * Screenshots land in scripts/smoke-out/.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireHouse = createRequire(join(root, "house/package.json"));
const { createPublicClient, createTestClient, createWalletClient, http, keccak256, encodeAbiParameters, parseAbiParameters, parseEther, toHex, defineChain } = requireHouse("viem");
const { privateKeyToAccount } = requireHouse("viem/accounts");
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = 18600, WEB = 18601, HEALTH = 18602;
const RPC = `http://127.0.0.1:${PORT}`;
const MNEMONIC = "test test test test test test test test test test test junk";
const chain = defineChain({ id: 9800, name: "local-diana", nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC) });
const out = join(root, "scripts/smoke-out");
const dataDir = mkdtempSync(join(tmpdir(), "sortes-smoke-"));
const procs = [];
const art = (f, n) => JSON.parse(readFileSync(join(root, "contracts/out", f, `${n}.json`), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[smoke]", ...a);

async function waitFor(cond, ms = 60_000, label = "condition") {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await cond()) return; } catch {}
    await sleep(400);
  }
  throw new Error(`timed out: ${label}`);
}
function commitmentOf(secret, ben, consumer) {
  return keccak256(encodeAbiParameters(parseAbiParameters("string, bytes32, address, address, uint256"), ["SORTES-COMMIT-v1", secret, ben, consumer, 9800n]));
}

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "  PASS" : "  FAIL"} ${what}`); if (!ok) failures.push(what); };

try {
  mkdirSync(out, { recursive: true });
  procs.push(spawn("anvil", ["--port", String(PORT), "--chain-id", "9800", "--block-time", "1", "--silent", "--mnemonic", MNEMONIC]));
  await waitFor(() => pub.getBlockNumber().then(() => true), 30_000, "anvil");

  const { deriveUnifiedAccount } = await import(requireHouse.resolve("@qorechain/sdk"));
  const house = privateKeyToAccount((await deriveUnifiedAccount(MNEMONIC, 0)).privateKey);
  const users = ["0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"].map(privateKeyToAccount);
  const w = createWalletClient({ chain, transport: http(RPC), account: house });
  const send = async (p) => pub.waitForTransactionReceipt({ hash: await w.writeContract(p) });
  const deploy = async (a, args) => (await pub.waitForTransactionReceipt({ hash: await w.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args }) })).contractAddress;

  await testClient.setCode({ address: "0x0000000000000000000000000000000000000a01", bytecode: art("PqcMock.sol", "PqcVerifyMock").deployedBytecode.object });
  await testClient.setCode({ address: "0x0000000000000000000000000000000000000a02", bytecode: art("PqcMock.sol", "PqcKeyStatusMock").deployedBytecode.object });
  const pqcPub = "0xa11ce0";
  await send({ address: "0x0000000000000000000000000000000000000a02", abi: art("PqcMock.sol", "PqcKeyStatusMock").abi, functionName: "setKey", args: [house.address, true, 1, pqcPub] });

  const H = art("SortesHouse.sol", "SortesHouse");
  const houseAddr = await deploy(H, [house.address, house.address, 2n, 100n, 150n, 32n, parseEther("1"), parseEther("2"), parseEther("200")]);
  const renderer = await deploy(art("SortesRenderer.sol", "SortesRenderer"), []);
  const M = art("SortesMint.sol", "SortesMint");
  const mintAddr = await deploy(M, [houseAddr, renderer, 1000n, 3n, house.address]);
  log("house", houseAddr, "mint", mintAddr);

  // House keystore + chain via the real CLI, enroll with a mock signature over the real digest.
  const env = { ...process.env, SORTES_LOCAL: "1", SORTES_MOCK_PQC: "1", SORTES_MOCK_PQC_PUBKEY: pqcPub, SORTES_EVM_RPC: RPC, SORTES_EVM_CHAIN_ID: "9800", SORTES_HOUSE_CONTRACT: houseAddr, SORTES_MINT_CONTRACT: mintAddr, SORTES_DATA_DIR: dataDir, SORTES_KEY_PASSWORD: "smoke-password-not-secret", SORTES_HEALTH_PORT: String(HEALTH), SORTES_POLL_MS: "700" };
  const cli = (args, input) => execFileSync(process.execPath, ["--import", "tsx", join(root, "house/src/cli.ts"), ...args], { cwd: join(root, "house"), env, input, encoding: "utf8" });
  cli(["keystore-import"], MNEMONIC);
  cli(["init", "--n", "500"]);
  log(cli(["enroll", "--bond", "200"]).trim());
  procs.push(spawn(process.execPath, ["--import", "tsx", join(root, "house/src/cli.ts"), "run"], { cwd: join(root, "house"), env, stdio: "inherit" }));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${HEALTH}/health`)).ok, 30_000, "daemon health");

  // Mint: two paid lots that complete, one sponsored, one left silent (user timeout later).
  await send({ address: mintAddr, abi: M.abi, functionName: "sponsor", args: [], value: parseEther("5") });
  const minted = [];
  for (const [i, u] of [[0, users[0]], [1, users[1]], [2, users[0]]]) {
    const uw = createWalletClient({ chain, transport: http(RPC), account: u });
    const secret = keccak256(toHex(`smoke secret ${i}`));
    const commit = commitmentOf(secret, u.address, mintAddr);
    const fn = i === 2 ? "mintSponsored" : "mint";
    const hash = await uw.writeContract({ address: mintAddr, abi: M.abi, functionName: fn, args: [commit], value: fn === "mint" ? parseEther("1") : undefined });
    await pub.waitForTransactionReceipt({ hash });
    const tokenId = await pub.readContract({ address: mintAddr, abi: M.abi, functionName: "totalMinted", args: [] });
    const lot = await pub.readContract({ address: mintAddr, abi: M.abi, functionName: "lotOf", args: [tokenId] });
    minted.push({ tokenId, requestId: lot.requestId, secret });
  }
  for (const m of minted) {
    await waitFor(async () => (await pub.readContract({ address: houseAddr, abi: H.abi, functionName: "resultOf", args: [m.requestId] }))[0] === 2, 60_000, "house reveal");
    const r = await fetch(`http://127.0.0.1:${HEALTH}/reveal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.requestId.toString(), secret: m.secret }) });
    check(r.ok, `daemon relayed reveal for lot #${m.tokenId}`);
  }
  for (const m of minted) await waitFor(async () => (await pub.readContract({ address: mintAddr, abi: M.abi, functionName: "lotOf", args: [m.tokenId] })).finalized, 60_000, "finalize");
  check(true, "3 lots minted (2 paid, 1 sponsored), revealed and finalized by the daemon");

  // Web app against this chain.
  const webEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_EVM_RPC: RPC, NEXT_PUBLIC_HOUSE: houseAddr, NEXT_PUBLIC_MINT: mintAddr, NEXT_PUBLIC_DAEMON_URL: `http://127.0.0.1:${HEALTH}`, NEXT_PUBLIC_FROM_BLOCK: "0" };
  log("building web app…");
  execFileSync("npx", ["next", "build"], { cwd: join(root, "web"), env: webEnv, stdio: "ignore" });
  procs.push(spawn("npx", ["next", "start", "-p", String(WEB)], { cwd: join(root, "web"), env: webEnv, stdio: "ignore" }));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${WEB}/`)).ok, 60_000, "web app");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`http://127.0.0.1:${WEB}/`);
  await page.getByText(/of 1000 left/).waitFor({ timeout: 20_000 });
  check(true, "mint page shows live supply from the chain");
  await page.screenshot({ path: join(out, "mint.png"), fullPage: true });

  await page.goto(`http://127.0.0.1:${WEB}/verify?token=1`);
  await page.getByText(/Request #1/).waitFor({ timeout: 30_000 });
  const verdicts = await page.locator("table tr td:nth-child(3)").allTextContents();
  check(verdicts.length >= 6 && verdicts.every((v) => v === "pass"), `verifier: all checks pass for lot #1 (${verdicts.join(", ")})`);
  await page.screenshot({ path: join(out, "verify.png"), fullPage: true });

  await page.goto(`http://127.0.0.1:${WEB}/lot/3`);
  await page.getByText(/Fair roll|Floor/).first().waitFor({ timeout: 20_000 });
  check(await page.getByText("QoreX (sponsored)").count() > 0, "lot page shows the sponsored lot with traits");
  await page.locator("img.art").first().waitFor({ timeout: 20_000 });
  await page.screenshot({ path: join(out, "lot.png"), fullPage: true });

  await page.goto(`http://127.0.0.1:${WEB}/gallery`);
  await waitFor(async () => (await page.locator(".grid a").count()) === 3, 20_000, "gallery");
  check(true, "gallery lists all 3 lots");
  await page.screenshot({ path: join(out, "gallery.png"), fullPage: true });

  await page.goto(`http://127.0.0.1:${WEB}/house`);
  await page.getByText("200 QOR").first().waitFor({ timeout: 20_000 });
  await page.getByText("Reveals relayed for users").waitFor({ timeout: 20_000 });
  check(true, "house page shows bond and live daemon health");
  await page.screenshot({ path: join(out, "house.png"), fullPage: true });

  for (const p of ["attacks", "build"]) {
    await page.goto(`http://127.0.0.1:${WEB}/${p}`);
    await page.locator("h1").waitFor();
    await page.screenshot({ path: join(out, `${p}.png`), fullPage: true });
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`http://127.0.0.1:${WEB}/`);
  await mobile.getByText(/of 1000 left/).waitFor({ timeout: 20_000 });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "mint page has no horizontal scroll at phone width");
  await mobile.screenshot({ path: join(out, "mint-mobile.png"), fullPage: true });

  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close();
} catch (e) {
  failures.push(String(e?.message ?? e));
  console.error(e);
} finally {
  for (const p of procs.reverse()) p.kill("SIGKILL");
  rmSync(dataDir, { recursive: true, force: true });
  console.log(failures.length ? `\nSMOKE FAILED (${failures.length})` : "\nSMOKE PASSED");
  process.exit(failures.length ? 1 : 0);
}
