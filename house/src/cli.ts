#!/usr/bin/env node
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { mldsa87 } from "@qorechain/pqc";
import { parseEther, formatEther, toHex, type Hex } from "viem";
import { loadConfig, type Config } from "./config.js";
import { keystorePassword, readKeystore, writeKeystore } from "./keystore.js";
import { buildChain, loadChain, saveChain } from "./chain.js";
import { ACTIONS, adminDigest, params } from "./protocol.js";
import { HOUSE_ABI, clients, readNumber } from "./evm.js";
import { houseAccount, openDeployWindow, openScopedWindow, pqcAccount, readWindow, registerPqcKey } from "./native.js";
import { HouseDaemon } from "./daemon.js";

const USAGE = `sortes-house <command>

Setup
  keystore-new                 generate a house mnemonic, store it encrypted, print it ONCE to back up
  keystore-import              read a mnemonic from stdin and store it encrypted
  address                      print the house account's qor1 / 0x addresses and key status
  register-key                 register the ML-DSA-87 key on the native lane (with proof of possession)
  open-window [--deploy B T Q] open the scoped window (house contract only), or an unscoped
                               deploy window of B blocks, T txs and Q QOR
  init [--n 10000]             draw a seed and write the hash chain to data/chain.json (0600)
  enroll [--bond 200]          post the anchor and bond, signed with ML-DSA-87

Run
  run                          reveal loop + window keeper + GET /health

Admin (each signed with ML-DSA-87)
  withdraw <qor>   set-payout <0x>   pause   resume   rotate [--n 10000]
  status                       contract and window summary

Environment: SORTES_HOUSE_CONTRACT, SORTES_KEY_PASSWORD, SORTES_DATA_DIR (./data),
SORTES_EVM_RPC, SORTES_REST, SORTES_COMET_RPC. See house/README.md.`;

function flag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function loadAccount(cfg: Config) {
  return houseAccount(readKeystore(cfg.keystorePath, keystorePassword()));
}

/** Sign an admin action: digest from the contract's current nonce, ML-DSA-87 over its 32 bytes. */
async function signAdmin(cfg: Config, action: Hex, p: Hex): Promise<Hex> {
  const acct = await loadAccount(cfg);
  const { pub } = clients(cfg);
  const nonce = await readNumber(pub, cfg.houseAddress, "adminNonce");
  const digest = adminDigest({
    action,
    params: p,
    chainId: BigInt(cfg.evmChainId),
    contract: cfg.houseAddress,
    house: acct.evm as Hex,
    nonce,
  });
  // Cross-check with the contract so a mismatch fails here, not as BadPqcSignature on chain.
  const onchain = (await pub.readContract({ address: cfg.houseAddress, abi: HOUSE_ABI, functionName: "adminDigest", args: [action, p] })) as Hex;
  if (onchain !== digest) throw new Error(`digest mismatch: local ${digest}, contract ${onchain}`);
  const sig = mldsa87.sign(acct.pqc.secretKey, hexBytes(digest));
  return toHex(sig);
}

function hexBytes(h: Hex): Uint8Array {
  return Uint8Array.from(Buffer.from(h.slice(2), "hex"));
}

async function sendAdmin(cfg: Config, functionName: string, args: unknown[], value?: bigint) {
  const acct = await loadAccount(cfg);
  const { pub, wallet, account } = clients(cfg, acct.privateKey as Hex);
  const hash = await wallet!.writeContract({ address: cfg.houseAddress, abi: HOUSE_ABI, functionName, args, value, account: account!, chain: wallet!.chain } as any);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`${functionName}: ${rc.status} in ${hash}`);
  if (rc.status !== "success") process.exitCode = 1;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "keystore-new": {
      const cfg = loadConfig({ needHouse: false });
      const mnemonic = generateMnemonic(wordlist, 256);
      writeKeystore(cfg.keystorePath, mnemonic, keystorePassword());
      const acct = await houseAccount(mnemonic);
      console.log("Back this mnemonic up offline now. It is not shown again:\n\n  " + mnemonic + "\n");
      console.log(`keystore: ${cfg.keystorePath}\nqor1: ${acct.cosmos}\n0x:   ${acct.evm}`);
      break;
    }
    case "keystore-import": {
      const cfg = loadConfig({ needHouse: false });
      const mnemonic = await readStdin();
      const acct = await houseAccount(mnemonic);
      writeKeystore(cfg.keystorePath, mnemonic, keystorePassword());
      console.log(`keystore: ${cfg.keystorePath}\nqor1: ${acct.cosmos}\n0x:   ${acct.evm}`);
      break;
    }
    case "address": {
      const cfg = loadConfig({ needHouse: false });
      const acct = await loadAccount(cfg);
      console.log(`qor1: ${acct.cosmos}\n0x:   ${acct.evm}`);
      console.log("pqc key:", JSON.stringify(await pqcAccount(cfg, acct.cosmos)).slice(0, 300));
      break;
    }
    case "register-key": {
      const cfg = loadConfig({ needHouse: false });
      console.log(await registerPqcKey(cfg, await loadAccount(cfg)));
      break;
    }
    case "open-window": {
      const deploy = args.indexOf("--deploy");
      if (deploy >= 0) {
        const cfg = loadConfig({ needHouse: false });
        const [b, t, q] = args.slice(deploy + 1, deploy + 4);
        const tx = await openDeployWindow(cfg, await loadAccount(cfg), Number(b ?? 300), Number(t ?? 10), BigInt(Math.round(Number(q ?? 50) * 1e6)));
        console.log(`deploy window opened in ${tx}`);
      } else {
        const cfg = loadConfig();
        console.log(`scoped window opened in ${await openScopedWindow(cfg, await loadAccount(cfg))}`);
      }
      break;
    }
    case "init": {
      const cfg = loadConfig({ needHouse: false });
      const n = Number(flag(args, "--n", "10000"));
      const c = buildChain(n);
      saveChain(resolve(cfg.dataDir, "chain.json"), c);
      console.log(`chain of ${n} links written to ${resolve(cfg.dataDir, "chain.json")}\nanchor: ${c.anchor}`);
      break;
    }
    case "enroll": {
      const cfg = loadConfig();
      const c = loadChain(resolve(cfg.dataDir, "chain.json"));
      const bond = parseEther(flag(args, "--bond", "200")!);
      const sig = await signAdmin(cfg, ACTIONS.ENROLL, params.enroll(c.anchor, BigInt(c.n), bond));
      await sendAdmin(cfg, "enroll", [c.anchor, BigInt(c.n), sig], bond);
      break;
    }
    case "run": {
      const cfg = loadConfig();
      const acct = await loadAccount(cfg);
      const c = loadChain(resolve(cfg.dataDir, "chain.json"));
      const onchainAnchor = (await clients(cfg).pub.readContract({ address: cfg.houseAddress, abi: HOUSE_ABI, functionName: "anchor", args: [] })) as Hex;
      if (onchainAnchor !== c.anchor) throw new Error(`chain.json anchor ${c.anchor} does not match the contract's ${onchainAnchor}`);
      const { pub, wallet, account } = clients(cfg, acct.privateKey as Hex);
      await new HouseDaemon(cfg, c, pub, wallet!, account!, acct).run();
      break;
    }
    case "withdraw": {
      const cfg = loadConfig();
      const amount = parseEther(args[0] ?? "0");
      await sendAdmin(cfg, "withdraw", [amount, await signAdmin(cfg, ACTIONS.WITHDRAW, params.withdraw(amount))]);
      break;
    }
    case "set-payout": {
      const cfg = loadConfig();
      const to = args[0] as Hex;
      await sendAdmin(cfg, "setPayout", [to, await signAdmin(cfg, ACTIONS.SET_PAYOUT, params.setPayout(to))]);
      break;
    }
    case "pause":
    case "resume": {
      const cfg = loadConfig();
      const on = cmd === "resume";
      await sendAdmin(cfg, "setAccepting", [on, await signAdmin(cfg, ACTIONS.SET_ACCEPTING, params.setAccepting(on))]);
      break;
    }
    case "rotate": {
      const cfg = loadConfig();
      const n = Number(flag(args, "--n", "10000"));
      const path = resolve(cfg.dataDir, "chain.json");
      const c = buildChain(n);
      const sig = await signAdmin(cfg, ACTIONS.ROTATE_ANCHOR, params.rotate(c.anchor, BigInt(n)));
      await sendAdmin(cfg, "rotateAnchor", [c.anchor, BigInt(n), sig]);
      if (existsSync(path)) saveChain(path + `.${Date.now()}.old`, JSON.parse(readFileSync(path, "utf8")));
      saveChain(path, c, true);
      console.log(`new anchor ${c.anchor}; restart the daemon and delete data/state.json`);
      break;
    }
    case "status": {
      const cfg = loadConfig();
      const { pub } = clients(cfg);
      const read = (fn: string) => pub.readContract({ address: cfg.houseAddress, abi: HOUSE_ABI, functionName: fn, args: [] }) as Promise<any>;
      const [enrolled, accepting, bond, earned, open, count, nextPos, lastPos, nonce] = await Promise.all(
        ["enrolled", "accepting", "bond", "earned", "openRequests", "requestCount", "nextPosition", "lastPos", "adminNonce"].map(read),
      );
      console.log({ enrolled, accepting, bond: formatEther(bond), earned: formatEther(earned), open: String(open), requests: String(count), nextPos: String(nextPos), lastPos: String(lastPos), adminNonce: String(nonce) });
      if (!cfg.local) {
        const acct = await loadAccount(cfg);
        console.log("window:", await readWindow(cfg, acct.cosmos));
      }
      break;
    }
    default:
      console.log(USAGE);
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
