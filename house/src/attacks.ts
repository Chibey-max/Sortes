#!/usr/bin/env node
/**
 * Attack runner for the /attacks page. Each attack is sent as a REAL transaction on the
 * configured chain with an explicit gas limit (so it is mined and reverts, instead of being
 * stopped by gas estimation), then the revert is decoded and the result appended to
 * data/attacks.json, which the web app reads.
 *
 * Every on-chain attack is sent from the house account itself: that is the "thief who stole the
 * ECDSA key during an open window" case, and its scoped window admits calls to the house.
 *
 *   tsx src/attacks.ts <probe|txhash|forged-reveal|swapped-secret|thief|replay|silent-house|silent-user|all>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { signDigest } from "./sign.js";
import {
  decodeErrorResult, encodeFunctionData, keccak256, parseEther, toFunctionSelector, toHex, type Hex, type PublicClient, type WalletClient, type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig, type Config } from "./config.js";
import { keystorePassword, readKeystore } from "./keystore.js";
import { houseAccount } from "./native.js";
import { HOUSE_ABI, clients, readNumber, readRequest, Status } from "./evm.js";
import { ACTIONS, adminDigest, commitmentOf, params } from "./protocol.js";

const here = new URL(".", import.meta.url).pathname;
const PROBE_ABI = JSON.parse(readFileSync(resolve(here, "../../contracts/abi/RandomnessProbe.json"), "utf8"));

interface AttackResult {
  name: string;
  summary: string;
  tx: string | null;
  expected: string;
  observed: string;
  passed: boolean;
  extra?: Record<string, unknown>;
  at: string;
}

class Runner {
  results: AttackResult[];
  path: string;
  mockPubkey?: Hex;
  constructor(private cfg: Config, private pub: PublicClient, private wallet: WalletClient, private account: Account, private pqcSecret: Uint8Array) {
    this.path = resolve(cfg.dataDir, "attacks.json");
    this.results = existsSync(this.path) ? JSON.parse(readFileSync(this.path, "utf8")) : [];
  }

  record(r: Omit<AttackResult, "at">) {
    const full = { ...r, at: new Date().toISOString() };
    this.results = this.results.filter((x) => x.name !== r.name).concat(full);
    writeFileSync(this.path, JSON.stringify(this.results, null, 2));
    console.log(`${r.passed ? "PASS" : "FAIL"} ${r.name}: expected ${r.expected}, observed ${r.observed}${r.tx ? ` (${r.tx})` : ""}`);
  }

  /** Send a call that is expected to revert; return the tx hash and the decoded error name. */
  async sendExpectRevert(functionName: string, args: unknown[], gas = 400_000n): Promise<{ tx: Hex; error: string }> {
    const data = encodeFunctionData({ abi: HOUSE_ABI, functionName, args });
    const hash = await this.wallet.sendTransaction({ to: this.cfg.houseAddress, data, gas, account: this.account, chain: this.wallet.chain } as any);
    const rc = await this.pub.waitForTransactionReceipt({ hash });
    if (rc.status === "success") return { tx: hash, error: "succeeded (no revert)" };
    const fromCall = await this.revertReason(data, rc.blockNumber - 1n);
    if (!fromCall.startsWith("reverted")) return { tx: hash, error: fromCall };
    const fromTrace = await this.revertFromTrace(hash);
    return { tx: hash, error: fromTrace ?? fromCall };
  }

  async revertFromTrace(hash: Hex): Promise<string | undefined> {
    try {
      const t: any = await this.pub.request({ method: "debug_traceTransaction", params: [hash, { tracer: "callTracer" }] });
      const out: string = t?.output ?? t?.result?.output ?? "";
      if (out && out.startsWith("0x") && out.length >= 10) {
        try {
          return decodeErrorResult({ abi: HOUSE_ABI, data: out as Hex }).errorName;
        } catch {
          const sel = out.slice(0, 10).toLowerCase();
          const hit = HOUSE_ABI.filter((x: any) => x.type === "error").find(
            (x: any) => toFunctionSelector(`${x.name}(${x.inputs.map((i: any) => i.type).join(",")})`) === sel,
          );
          if (hit) return hit.name;
        }
      }
    } catch {}
    try {
      const out = execFileSync("cast", ["run", hash, "--rpc-url", this.cfg.evmRpc], { encoding: "utf8", timeout: 90_000, stdio: ["ignore", "pipe", "pipe"] });
      const sel = out.match(/custom error (0x[0-9a-fA-F]{8})/)?.[1]?.toLowerCase();
      if (sel) {
        const hit = HOUSE_ABI.filter((x: any) => x.type === "error").find(
          (x: any) => toFunctionSelector(`${x.name}(${x.inputs.map((i: any) => i.type).join(",")})`) === sel,
        );
        if (hit) return hit.name;
      }
    } catch (e: any) {
      const text = String(e?.stderr ?? e?.message ?? e);
      const sel = text.match(/custom error (0x[0-9a-fA-F]{8})/)?.[1]?.toLowerCase();
      if (sel) {
        const hit = HOUSE_ABI.filter((x: any) => x.type === "error").find(
          (x: any) => toFunctionSelector(`${x.name}(${x.inputs.map((i: any) => i.type).join(",")})`) === sel,
        );
        if (hit) return hit.name;
      }
    }
    return undefined;
  }

  decodeViemRevert(e: any): string | undefined {
    for (let cur = e, i = 0; cur && i < 10; cur = cur.cause, i++) {
      const named = cur.data?.errorName ?? cur.shortMessage?.match(/reverted with the following reason:\s+(\w+)/)?.[1];
      if (named) return named;
      const raw: unknown = cur.data?.data ?? cur.data ?? cur.raw;
      if (typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10) {
        try {
          return decodeErrorResult({ abi: HOUSE_ABI, data: raw as Hex }).errorName;
        } catch {}
      }
    }
    const text = String(e?.shortMessage ?? e?.message ?? e);
    const sel = text.match(/custom error (0x[0-9a-fA-F]{8})/)?.[1]?.toLowerCase();
    if (sel) {
      const hit = HOUSE_ABI.filter((x: any) => x.type === "error").find(
        (x: any) => toFunctionSelector(`${x.name}(${x.inputs.map((i: any) => i.type).join(",")})`) === sel,
      );
      if (hit) return hit.name;
    }
    const m = text.match(/error\s+(\w+)\(/i);
    return m?.[1];
  }

  async revertReason(data: Hex, blockNumber: bigint): Promise<string> {
    try {
      await this.pub.call({ to: this.cfg.houseAddress, data, account: this.account.address, blockNumber });
    } catch (e: any) {
      const n = this.decodeViemRevert(e);
      if (n) return n;
    }
    try {
      await this.pub.call({ to: this.cfg.houseAddress, data, account: this.account.address });
      return "no revert on replay";
    } catch (e: any) {
      return this.decodeViemRevert(e) ?? `reverted (${String(e?.shortMessage ?? e?.message ?? e).slice(0, 80)})`;
    }
  }

  async send(functionName: string, args: unknown[], value?: bigint): Promise<Hex> {
    const hash = await this.wallet.writeContract({ address: this.cfg.houseAddress, abi: HOUSE_ABI, functionName, args, value, account: this.account, chain: this.wallet.chain } as any);
    const rc = await this.pub.waitForTransactionReceipt({ hash });
    if (rc.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
    return hash;
  }

  setSkip(ids: number[]) {
    writeFileSync(resolve(this.cfg.dataDir, "skip.json"), JSON.stringify(ids));
  }
  addSkip(id: number) {
    const p = resolve(this.cfg.dataDir, "skip.json");
    const cur: number[] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
    this.setSkip([...new Set([...cur, id])]);
  }
  removeSkip(id: number) {
    const p = resolve(this.cfg.dataDir, "skip.json");
    const cur: number[] = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
    this.setSkip(cur.filter((x) => x !== id));
  }

  /** Open a request from the attacker account with a fresh secret. */
  async openRequest(skip: boolean): Promise<{ id: bigint; secret: Hex; tx: Hex }> {
    const secret = toHex(randomBytes(32));
    const me = this.account.address;
    const commit = commitmentOf(secret, me, me, BigInt(this.cfg.evmChainId));
    const nextId = (await readNumber(this.pub, this.cfg.houseAddress, "requestCount")) + 1n;
    if (skip) this.addSkip(Number(nextId)); // before sending, so the daemon never races it
    const tx = await this.send("request", [commit, me], await readNumber(this.pub, this.cfg.houseAddress, "FEE"));
    const id = await readNumber(this.pub, this.cfg.houseAddress, "requestCount");
    if (id !== nextId) throw new Error("request id race; rerun");
    return { id, secret, tx };
  }

  async waitUntil(cond: () => Promise<boolean>, label: string, ms = 600_000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await cond()) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`timed out waiting for ${label}`);
  }

  async blockPast(n: bigint) {
    await this.waitUntil(async () => (await this.pub.getBlockNumber()) > n, `block ${n}`);
  }

  // ---------------------------------------------------------------- attacks

  async probe(probe: Hex) {
    const txs: Hex[] = [];
    const samples: { block: string; prevrandao: string; blockhashPrev: string }[] = [];
    for (let i = 0; i < 2; i++) {
      const hash = await this.wallet.writeContract({ address: probe, abi: PROBE_ABI, functionName: "record", args: [], account: this.account, chain: this.wallet.chain } as any);
      const rc = await this.pub.waitForTransactionReceipt({ hash });
      txs.push(hash);
      const log = rc.logs.find((l) => l.address.toLowerCase() === probe.toLowerCase());
      if (log) {
        const [, prevrandao, bh] = [log.topics[1], log.data.slice(0, 66), "0x" + log.data.slice(66, 130)];
        samples.push({ block: BigInt(log.topics[1]!).toString(), prevrandao: BigInt(prevrandao).toString(16), blockhashPrev: bh });
      }
      await this.blockPast(rc.blockNumber + 1n);
    }
    const same = samples.length === 2 && samples[0].prevrandao === samples[1].prevrandao;
    const zeroHash = samples.every((s) => /^0x0+$/.test(s.blockhashPrev));
    this.record({
      name: "prevrandao",
      summary: "block.prevrandao read in two real transactions in different blocks",
      tx: txs.join(","),
      expected: "same value in both blocks",
      observed: same ? `same (0x${samples[0].prevrandao})${zeroHash ? "; blockhash(n-1) = 0" : ""}` : "values differ",
      passed: same,
      extra: { samples },
    });
  }

  /** Off-chain: an app that rolls from its own tx hash lets the sender re-sign until it wins. */
  async txhash() {
    const attacker = privateKeyToAccount(toHex(randomBytes(32)));
    const want = 6;
    let tries = 0;
    let hash: Hex = "0x";
    for (let gasPrice = 1_000_000_000n; ; gasPrice++) {
      tries++;
      const raw = await attacker.signTransaction({ chainId: this.cfg.evmChainId, nonce: 0, to: this.cfg.houseAddress, value: parseEther("1"), gas: 100_000n, gasPrice, type: "legacy" });
      hash = keccak256(raw);
      if (Number(BigInt(hash) % 6n) + 1 === want) break;
    }
    this.record({
      name: "txhash",
      summary: "A die rolled from the transaction hash: the sender re-signs (changing the gas price by 1 wei) until the hash wins",
      tx: null,
      expected: `a winning roll (${want}) chosen before sending`,
      observed: `won after ${tries} signatures; winning tx hash ${hash}`,
      passed: true,
      extra: { tries, winningHash: hash },
    });
  }

  async forgedReveal() {
    const { id } = await this.openRequest(true);
    const r = await readRequest(this.pub, this.cfg.houseAddress, id);
    await this.blockPast(r.lockBlock);
    const { tx, error } = await this.sendExpectRevert("revealHouse", [id, toHex(randomBytes(32))]);
    this.removeSkip(Number(id)); // let the daemon reveal the true value
    this.record({ name: "forged-reveal", summary: "The house posts a value that is not its committed chain value", tx, expected: "BadReveal", observed: error, passed: error === "BadReveal", extra: { requestId: id.toString() } });
  }

  async swappedSecret() {
    const { id, secret } = await this.openRequest(false);
    await this.waitUntil(async () => (await readRequest(this.pub, this.cfg.houseAddress, id)).status === Status.HouseRevealed, "house reveal");
    const { tx, error } = await this.sendExpectRevert("revealUser", [id, toHex(randomBytes(32))]);
    const ok = await this.send("revealUser", [id, secret]);
    this.record({ name: "swapped-secret", summary: "After seeing the house value, the user tries a different secret", tx, expected: "BadSecret", observed: error, passed: error === "BadSecret", extra: { requestId: id.toString(), honestRevealTx: ok } });
  }

  async thief() {
    const a = await this.sendExpectRevert("withdraw", [parseEther("1"), "0x"]);
    const b = await this.sendExpectRevert("setPayout", [this.account.address, toHex(randomBytes(64))]);
    this.record({
      name: "ecdsa-thief",
      summary: "Holding only the house's ECDSA key inside its open EVM window, try withdraw and setPayout",
      tx: `${a.tx},${b.tx}`,
      expected: "BadPqcSignature twice",
      observed: `${a.error}, ${b.error}`,
      passed: a.error === "BadPqcSignature" && b.error === "BadPqcSignature",
    });
  }

  async replay() {
    const earned = await readNumber(this.pub, this.cfg.houseAddress, "earned");
    const amount = earned > 0n ? 1n : 0n;
    if (amount === 0n) throw new Error("replay needs earned fees > 0: settle one request first");
    const nonce = await readNumber(this.pub, this.cfg.houseAddress, "adminNonce");
    const digest = adminDigest({ action: ACTIONS.WITHDRAW, params: params.withdraw(amount), chainId: BigInt(this.cfg.evmChainId), contract: this.cfg.houseAddress, house: this.account.address, nonce });
    const sig = signDigest(this.cfg, this.pqcSecret, digest, this.mockPubkey);
    const honest = await this.send("withdraw", [amount, sig]);
    const { tx, error } = await this.sendExpectRevert("withdraw", [amount, sig]);
    this.record({ name: "replay", summary: "Re-send a withdraw signature that was already used once", tx, expected: "BadPqcSignature", observed: error, passed: error === "BadPqcSignature", extra: { honestWithdrawTx: honest } });
  }

  async silentHouse() {
    const { id, tx: requestTx } = await this.openRequest(true);
    const r = await readRequest(this.pub, this.cfg.houseAddress, id);
    await this.blockPast(r.lockBlock + (await readNumber(this.pub, this.cfg.houseAddress, "W_HOUSE")));
    const tx = await this.send("claimTimeout", [id]);
    const after = await readRequest(this.pub, this.cfg.houseAddress, id);
    this.removeSkip(Number(id));
    this.record({ name: "silent-house", summary: "The house never reveals; anyone claims the timeout", tx, expected: "HouseTimedOut, floor result, fee + penalty refunded", observed: Status[after.status], passed: after.status === Status.HouseTimedOut, extra: { requestId: id.toString(), requestTx } });
  }

  async silentUser() {
    const { id, tx: requestTx } = await this.openRequest(false);
    await this.waitUntil(async () => (await readRequest(this.pub, this.cfg.houseAddress, id)).status === Status.HouseRevealed, "house reveal");
    // The user stays silent; the daemon (or anyone) claims the timeout after W_USER.
    await this.waitUntil(async () => (await readRequest(this.pub, this.cfg.houseAddress, id)).status === Status.UserTimedOut, "user timeout", 900_000);
    this.record({ name: "silent-user", summary: "The user sees the house value and never reveals", tx: requestTx, expected: "UserTimedOut, floor result", observed: "UserTimedOut", passed: true, extra: { requestId: id.toString() } });
  }
}

async function main() {
  const which = process.argv[2] ?? "help";
  const cfg = loadConfig();
  const acct = await houseAccount(readKeystore(cfg.keystorePath, keystorePassword()));
  const { pub, wallet, account } = clients(cfg, acct.privateKey as Hex);
  const run = new Runner(cfg, pub, wallet!, account!, acct.pqc.secretKey);
  run.mockPubkey = process.env.SORTES_MOCK_PQC_PUBKEY as Hex | undefined;
  const probe = process.env.SORTES_PROBE_CONTRACT as Hex | undefined;
  const steps: Record<string, () => Promise<void>> = {
    probe: () => (probe ? run.probe(probe) : Promise.reject(new Error("set SORTES_PROBE_CONTRACT"))),
    txhash: () => run.txhash(),
    "forged-reveal": () => run.forgedReveal(),
    "swapped-secret": () => run.swappedSecret(),
    thief: () => run.thief(),
    replay: () => run.replay(),
    "silent-house": () => run.silentHouse(),
    "silent-user": () => run.silentUser(),
  };
  if (which === "all") {
    // replay needs earned fees from a settled request, so it runs after silent-user.
    const order = ["probe", "txhash", "forged-reveal", "swapped-secret", "thief", "silent-house", "silent-user", "replay"];
    for (const name of order) {
      const f = steps[name];
      if (!f || (name === "probe" && !probe)) continue;
      try {
        await f();
      } catch (e: any) {
        console.error(`${name}: ${e?.message ?? e}`);
        process.exitCode = 1;
      }
    }
  } else if (steps[which]) {
    await steps[which]();
  } else {
    console.log(`usage: attacks <${Object.keys(steps).join("|")}|all>`);
  }
}

main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
