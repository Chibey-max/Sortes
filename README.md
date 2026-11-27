# Sortes

**QoreChain had no fair randomness. Sortes brings proven commit-reveal to QoreChain, built only from quantum-safe parts, with the house's funds locked behind ML-DSA-87.**

Sortes is a randomness house that any QoreChain app plugs into, shipped with **Sortes Lots**, an NFT collection whose traits nobody can rig, not even its creator. Built for *Build Before Q-Day* (Post-Quantum dApp category) on `qorechain-diana`, EVM chain ID 9800.

## Judge it in 5 minutes

1. **Mint** a lot at `/mint`. With QoreX it is one approval and free (sponsored); with MetaMask it costs 1 QOR inside an EVM window opened from QoreX. The story landing is `/`.
2. **Watch** the tracker: committed → lock block passed → house revealed → your reveal → traits revealed.
3. **Verify** it at `/verify`: six checks recomputed in your browser from chain data (hash chain, commitment, lock hash, result, traits, deadlines).
4. **Read the attacks** at `/attacks`: each one was sent as a real diana transaction and hit the error shown.
5. **Check the tests**: `cd contracts && forge test` (86 tests), `cd house && npm test` (5 end-to-end tests), `cd web && npm test` (8 tests), and `node scripts/smoke.mjs` for the whole stack.

## Why it exists

Apps that need chance on QoreChain (mints, loot, games) use transaction hashes or block values, which the sender or validators can steer. On diana, `block.prevrandao` is a constant (`0xff…ff`) and `blockhash()` returns zero inside contracts (both measured on day 0, see below). The services other chains rely on, Chainlink VRF and drand, are built on elliptic-curve and pairing cryptography that a quantum computer breaks.

**Why not just sign with ML-DSA?** ML-DSA signatures are randomized: a signer can make many valid signatures for one message and keep the one that hashes best. A hash chain fixes the house's values in advance, so the house has nothing to grind.

## How it works

Each request mixes three inputs:

| Input | Who | Fixed when |
| --- | --- | --- |
| House value `v[p] = h[N − p]` from a keccak256 hash chain | the house | at enrollment, years before the request if you like: the anchor `h[N]` is on chain |
| User secret, committed as `keccak256("SORTES-COMMIT-v1", secret, beneficiary, consumer, chainId)` | the user's browser | before the request |
| `blockhash(lockBlock)`, lock block = request block + 2 | the chain | after the commit (zero on diana today, see trust model) |

```
result = keccak256(abi.encode("SORTES-RESULT-v1", houseValue, secret, lockHash, requestId, house, chainId))
```

1. The browser makes a 32-byte secret, saves it, and sends only its commitment with the mint.
2. After the lock block, the house daemon reveals `v[p]`; the contract checks `keccak256^k(v[p])` against its checkpoint.
3. The browser hands the secret to the daemon's relay (safe: the house value is already fixed), which sends `revealUser`. The contract checks the commitment and fixes the result. If the relay is down, the wallet sends the reveal itself.
4. The daemon (or anyone) calls `finalize`; traits come from the result and the art renders on chain.
5. A missed deadline lets anyone end the request with the **floor** result. A silent house also pays the user the fee plus a 2 QOR penalty from its bond.

## What Sortes guarantees

Each guarantee has a named Foundry test (`test_guarantee1…5` in `contracts/test/SortesHouse.t.sol`) and an on-chain demo on `/attacks`.

1. **The house alone can't steer a result.** Its value was fixed at enrollment, and it never sees the user's secret before revealing.
2. **The user alone can't steer a result.** The secret is committed before the house value exists on chain.
3. **Silence never helps.** A silent house or user leads to the floor result, never a re-roll.
4. **Funds never get stuck.** Every request ends `Fulfilled`, `HouseTimedOut` or `UserTimedOut`, and anyone can trigger the timeout. An invariant test checks the balance always equals bond + earned + held fees + owed.
5. **A stolen ECDSA key can't move the house's money.** Withdraw, payout change, anchor rotation and pause all need a fresh ML-DSA-87 signature, checked on chain by `pqcVerify` against the key from `pqcKeyStatus`.
6. **No elliptic-curve or pairing cryptography in the trust path.** Results use keccak256 only (about 128-bit preimage security against Grover's algorithm); authority uses ML-DSA-87.

## Trust model

On diana today, rigging a single result in a buyer's favour needs **the house operator and that buyer to collude**: the house's value is fixed and the buyer's secret is committed, so together they could pick a secret offline that, combined with the known house value, gives a rare result. Neither can do it alone, and a third party can't do it at all.

On a chain that serves block hashes to contracts, the lock hash adds the validator who proposes the lock block as a third required colluder; the contract already uses it whenever `blockhash` is non-zero. Sortes does not claim that third party on diana. Full analysis: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Scope

Sortes covers outcomes between one user and one app: mints, loot, dice, card draws. Draws with many entrants (raffles, airdrop picks), mainnet (`pqcVerify` is active only on diana), multiple houses per request, and a token are out of scope. There is no AI inside the product; how AI was used to build it is in [`AI_USAGE.md`](AI_USAGE.md).

## Day-0 measurements on diana (24–25 Nov 2026)

| Check | Result |
| --- | --- |
| Chain | `eth_chainId` = 0x2648 (9800); block time 1.43 s over 200 blocks |
| Precompiles | `0x…0a01` (pqcVerify) and `0x…0a02` (pqcKeyStatus) listed in `active_static_precompiles` |
| `pqcVerify` | a `@qorechain/pqc` ML-DSA-87 signature over a 32-byte keccak digest verifies (true); tampered message, wrong key → false; ~312k gas per call |
| `pqcKeyStatus` | returns `(registered, algorithmId, pubkey)`; Sortes requires `registered` and `algorithmId == 1` (ML-DSA-87) |
| `blockhash` | zero for n−1 … n−9000 in contract calls |
| `prevrandao` | constant `0xff…ff` |
| QoreX | cannot send EVM transactions yet; its native `signAndBroadcast` is the write path, so QoreX mints go through `MsgCrossVMCall` |

## Deployment

Live on `qorechain-diana` (27 Nov 2026). House `MIN_BOND` is 20 QOR so the first faucet claim could enroll; later `addBond` raises it toward the 200 QOR in the PRD. Steps: [`docs/DEPLOY.md`](docs/DEPLOY.md).

| Item | Address / hash |
| --- | --- |
| SortesHouse | `0x09331e1a478456cebb031c31c07f54d53e91b362` |
| SortesRenderer | `0xd58209857055629a48194dff76f04c6e0c9d4521` |
| SortesMint | `0x7193f4d21082cc8e5f030e2e09917f47a6acba8d` |
| SortesDice | `0x2a35a5daca332afff6349ebcf2c45f71c154a50b` |
| RandomnessProbe | `0x040010ea2b07bd373e680ce00bdb44097a65ab8a` |
| House account (qor1 / 0x) | `qor1sdkzva02ag94rndrcfahtv587qlj92edsfvgle` / `0x836c2675eAEA0b51cDA3c27b75B287F03f22aB2D` |
| Enrollment (ML-DSA-87 signed) | `0x0277197d7a2ca78cde9a38cebb8b40d0198f7986d96facb9dc0e3048a412fe11` |
| House deploy tx | `0x151969305e12fc7f9b0f5e822c24f3c4f36b629b356bed90a21b54c98ddd13d1` |

## The lots

Each lot is a bronze plate drawn entirely on chain (`SortesRenderer`, no image host). Five traits come from the result, each rolled as `keccak256(result, i) % 10000` against these odds:

| Trait | Variants (odds %) |
| --- | --- |
| Metal | bronze 26, silver 22, iron 18, verdigris 14, black iron 12, gold 8 |
| Emblem | owl 25, column 22, amphora 18, scales 16, laurel 14, kleros 5 |
| Border | bead and reel 28, dentil 24, egg and dart 20, running wave 16, meander 12 |
| Seal | wheel 30, double owl 25, owl in wreath 20, gorgon 16, star 9 |
| Frame | common 60, uncommon 26, rare 10, legendary 4 |

A lot whose reveal window closes keeps the **floor** plate (silver, owl, bead and reel, wheel, common). Sponsored mints from QoreX come from a pool (3 per wallet); MetaMask pays 1 QOR.

## Tests

| Suite | Count | Run |
| --- | --- | --- |
| Foundry: SortesHouse unit + guarantees + fuzz | 55 | `forge test` in `contracts/` |
| Foundry: SortesMint | 21 | |
| Foundry: SortesDice | 7 | |
| Foundry: invariants (2,048 calls each) | 3 | |
| **Foundry total** | **86** (79 unit, 4 fuzz, 3 invariant) | |
| House daemon end-to-end on anvil | 5 | `npm test` in `house/` |
| Web protocol mirror vs Solidity vectors (incl. traits, numerals) | 8 | `npm test` in `web/` |
| Full stack in a browser | 1 script, 40+ checks (every page, dark mode, phone width, full mint flow via mock QoreX) | `node scripts/smoke.mjs` |
| Live diana: daemon's ML-DSA-87 signature through real `pqcVerify` | 1 | `npm run test:live` in `house/` |

Locally the precompiles are mocks etched at `0x…0a01` / `0x…0a02` (`contracts/test/mocks/PqcMock.sol`, clearly marked); the real ML-DSA-87 path is proven against diana.

## Repository

```
contracts/   Foundry: SortesHouse, SortesMint, SortesRenderer (on-chain SVG), SortesDice, tests, Deploy script
house/       TypeScript daemon + admin CLI: reveal loop, scoped EVM window keeper, /health, /reveal relay, attack runner
web/         Next.js app: mint (QoreX or MetaMask), lot, gallery, verifier, attacks, build guide, house status
docs/        PRD, plan, threat model, integration guide, deploy guide, audit
scripts/     smoke.mjs: whole stack on a local chain, driven in a browser
tools/       QoreX cross-VM test page (day-0 wallet check)
```

## Rubric map

| Criterion | Evidence |
| --- | --- |
| Works as described (25%) | Live mint, verifier recomputing every result, exact test counts above, full-stack smoke test |
| QoreChain tech usage (25%) | `pqcVerify` + `pqcKeyStatus` in SortesHouse bytecode; scoped EVM window (house + mint only) renewed by the daemon; QoreX `MsgCrossVMCall` mint path; `@qorechain/sdk`, `pqc`, `evm`, `qorex-rainbowkit`, `qorex-types` in package.json |
| Post-quantum correctness (20%) | keccak256 + ML-DSA-87 only; ECDSA-only attacks fail on chain; domain-separated, nonce-bound admin digests; [`THREAT_MODEL.md`](docs/THREAT_MODEL.md) |
| Originality (15%) | First fair randomness source among the fest's projects; explains why ML-DSA can't be a VRF |
| Clarity, UX, docs (15%) | This page; one-signature mint; labelled progress; [`INTEGRATION.md`](docs/INTEGRATION.md) |

## Credits

QoreChain kits: `@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/evm`, `@qorechain/qorex-rainbowkit`, `@qorechain/qorex-types` (Apache-2.0). OpenZeppelin Contracts 5.1 (MIT). Foundry and forge-std (MIT/Apache-2.0). viem, wagmi, RainbowKit, TanStack Query, Next.js, React (MIT). cosmjs (Apache-2.0). The commit-reveal family is the same as [Pyth Entropy](https://docs.pyth.network/entropy/protocol-design); Sortes adds the ML-DSA-protected house and timeouts.

## Licence

MIT, see [`LICENSE`](LICENSE).
