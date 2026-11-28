import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import type { Hex, PublicClient, WalletClient, Account } from "viem";
import type { Config } from "./config.js";
import { HOUSE_ABI, MINT_ABI, Status, readNumber, readRequest } from "./evm.js";
import { commitmentOf } from "./protocol.js";
import { valueAt, type ChainFile } from "./chain.js";
import { needsRenewal, openScopedWindow, readWindow, type Unified, type WindowState } from "./native.js";

interface State {
  /** Lowest request id the house may still have work on. Everything below is done. */
  lowestOpen: number;
}

export interface Health {
  ok: boolean;
  startedAt: string;
  lastTickAt: string | null;
  lastBlock: string | null;
  house: string;
  openRequests: string | null;
  oldestUnrevealedAgeBlocks: number | null;
  reveals: number;
  relayedUserReveals: number;
  finalized: number;
  timeoutsClaimed: number;
  lastRevealTx: string | null;
  window: { remainingTxs: string; remainingBlocks: string; remainingValueUqor: string; live: boolean } | null;
  lastError: string | null;
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

export class HouseDaemon {
  private state: State;
  private statePath: string;
  private busy = false;
  /** After a 429 / RPC drop, skip ticks until this time so we do not hammer diana. */
  private coolUntil = 0;
  /** Serialises every transaction the daemon sends, so nonces never collide. */
  private txLock: Promise<unknown> = Promise.resolve();
  private stopped = false;
  readonly health: Health;
  private params?: { wHouse: bigint; wUser: bigint; maxSkip: bigint };

  constructor(
    private cfg: Config,
    private chain: ChainFile,
    private pub: PublicClient,
    private wallet: WalletClient,
    private account: Account,
    private native?: Unified,
  ) {
    this.statePath = resolve(cfg.dataDir, "state.json");
    this.state = existsSync(this.statePath) ? JSON.parse(readFileSync(this.statePath, "utf8")) : { lowestOpen: 1 };
    this.health = {
      ok: true,
      startedAt: new Date().toISOString(),
      lastTickAt: null,
      lastBlock: null,
      house: cfg.houseAddress,
      openRequests: null,
      oldestUnrevealedAgeBlocks: null,
      reveals: 0,
      relayedUserReveals: 0,
      finalized: 0,
      timeoutsClaimed: 0,
      lastRevealTx: null,
      window: null,
      lastError: null,
    };
  }

  /** Request ids the attack runner asked the house to ignore (silent-house and forged-reveal demos). */
  private skipped(): Set<number> {
    const p = resolve(this.cfg.dataDir, "skip.json");
    if (!existsSync(p)) return new Set();
    try {
      return new Set((JSON.parse(readFileSync(p, "utf8")) as number[]).map(Number));
    } catch {
      return new Set();
    }
  }

  private save() {
    const tmp = this.statePath + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(tmp, this.statePath);
  }

  private send(functionName: string, args: unknown[], target: "house" | "mint" = "house"): Promise<Hex> {
    const run = this.txLock.then(() => this.sendNow(functionName, args, target));
    this.txLock = run.catch(() => undefined);
    return run;
  }

  private async sendNow(functionName: string, args: unknown[], target: "house" | "mint"): Promise<Hex> {
    const hash = await this.wallet.writeContract({
      address: target === "mint" ? this.cfg.mintAddress! : this.cfg.houseAddress,
      abi: target === "mint" ? MINT_ABI : HOUSE_ABI,
      functionName,
      args,
      account: this.account,
      chain: this.wallet.chain,
    } as any);
    const rc = await this.pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (rc.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
    return hash;
  }

  /** One pass over every request the house may still owe something to. */
  async tick(): Promise<void> {
    if (this.busy || Date.now() < this.coolUntil) return;
    this.busy = true;
    try {
      if (!this.params) {
        this.params = {
          wHouse: await readNumber(this.pub, this.cfg.houseAddress, "W_HOUSE"),
          wUser: await readNumber(this.pub, this.cfg.houseAddress, "W_USER"),
          maxSkip: await readNumber(this.pub, this.cfg.houseAddress, "MAX_SKIP"),
        };
      }
      const { wHouse, wUser, maxSkip } = this.params;
      const block = await this.pub.getBlockNumber();
      const count = Number(await readNumber(this.pub, this.cfg.houseAddress, "requestCount"));
      let oldestAge: number | null = null;
      let advance = true;

      for (let id = this.state.lowestOpen; id <= count && !this.stopped; id++) {
        const r = await readRequest(this.pub, this.cfg.houseAddress, BigInt(id));
        let done = false;

        if (r.status === Status.Requested && this.skipped().has(id)) {
          // Attack demo only (src/attacks.ts): stay silent on this request on purpose.
          if (block > r.lockBlock + wHouse) done = true;
        } else if (r.status === Status.Requested) {
          if (block > r.lockBlock && block <= r.lockBlock + wHouse) {
            await this.ensureReachable(Number(r.position), maxSkip);
            const tx = await this.send("revealHouse", [BigInt(id), valueAt(this.chain, Number(r.position))]);
            this.health.reveals++;
            this.health.lastRevealTx = tx;
            log(`revealed #${id} (position ${r.position}) in ${tx}`);
          } else if (block > r.lockBlock + wHouse) {
            // Missed: settle it at once so the user gets fee + penalty without having to act.
            log(`request #${id} passed the house deadline unrevealed; claiming the timeout for the user`);
            await this.send("claimTimeout", [BigInt(id)]);
            this.health.timeoutsClaimed++;
            done = await this.finalizeLot(id, r.consumer);
          } else {
            const age = Number(block - r.requestBlock);
            oldestAge = oldestAge === null ? age : Math.max(oldestAge, age);
          }
        } else if (r.status === Status.HouseRevealed) {
          if (block > r.houseRevealBlock + wUser) {
            // The user went silent: settle so the fee is credited and the app can finalize.
            const tx = await this.send("claimTimeout", [BigInt(id)]);
            this.health.timeoutsClaimed++;
            log(`claimed user timeout for #${id} in ${tx}`);
            done = await this.finalizeLot(id, r.consumer);
          }
        } else {
          done = await this.finalizeLot(id, r.consumer); // Fulfilled or timed out
        }

        if (done && advance && id === this.state.lowestOpen) {
          this.state.lowestOpen = id + 1;
          this.save();
        } else if (!done) {
          advance = false;
        }
      }

      this.health.lastBlock = block.toString();
      this.health.openRequests = (await readNumber(this.pub, this.cfg.houseAddress, "openRequests")).toString();
      this.health.oldestUnrevealedAgeBlocks = oldestAge;
      this.health.lastTickAt = new Date().toISOString();
      this.health.ok = true;
      this.health.lastError = null;
    } catch (e: any) {
      this.health.ok = false;
      this.health.lastError = String(e?.shortMessage ?? e?.message ?? e);
      if (/HTTP request failed|429|fetch failed/i.test(this.health.lastError)) {
        this.coolUntil = Date.now() + 20_000;
      } else {
        log("tick error:", this.health.lastError);
      }
    } finally {
      this.busy = false;
    }
  }

  /** For a final request opened by the configured SortesMint, fix the lot's traits. */
  private async finalizeLot(id: number, consumer: Hex): Promise<boolean> {
    const mint = this.cfg.mintAddress;
    if (!mint || consumer.toLowerCase() !== mint.toLowerCase()) return true;
    const tokenId = (await this.pub.readContract({ address: mint, abi: MINT_ABI, functionName: "tokenOfRequest", args: [BigInt(id)] })) as bigint;
    if (tokenId === 0n) return true;
    const lot = (await this.pub.readContract({ address: mint, abi: MINT_ABI, functionName: "lotOf", args: [tokenId] })) as { finalized: boolean };
    if (lot.finalized) return true;
    const tx = await this.send("finalize", [tokenId], "mint");
    this.health.finalized++;
    log(`finalized lot #${tokenId} (request #${id}) in ${tx}`);
    return true;
  }

  /**
   * Relay a user's secret once the house has revealed. Safe: the house value is already fixed
   * on chain, so knowing the secret now gives the house nothing to steer. The secret is checked
   * against the on-chain commitment before anything is sent.
   */
  async relayUserReveal(id: bigint, secret: Hex): Promise<{ status: number; body: unknown }> {
    const r = await readRequest(this.pub, this.cfg.houseAddress, id);
    if (r.status !== Status.HouseRevealed) return { status: 409, body: { error: "request is not waiting for the user reveal", status: Status[r.status] } };
    const commit = commitmentOf(secret, r.beneficiary, r.consumer, BigInt(this.cfg.evmChainId));
    if (commit !== r.commit) return { status: 400, body: { error: "secret does not match the commitment" } };
    const tx = await this.send("revealUser", [id, secret]);
    this.health.relayedUserReveals++;
    log(`relayed user reveal for #${id} in ${tx}`);
    void this.tick();
    return { status: 200, body: { tx } };
  }

  /** If the next reveal would skip more than MAX_SKIP links, move the checkpoint first. */
  private async ensureReachable(position: number, maxSkip: bigint) {
    let lastPos = Number(await readNumber(this.pub, this.cfg.houseAddress, "lastPos"));
    while (position > lastPos && BigInt(position - lastPos) > maxSkip) {
      const step = lastPos + Number(maxSkip);
      const tx = await this.send("checkpoint", [BigInt(step), valueAt(this.chain, step)]);
      log(`checkpoint at position ${step} in ${tx}`);
      lastPos = step;
    }
  }

  async keepWindow(): Promise<void> {
    if (this.cfg.local || !this.native) return;
    try {
      const w: WindowState = await readWindow(this.cfg, this.native.cosmos);
      this.health.window = {
        remainingTxs: String(w.remainingTxs ?? 0),
        remainingBlocks: String(w.remainingBlocks ?? 0),
        remainingValueUqor: String(w.remainingValue ?? 0),
        live: Boolean(w.live),
      };
      if (needsRenewal(w, this.cfg)) {
        const tx = await openScopedWindow(this.cfg, this.native);
        log(`opened scoped EVM window (house contract only) in ${tx}`);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      this.health.lastError = `window: ${msg}`;
      if (!/429|fetch failed|HTTP request failed/i.test(msg)) log("window error:", this.health.lastError);
    }
  }

  serveHealth(): void {
    createServer((req, res) => {
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type");
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }
      if (req.method === "POST" && req.url?.startsWith("/reveal")) {
        let body = "";
        req.on("data", (c) => {
          body += c;
          if (body.length > 1024) req.destroy();
        });
        req.on("end", async () => {
          try {
            const { id, secret } = JSON.parse(body);
            if (!/^0x[0-9a-fA-F]{64}$/.test(secret)) throw new Error("secret must be 32 bytes hex");
            const out = await this.relayUserReveal(BigInt(id), secret as Hex);
            res.writeHead(out.status, { "content-type": "application/json" }).end(JSON.stringify(out.body));
          } catch (e: any) {
            res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e?.shortMessage ?? e?.message ?? e) }));
          }
        });
        return;
      }
      if (req.url?.startsWith("/health")) {
        res.writeHead(this.health.ok ? 200 : 503, { "content-type": "application/json" });
        res.end(JSON.stringify(this.health));
      } else {
        res.writeHead(404).end();
      }
    }).listen(this.cfg.healthPort, () => log(`health on :${this.cfg.healthPort}/health`));
  }

  async run(): Promise<void> {
    this.serveHealth();
    await this.keepWindow();
    await this.tick();
    const t1 = setInterval(() => void this.tick(), this.cfg.pollMs);
    const t2 = setInterval(() => void this.keepWindow(), 60_000);
    const stop = () => {
      this.stopped = true;
      clearInterval(t1);
      clearInterval(t2);
      log("stopping");
      setTimeout(() => process.exit(0), 200);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
}
