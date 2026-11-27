#!/usr/bin/env node
/**
 * Full-stack smoke test, all local:
 *   anvil (chain id 9800) → contracts deployed + PQC mocks etched → house enrolled → real house daemon →
 *   seeded lots (paid, sponsored, one floor) + recorded attacks → web app built against this chain →
 *   a browser drives every page, including the whole Mint flow through a mocked QoreX and a mocked MetaMask.
 *
 * Run from the repo root after `forge build` (contracts), `npm i` in house/ and web/:
 *   node scripts/smoke.mjs            (add SMOKE_KEEP=1 to leave screenshots in scripts/smoke-out/)
 */
import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  while (Date.now() - t0 < ms) { try { if (await cond()) return; } catch {} await sleep(400); }
  throw new Error(`timed out: ${label}`);
}
const commitmentOf = (secret, ben, consumer) => keccak256(encodeAbiParameters(parseAbiParameters("string, bytes32, address, address, uint256"), ["SORTES-COMMIT-v1", secret, ben, consumer, 9800n]));
const failures = [];
const check = (ok, what) => { console.log(`${ok ? "  PASS" : "  FAIL"} ${what}`); if (!ok) failures.push(what); };

try {
  mkdirSync(out, { recursive: true });
  procs.push(spawn("anvil", ["--port", String(PORT), "--chain-id", "9800", "--block-time", "1", "--silent", "--mnemonic", MNEMONIC], { detached: true }));
  await waitFor(() => pub.getBlockNumber().then(() => true), 30_000, "anvil");

  const { deriveUnifiedAccount } = await import(requireHouse.resolve("@qorechain/sdk"));
  const house = privateKeyToAccount((await deriveUnifiedAccount(MNEMONIC, 0)).privateKey);
  const users = ["0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"].map(privateKeyToAccount);
  const w = createWalletClient({ chain, transport: http(RPC), account: house });
  const send = async (p) => pub.waitForTransactionReceipt({ hash: await w.writeContract(p) });
  const deploy = async (a, args) => (await pub.waitForTransactionReceipt({ hash: await w.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args }) }));

  await testClient.setCode({ address: "0x0000000000000000000000000000000000000a01", bytecode: art("PqcMock.sol", "PqcVerifyMock").deployedBytecode.object });
  await testClient.setCode({ address: "0x0000000000000000000000000000000000000a02", bytecode: art("PqcMock.sol", "PqcKeyStatusMock").deployedBytecode.object });
  const pqcPub = "0xa11ce0";
  await send({ address: "0x0000000000000000000000000000000000000a02", abi: art("PqcMock.sol", "PqcKeyStatusMock").abi, functionName: "setKey", args: [house.address, true, 1, pqcPub] });

  const H = art("SortesHouse.sol", "SortesHouse");
  const houseRc = await deploy(H, [house.address, house.address, 2n, 100n, 150n, 32n, parseEther("1"), parseEther("2"), parseEther("200")]);
  const houseAddr = houseRc.contractAddress;
  const renderer = (await deploy(art("SortesRenderer.sol", "SortesRenderer"), [])).contractAddress;
  const M = art("SortesMint.sol", "SortesMint");
  const mintAddr = (await deploy(M, [houseAddr, renderer, 1000n, 3n, house.address])).contractAddress;
  const probe = (await deploy(art("RandomnessProbe.sol", "RandomnessProbe"), [])).contractAddress;
  const dice = (await deploy(art("SortesDice.sol", "SortesDice"), [houseAddr, parseEther("10"), house.address])).contractAddress;
  log("house", houseAddr, "mint", mintAddr);

  const env = { ...process.env, SORTES_LOCAL: "1", SORTES_MOCK_PQC: "1", SORTES_MOCK_PQC_PUBKEY: pqcPub, SORTES_EVM_RPC: RPC, SORTES_EVM_CHAIN_ID: "9800", SORTES_HOUSE_CONTRACT: houseAddr, SORTES_MINT_CONTRACT: mintAddr, SORTES_PROBE_CONTRACT: probe, SORTES_DATA_DIR: dataDir, SORTES_KEY_PASSWORD: "smoke-password-not-secret", SORTES_HEALTH_PORT: String(HEALTH), SORTES_POLL_MS: "700" };
  const cli = (args, input) => execFileSync(process.execPath, ["--import", "tsx", join(root, "house/src/cli.ts"), ...args], { cwd: join(root, "house"), env, input, encoding: "utf8" });
  cli(["keystore-import"], MNEMONIC);
  cli(["init", "--n", "500"]);
  log(cli(["enroll", "--bond", "200"]).trim());
  procs.push(spawn(process.execPath, ["--import", "tsx", join(root, "house/src/cli.ts"), "run"], { cwd: join(root, "house"), env, stdio: "ignore", detached: true }));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${HEALTH}/health`)).ok, 30_000, "daemon health");
  await send({ address: mintAddr, abi: M.abi, functionName: "sponsor", args: [], value: parseEther("20") });

  // ---- seed lots: 12 paid (two wallets), one sponsored, and one the user never reveals (floor)
  const mintAs = async (u, i, fn) => {
    const uw = createWalletClient({ chain, transport: http(RPC), account: u });
    const secret = keccak256(toHex(`smoke secret ${i}`));
    const commit = commitmentOf(secret, u.address, mintAddr);
    await pub.waitForTransactionReceipt({ hash: await uw.writeContract({ address: mintAddr, abi: M.abi, functionName: fn, args: [commit], value: fn === "mint" ? parseEther("1") : undefined }) });
    const tokenId = await pub.readContract({ address: mintAddr, abi: M.abi, functionName: "totalMinted", args: [] });
    const lot = await pub.readContract({ address: mintAddr, abi: M.abi, functionName: "lotOf", args: [tokenId] });
    return { tokenId, requestId: lot.requestId, secret };
  };
  const minted = [];
  for (let i = 0; i < 13; i++) minted.push(await mintAs(users[i % 2], i, i === 12 ? "mintSponsored" : "mint"));
  const silent = await mintAs(users[2], 99, "mint");
  const reveal = async (m) => { const r = await fetch(`http://127.0.0.1:${HEALTH}/reveal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.requestId.toString(), secret: m.secret }) }); return r.ok; };
  let relayed = 0;
  for (const m of minted) {
    await waitFor(async () => (await pub.readContract({ address: houseAddr, abi: H.abi, functionName: "resultOf", args: [m.requestId] }))[0] === 2, 90_000, "house reveal");
    if (await reveal(m)) relayed++;
  }
  check(relayed === minted.length, `daemon relayed ${relayed} of ${minted.length} reveals`);
  await waitFor(async () => (await pub.readContract({ address: houseAddr, abi: H.abi, functionName: "resultOf", args: [silent.requestId] }))[0] === 2, 90_000, "silent house reveal");
  await testClient.mine({ blocks: 200 }); // the silent user's window closes; the daemon claims the timeout
  for (const m of [...minted, silent]) await waitFor(async () => (await pub.readContract({ address: mintAddr, abi: M.abi, functionName: "lotOf", args: [m.tokenId] })).finalized, 90_000, `finalize lot ${m.tokenId}`);
  check(true, `${minted.length + 1} lots seeded and finalized (one floor)`);

  // ---- recorded attacks for the attacks page, with blocks fast-forwarded so waits are short
  log("running the attack runner…");
  const attacks = spawn(process.execPath, ["--import", "tsx", join(root, "house/src/attacks.ts"), "all"], { cwd: join(root, "house"), env, stdio: "ignore" });
  const miner = setInterval(() => testClient.mine({ blocks: 12 }).catch(() => {}), 1500);
  await new Promise((res) => attacks.on("exit", res));
  clearInterval(miner);
  const attacksFile = join(dataDir, "attacks.json");
  check(existsSync(attacksFile), "attack results recorded");
  if (existsSync(attacksFile)) copyFileSync(attacksFile, join(root, "web/public/attacks.json"));

  // ---- the web app against this chain
  const webEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_EVM_RPC: RPC, NEXT_PUBLIC_HOUSE: houseAddr, NEXT_PUBLIC_MINT: mintAddr, NEXT_PUBLIC_DICE: dice, NEXT_PUBLIC_RENDERER: renderer, NEXT_PUBLIC_DAEMON_URL: `http://127.0.0.1:${HEALTH}`, NEXT_PUBLIC_FROM_BLOCK: houseRc.blockNumber.toString() };
  log("building the web app…");
  execFileSync("npx", ["next", "build"], { cwd: join(root, "web"), env: webEnv, stdio: "ignore" });
  procs.push(spawn("npx", ["next", "start", "-p", String(WEB)], { cwd: join(root, "web"), env: webEnv, stdio: "ignore", detached: true }));
  await waitFor(async () => (await fetch(`http://127.0.0.1:${WEB}/`)).ok, 60_000, "web app");
  const base = `http://127.0.0.1:${WEB}`;

  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    return p;
  };
  const shot = (p, name, full = true) => p.screenshot({ path: join(out, name), fullPage: full });
  const first = String(minted[0].tokenId);

  // ---- every page, light
  let p = await newPage({ colorScheme: "light" });
  await p.goto(`${base}/`);
  await p.getByText("Nobody rigs").waitFor({ timeout: 20_000 });
  check(true, "landing: hero and the pinned story render");
  await p.waitForTimeout(800);
  await shot(p, "landing-hero.png", false);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.07)); await p.waitForTimeout(1800);
  await shot(p, "landing-story-1.png", false);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.16)); await p.waitForTimeout(1800);
  await shot(p, "landing-story-3.png", false);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.2)); await p.waitForTimeout(1800);
  await shot(p, "landing-story-lot.png", false);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.7)); await p.waitForTimeout(800);
  check((await p.locator(".lc").count()) > 0, "landing: the marquee shows real lots from the chain");
  await shot(p, "landing-full.png");

  await p.goto(`${base}/gallery`);
  await waitFor(async () => (await p.locator(".ggrid .gc").count()) === 14, 30_000, "gallery grid");
  check(true, "gallery: all 14 lots listed from two event queries");
  await p.getByText("drawn", { exact: false }).first().waitFor();
  await shot(p, "gallery.png");
  await p.locator(".room").nth(1).click(); await p.waitForTimeout(500);
  const commonCount = await p.locator(".ggrid .gc").count();
  check(commonCount > 0 && commonCount <= 14, `gallery: the Common room filters to ${commonCount} lots`);

  await p.goto(`${base}/lot/${first}`);
  await p.getByText("checks passed").first().waitFor({ timeout: 30_000 });
  check(true, "lot page: the proof is recomputed and shown");
  await shot(p, "lot.png");
  const floorId = String(silent.tokenId);
  await p.goto(`${base}/lot/${floorId}`);
  await p.getByText("kept its floor.", { exact: true }).first().waitFor({ timeout: 30_000 });
  check(true, "lot page: a floor lot is labelled as such");
  await shot(p, "lot-floor.png");
  await p.goto(`${base}/lot/9999`);
  await p.getByText("never drawn").first().waitFor({ timeout: 20_000 });
  check(true, "an unknown lot shows the 404 page");
  await shot(p, "404.png", false);

  await p.goto(`${base}/verify?token=${first}`);
  await p.getByText("6 of 6 passed").first().waitFor({ timeout: 30_000 });
  check(true, "verify: 6 of 6 checks pass for a real lot");
  await shot(p, "verify.png");
  const forgedTx = JSON.parse(readFileSync(attacksFile, "utf8")).find((a) => a.name === "forged-reveal")?.tx;
  if (forgedTx) {
    await p.goto(`${base}/verify?tx=${forgedTx}`);
    await p.getByText("BadReveal").first().waitFor({ timeout: 30_000 });
    check(true, "verify: the forged-reveal transaction shows as rejected with BadReveal");
    await shot(p, "verify-fail.png");
  }
  await p.goto(`${base}/attacks`);
  await p.getByText("Eight ways to cheat").first().waitFor();
  await p.locator(".ac").nth(2).click(); await p.waitForTimeout(400);
  check((await p.locator("pre").first().innerText()).includes("PASS"), "attacks: the terminal shows a recorded PASS");
  await shot(p, "attacks.png");
  await p.goto(`${base}/build`);
  await p.getByText(houseAddr.slice(0, 8), { exact: false }).first().waitFor({ timeout: 20_000 });
  check(true, "build: contract addresses and live fees");
  await shot(p, "build.png");
  await p.goto(`${base}/house`);
  await p.waitForFunction(() => /bond\s*\d{2,}/i.test(document.body.innerText), null, { timeout: 20_000 });
  await p.waitForTimeout(2500);
  check(await p.getByText("house online").count() > 0, "house: bond, activity and live daemon status");
  await shot(p, "house.png");
  await p.goto(`${base}/status`);
  await p.getByText("QoreChain").first().waitFor({ timeout: 20_000 });
  await shot(p, "status.png", false);

  // ---- dark mode via the toggle, and persistence
  await p.goto(`${base}/gallery`);
  await p.getByRole("button", { name: /dark mode/i }).click(); await p.waitForTimeout(600);
  check((await p.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark mode toggles");
  await shot(p, "gallery-dark.png", false);
  await p.goto(`${base}/lot/${first}`); await p.getByText("checks passed").first().waitFor({ timeout: 30_000 });
  check((await p.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark mode persists across pages");
  await shot(p, "lot-dark.png", false);

  // ---- the Mint flow through a MOCK QoreX (native lane): connect, free draw, reveal relayed, drawn
  const qorexInit = ({ rpc, user }) => {
    const bytes = (h) => Array.from(h.replace(/^0x/, "").match(/.{2}/g), (b) => parseInt(b, 16));
    const rpcCall = (method, params) => fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json());
    const readLen = (u, i) => { let n = 0, s = 0, b; do { b = u[i++]; n |= (b & 127) << s; s += 7; } while (b & 128); return [n, i]; };
    const parseCall = (u) => { const f = {}; let i = 0; while (i < u.length) { const tag = u[i++] >> 3; let n; [n, i] = readLen(u, i); f[tag] = u.slice(i, i + n); i += n; } return f; };
    window.qorex = { native: {
      capabilities: ["signAndBroadcast"],
      enable: async () => null,
      getKey: async () => ({ bech32Address: "qor1mockuser", address: bytes(user), name: "Mock QoreX" }),
      signAndBroadcast: async ({ messages }) => {
        const raw = Uint8Array.from(atob(messages[0].value), (c) => c.charCodeAt(0));
        const f = parseCall(raw);
        const to = new TextDecoder().decode(f[4]);
        const data = "0x" + Array.from(f[5], (b) => b.toString(16).padStart(2, "0")).join("");
        const res = await rpcCall("eth_sendTransaction", [{ from: user, to, data, gas: "0x7a1200" }]);
        if (res.error) throw new Error(res.error.message);
        return { txHash: res.result, code: 0, shield: "shielded" };
      },
    } };
  };
  p = await newPage({ colorScheme: "light" });
  await p.addInitScript(qorexInit, { rpc: RPC, user: users[2].address });
  await p.goto(`${base}/mint`);
  await p.getByText("Connect your wallet").waitFor({ timeout: 20_000 });
  await shot(p, "mint-connect.png", false);
  await p.getByRole("button", { name: "Connect QoreX" }).click();
  await p.getByRole("button", { name: /Draw a lot, free/ }).waitFor({ timeout: 20_000 });
  check(true, "mint: QoreX connects and the free draw is offered");
  await shot(p, "mint-ready.png", false);
  await p.getByRole("button", { name: /Draw a lot, free/ }).click();
  await p.getByText(/Lock block/).first().waitFor({ timeout: 30_000 });
  await shot(p, "mint-committed.png", false);
  await p.getByText(/is yours|kept its floor/).first().waitFor({ timeout: 90_000 });
  check(true, "mint: committed, house revealed, reveal relayed by the daemon, lot drawn, all from one approval");
  await shot(p, "mint-drawn.png", false);
  const total = await pub.readContract({ address: mintAddr, abi: M.abi, functionName: "totalMinted", args: [] });
  check(total === 15n, `mint: the lot is on chain (supply ${total})`);

  // ---- wallet menu: account panel, disconnect, reconnect from the header chooser
  await p.locator("header .wm-chip").click();
  await p.getByRole("dialog", { name: "Your wallet" }).waitFor({ timeout: 10_000 });
  check(await p.getByText("qor1 address").count() > 0 && await p.getByText(/QOR$/).count() > 0, "wallet: account panel shows qor1 address and balance");
  await shot(p, "wallet-account.png", false);
  await p.getByRole("button", { name: "Disconnect" }).click();
  await p.locator("header").getByRole("button", { name: "Connect wallet" }).waitFor({ timeout: 10_000 });
  check(true, "wallet: disconnect returns the header to Connect wallet");
  await p.reload(); await p.waitForTimeout(1500);
  check(await p.locator("header .wm-chip").count() === 0, "wallet: stays disconnected after a reload");
  await p.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await shot(p, "wallet-chooser.png", false);
  await p.getByRole("button", { name: /^QoreX/ }).click();
  await p.locator("header .wm-chip").waitFor({ timeout: 10_000 });
  check(true, "wallet: header chooser connects QoreX");
  await p.reload(); await p.locator("header .wm-chip").waitFor({ timeout: 10_000 });
  check(true, "wallet: QoreX connection restored after a reload");

  // ---- phone width: every page at 390, no horizontal scroll
  const mobile = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  for (const route of ["/", "/mint", "/gallery", `/lot/${first}`, `/verify?token=${first}`, "/attacks", "/build", "/house"]) {
    await mobile.goto(`${base}${route}`); await mobile.waitForTimeout(1800);
    const over = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 1, `phone: ${route} has no horizontal scroll (${over}px over)`);
    await shot(mobile, `phone-${route.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`, false);
  }
  const bad = errors.filter((e) => !/Failed to load resource|favicon|ResizeObserver/i.test(e));
  check(bad.length === 0, `no uncaught page errors${bad.length ? ": " + bad.slice(0, 3).join(" | ") : ""}`);
  await browser.close();
} catch (e) {
  failures.push(String(e?.message ?? e));
  console.error(e);
} finally {
  for (const pr of procs.reverse()) { try { process.kill(-pr.pid, "SIGKILL"); } catch { try { pr.kill("SIGKILL"); } catch {} } }
  rmSync(dataDir, { recursive: true, force: true });
  try { rmSync(join(root, "web/public/attacks.json")); } catch {}
  if (!process.env.SMOKE_KEEP && !failures.length) { try { rmSync(out, { recursive: true, force: true }); } catch {} }
  console.log(failures.length ? `\nSMOKE FAILED (${failures.length})` : "\nSMOKE PASSED");
  process.exit(failures.length ? 1 : 0);
}
