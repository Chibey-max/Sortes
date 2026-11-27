# Sortes PRD

Nov 24, 2026 · @Dave

Sortes is fair randomness for QoreChain apps, shipped with a fair-trait NFT mint, for the Build Before Q-Day Post-Quantum dApp category. Everything below must be built, tested and live on diana by Dec 2, 2026, 23:59 UTC.

## 0. Changes after the day-0 checks (25 Nov 2026)

These override anything below that contradicts them.

| Area | Change | Why |
| --- | --- | --- |
| Lock hash (§6, §9) | Kept in the result formula, but stored as whatever `blockhash(lockBlock)` returns, with no revert when it is zero. Trust model is stated as two-party on diana: rigging needs the house **and** the buyer. `LockHashUnavailable` is dropped. | `blockhash()` returns zero inside contracts on diana. |
| Fulfilled event (§7) | `Fulfilled(id, secret, result)`: the secret is emitted so anyone can re-verify. | A QoreX cross-VM reveal leaves no EVM calldata to read the secret from. |
| Key check (§7) | Enroll and every admin action require `pqcKeyStatus(house)` = `registered` and `algorithmId == 1` (ML-DSA-87). `KeyNotProven` now means "not an ML-DSA-87 key". The `pqcVerify` check over the enroll digest is the proof of possession. | The precompile returns `(registered, algorithmId, pubkey)`; there is no possession flag on the EVM side. |
| Chain checkpoint (§7) | New `checkpoint(position, value)`: anyone may advance the hash-chain checkpoint over assigned positions. | More than `MAX_SKIP` timed-out requests in a row would otherwise block every later reveal. |
| Refunds (§7) | A refund that cannot be pushed is credited to `owed[]` and taken with `claimOwed()`. `addBond()` lets anyone top up the bond. | Funds never get stuck behind a reverting beneficiary. |
| Mint paths (§8, §11) | Two options for the user. **QoreX:** a native `MsgCrossVMCall` into `SortesMint.mintSponsored(commit)`; no value can cross, so the fee comes from a sponsor pool (3 per wallet). **MetaMask:** `mint(commit)` paying 1 QOR inside an EVM window opened from QoreX. | QoreX rejects `eth_sendTransaction` today; its only write path is the native lane. |
| One signature (§10, §11) | The daemon serves `POST /reveal`: after the house reveal, the browser hands it the secret; the daemon checks it against the commitment and sends `revealUser`, then `finalize`. The wallet path remains as a fallback. This answers the open question about a second popup. | The house value is already fixed when the secret is handed over, so this gives the house nothing. |
| Daemon window (§10) | Scoped to the house **and** mint contracts. The daemon also claims both kinds of timeout so users never have to. | It finalizes lots and settles timeouts. |
| Block time (§6) | Measured 1.43 s (not 1.3): `W_HOUSE` 100 ≈ 2.4 min, `W_USER` 150 ≈ 3.6 min, a 17,280-block window ≈ 6.9 h. Parameters unchanged. | Day-0 measurement. |
| Schedule (§15) | The day-by-day plan is dropped: build everything, then verify it end to end. | Author's decision. |

## 1. Summary

**Problem:** QoreChain has no fair source of random numbers. Apps that need chance (mints, loot, games) use transaction hashes or block hashes, which the sender or validators can steer. The randomness services other chains rely on, Chainlink VRF and drand, are built on cryptography a quantum computer breaks.

**Solution:** Sortes is a house contract that any app plugs into. Each request mixes three inputs: a value the house locked in advance (a hash chain), a secret the user committed, and the hash of a block nobody knew at request time. Whoever stays silent gets the floor result, so silence never helps. Every action that moves the house's money needs an ML-DSA-87 signature checked on chain by `pqcVerify`.

**Flagship app:** Sortes Mint, an NFT collection whose traits come from the fair result, with art drawn fully on chain. **Second app** (only if on track): Sortes Dice, about 60 lines, to show the house is reusable.

**Thesis line:** *"QoreChain had no fair randomness. Sortes brings proven commit-reveal to QoreChain, built only from quantum-safe parts, with the house's funds locked behind ML-DSA-87."*

| Item | Value |
| --- | --- |
| Hackathon | Build Before Q-Day (QoreChain Developer Fest) |
| Category | Post-Quantum dApp (solo) |
| Network | qorechain-diana testnet, EVM chain ID 9800 |
| Deadline | 2 December 2026, 23:59 UTC (00:59 on 3 December in Lagos) |
| Also eligible for | Quantum Campus, Best AI-Native Build, People's Choice |

## 2. Goals and success criteria

The project is done when every line below is true on diana and can be checked by a judge without trusting you.

| Rubric criterion (weight) | Success criterion |
| --- | --- |
| Works as described (25%) | Mint app live; at least 30 settled mints on diana, at least 10 from other wallets; every documented flow (mint, reveal, both timeouts, refund) has a real transaction hash in the README |
| QoreChain tech usage (25%) | `pqcVerify` and `pqcKeyStatus` in deployed bytecode; scoped EVM window used and renewed by the daemon; kits listed in package.json; all qor1 addresses on the project page show Verified |
| Post-quantum correctness (20%) | Only keccak256 and ML-DSA-87 in the trust path; ECDSA-only attacks fail on chain; THREAT\_MODEL.md covers every attacker in section 9 |
| Originality (15%) | First fair randomness source on QoreChain; README explains why ML-DSA can't be used as a VRF |
| Clarity, UX, docs (15%) | "Judge it in 5 minutes" README section; mint works on mobile; every pending state has a clear label; video under 3 minutes |

**Hard numbers to hit:** 40+ Foundry tests passing, both QCAI audit stages done, zero TODOs in the repo, and the house daemon running unattended for 24+ hours before submission.

## 3. Scope and non-goals

**In scope:**

- `SortesHouse.sol`, the randomness contract any app can call
- `SortesMint.sol` and the mint web app (flagship)
- House daemon that answers requests and keeps its EVM window open
- Verifier page and attack page
- Integration guide for other apps
- `SortesDice.sol`, only after the mint app is finished (day 6)

**Out of scope (say so in the README, once, as scope rather than as a limitation):**

- Draws with many entrants, such as raffles or airdrop winner picks
- Mainnet: `pqcVerify` is active only on diana today
- Several houses per request, a token, or fees beyond a flat mint price
- Any AI inside the product. AI is used in development and logged in AI\_USAGE.md.

## 4. Users and user stories

| User | Story | Done when |
| --- | --- | --- |
| Minter | I mint an NFT and get traits nobody could rig, including the collection's creator | One click mints; traits appear within about a minute; the verifier page shows the math |
| Minter | If the house never answers, I don't lose my money | A "Claim refund" button appears after the house timeout and pays fee plus penalty |
| App developer | I add fair randomness to my contract in a few lines | The integration guide's example compiles and runs against the deployed house |
| House operator | A stolen ordinary (ECDSA) key can't drain my deposit or change my payout | Those calls revert without a fresh ML-DSA-87 signature |
| Judge | I can check every claim against the chain myself | README links each claim to a transaction or a test |

## 5. System overview

Five pieces: two contracts, one daemon and two web surfaces. The house contract is the only piece that holds the fairness logic. Everything else can be rebuilt by another team.

| Component | Runs where | Job |
| --- | --- | --- |
| `SortesHouse.sol` | diana EVM | Holds the hash-chain anchor, the bond and the fees; records requests and reveals; computes results; enforces timeouts; gates money actions with ML-DSA-87 |
| `SortesMint.sol` | diana EVM | ERC-721 that opens one Sortes request per mint and turns the result into traits and on-chain SVG art |
| House daemon | Always-on server | Watches for requests, reveals the house value after the lock block, renews its own EVM window |
| Web app | Vercel | Mint, token pages, gallery, verifier, attack page, integration guide |
| `SortesDice.sol` | diana EVM | Optional second consumer (day 6) |

**How one mint flows:**

1. The browser generates a 32-byte secret, saves it locally, and computes the commitment.
2. The user calls `SortesMint.mint(commit)` and pays the mint price. The mint contract opens a Sortes request and mints token #id in Pending state. This is the user's only signed transaction in the happy path.
3. Two blocks later, the lock block exists. Its hash was unknown to everyone when the user committed.
4. The daemon calls `revealHouse(requestId, value)`. The contract checks the hash chain and stores the lock block's hash.
5. The browser sees the house reveal and sends `revealUser(requestId, secret)`. The contract checks the commitment and computes the result.
6. Anyone calls `SortesMint.finalize(id)`. Traits are fixed and the art renders.
7. If step 4 or step 5 misses its deadline, anyone can call the timeout, and the token gets floor traits. A house timeout also refunds the fee plus a penalty.

## 6. Protocol spec

### Hash chain

- The daemon draws a 32-byte `seed` and computes `h[0] = keccak256(seed)`, then `h[i] = keccak256(h[i-1])` for i = 1 to N. N = 10,000.
- The **anchor** is `h[N]`, posted at enrollment.
- Request position p (1, 2, 3...) uses `v[p] = h[N - p]`. So `keccak256(v[p]) == v[p-1]`, with `v[0]` = anchor.
- Revealing `v[p]` makes every earlier value computable, but no later one. Positions are assigned only to requests, so values for future requests stay secret.
- The contract stores the highest revealed position and its value. To check a new value at a higher position, it hashes forward up to `MAX_SKIP` = 32 times. For an earlier position, it derives the value itself.

### Commitment and result

```
commit = keccak256(abi.encode("SORTES-COMMIT-v1", secret, beneficiary, consumer, chainId))
result = keccak256(abi.encode("SORTES-RESULT-v1", houseValue, secret, lockHash, requestId, house, chainId))
```

`lockHash` is `blockhash(lockBlock)`, where `lockBlock = requestBlock + LOCK_DELAY`. It's stored when the house reveals, because the EVM only returns hashes for the last 256 blocks.

### Request lifecycle

| Status | Entered when | Next |
| --- | --- | --- |
| `Requested` | Consumer calls `request` | `HouseRevealed`, or `HouseTimedOut` after the house deadline |
| `HouseRevealed` | Valid house value posted after `lockBlock` and before `lockBlock + W_HOUSE` | `Fulfilled`, or `UserTimedOut` after the user deadline |
| `Fulfilled` | Valid secret posted before `houseRevealBlock + W_USER` | Final |
| `HouseTimedOut` | Anyone calls `claimTimeout` after the house deadline | Final: floor result; fee and penalty paid to the beneficiary |
| `UserTimedOut` | Anyone calls `claimTimeout` after the user deadline | Final: floor result; fee kept by the house |

**Why the floor on a house timeout, not a re-roll:** if a silent house led to a fresh roll, a house working with a buyer could stay silent until the buyer's result looked rare. With a fixed floor, silence can only ever produce the worst outcome.

### Parameters (set at deploy, testnet values)

| Name | Value | Why |
| --- | --- | --- |
| `LOCK_DELAY` | 2 blocks | Lock block is unknown at commit time |
| `W_HOUSE` | 100 blocks (about 2 minutes) | Must stay under 256 so the lock hash is still readable |
| `W_USER` | 150 blocks | Room for a slow wallet |
| `MAX_SKIP` | 32 | Caps the gas of one reveal |
| `FEE` | 1 QOR | Paid per request |
| `PENALTY` | 2 QOR | Paid from the bond on a house timeout |
| `MIN_BOND` | 200 QOR | Covers 100 open requests' penalties |

Block times on diana are about 1.3 seconds, so check the window lengths against live block times on day 0.

## 7. Contract spec: SortesHouse

One house per deployment. Solidity 0.8.x, Foundry, OpenZeppelin `ReentrancyGuard`. Precompile addresses written in lowercase: `pqcVerify` at `0x0000000000000000000000000000000000000a01`, `pqcKeyStatus` at `0x0000000000000000000000000000000000000a02`.

### Storage

- `house` (address), `payout` (address), `anchor`, `chainLength`, `nextPosition`
- `lastPos`, `lastVal` (highest revealed position and value)
- `bond`, `earned` (fees owed to the house), `openRequests`
- `adminNonce` (for ML-DSA-signed actions), `accepting` (bool)
- `requests[id]`: consumer, beneficiary, commit, position, requestBlock, lockBlock, houseRevealBlock, houseValue, lockHash, result, fee, status

### Functions

| Function | Who | Checks | Effect |
| --- | --- | --- | --- |
| `enroll(anchor, N, sig)` payable | house | Not enrolled; `pqcKeyStatus(house)` is registered and proven; `pqcVerify` over the enroll message; bond at least `MIN_BOND` | Stores the anchor and bond; `accepting = true` |
| `request(commit, beneficiary)` payable | any contract | `accepting`; `msg.value == FEE`; bond covers `PENALTY` for every open request | New id and position; lockBlock = now + `LOCK_DELAY` |
| `revealHouse(id, value)` | anyone (normally the daemon) | Status `Requested`; past lockBlock; before the house deadline; value fits the chain; `blockhash(lockBlock) != 0` | Stores the value and lockHash; status `HouseRevealed` |
| `revealUser(id, secret)` | anyone (normally the app) | Status `HouseRevealed`; before the user deadline; secret matches the commit | Computes the result; status `Fulfilled`; fee moves to `earned` |
| `claimTimeout(id)` | anyone | A deadline has passed | `HouseTimedOut`: pays fee plus penalty from the bond to the beneficiary. `UserTimedOut`: fee moves to `earned` |
| `resultOf(id)` view | anyone | None | Returns status and result |
| `withdraw(amount, sig)` | anyone carrying the signature | `pqcVerify` over the withdraw message; bond left still covers open requests | Sends to `payout` |
| `setPayout(addr, sig)` | same | `pqcVerify` | Changes `payout` |
| `rotateAnchor(newAnchor, N, sig)` | same | `pqcVerify`; `openRequests == 0` | New chain; positions restart |
| `setAccepting(bool, sig)` | same | `pqcVerify` | Pauses or resumes new requests |

**Signed message format** (for every ML-DSA action):

```
keccak256(abi.encode("SORTES-ADMIN-v1", action, chainId, address(this), house, params, adminNonce))
```

The 32-byte digest is passed as the message to `pqcVerify`, with the public key read fresh from `pqcKeyStatus(house)`. `adminNonce` increments on every success, so signatures can't be replayed.

### Events

`Enrolled`, `Requested(id, consumer, beneficiary, position, lockBlock)`, `HouseRevealed(id, value, lockHash)`, `Fulfilled(id, result)`, `TimedOut(id, status)`, `Withdrawn`, `PayoutChanged`, `AnchorRotated`, `AcceptingChanged`.

### Errors

`NotAccepting`, `BadFee`, `BondTooLow`, `BadStatus`, `TooEarly`, `TooLate`, `BadReveal`, `SkipTooFar`, `LockHashUnavailable`, `BadSecret`, `KeyNotRegistered`, `KeyNotProven`, `BadPqcSignature`, `OpenRequests`.

## 8. Contract spec: SortesMint and SortesDice

### SortesMint (flagship)

An OpenZeppelin ERC-721 called "Sortes Lots", with a supply of 1,000 and a price equal to the house `FEE`.

| Function | Effect |
| --- | --- |
| `mint(commit)` payable | Forwards the fee to `house.request(commit, msg.sender)`; mints token id to the sender in Pending state; maps token to request |
| `finalize(tokenId)` | Anyone can call. Reads `house.resultOf`. `Fulfilled`: derives traits from the result. Either timeout: assigns floor traits. Emits `Revealed(tokenId, traits, floor)` |
| `tokenURI(tokenId)` | Base64 JSON with on-chain SVG. Pending tokens show a "revealing" card with the request id |

**Traits (updated after the web design):** 5 traits drawn as a bronze plate: Metal, Emblem, Border, Seal and Frame (tier: common 60%, uncommon 26%, rare 10%, legendary 4%). Each trait rolls independently as `keccak256(result, i) % 10000` against its own odds table (see README, "The lots" and `contracts/src/lib/Traits.sol`). The floor plate is silver, owl, bead and reel, wheel, common. This supersedes the earlier Background/Shape/Pattern/Eyes/Aura layout.

```
roll_i  = uint256(keccak256(abi.encode(result, i))) % 10000   // tier
pick_i  = uint256(keccak256(abi.encode(result, i, "v")))      // variant within tier
floor   = every trait Common, variant 0
```

**Art:** SVG built from trait values: background colour, a central shape, a pattern overlay, eyes, and an aura ring for Rare and Legendary. Everything lives on chain, with no IPFS, so the art can be rebuilt from the chain alone.

### SortesDice (day 6, only if the mint is finished)

About 60 lines, funded by a bankroll the owner deposits.

- `roll(pick, commit)` payable: pick 1 to 6; stake up to a max; opens a request with the fee paid from the stake.
- `settle(id)`: `Fulfilled` pays 5.7x the stake when `result % 6 + 1 == pick`. `UserTimedOut` keeps the stake. `HouseTimedOut` refunds the stake, and the house penalty goes to the player.

## 9. Security: guarantees, trust model, threats

### Guarantees (each has a test and an on-chain demo)

1. **The house alone can't steer a result.** Its value was fixed at enrollment, and it never sees the user's secret before revealing.
2. **The user alone can't steer a result.** The secret is committed before the house value and before the lock block exist.
3. **Silence never helps.** A silent house or a silent user leads to the floor result, never a re-roll.
4. **Funds never get stuck.** Every request ends as `Fulfilled`, `HouseTimedOut` or `UserTimedOut`, and anyone can trigger the timeout.
5. **A stolen ECDSA key can't move the house's money.** Withdraw, payout change, anchor rotation and pause all need a fresh ML-DSA-87 signature.
6. **No elliptic-curve or pairing cryptography in the trust path.** Results use keccak256 only, which keeps about 128-bit preimage security against Grover's algorithm.

### Trust model (state it once, plainly, in the README)

To rig a single mint in a buyer's favour, three parties must collude: the house operator, that buyer, and the validator who proposes the lock block. Without the validator, the house and the buyer still can't know the lock hash when the secret is committed.

### Threat table

| Attacker | Attempt | Defence | Error or outcome |
| --- | --- | --- | --- |
| House | Post a fake value | Hash-chain check | `BadReveal` |
| House | Stay silent to avoid a bad outcome | It doesn't know the outcome; silence gives floor plus a penalty | `HouseTimedOut` |
| House and buyer | Stay silent until the result is rare | Silence gives floor, never a re-roll | `HouseTimedOut` |
| User | Swap the secret after seeing the house value | Commitment check | `BadSecret` |
| User | Stay silent after seeing a bad result | Floor result | `UserTimedOut` |
| Sender | Grind the transaction hash | Transaction hash isn't an input | Not applicable |
| Thief with the ECDSA key only, during an open window | Withdraw the bond, change payout, rotate the anchor | `pqcVerify` on each | `BadPqcSignature` |
| Replayer | Reuse an old admin signature | `adminNonce` and the contract address in the message | `BadPqcSignature` |
| Anyone | Re-enter during a payout | `ReentrancyGuard`, checks-effects-interactions | Revert |
| Validator | Bias the lock hash | Needs the house value and the secret too | See trust model |

## 10. House daemon spec

TypeScript on Node 20, using `@qorechain/sdk`, `@qorechain/pqc` and `@qorechain/evm` (with viem). Runs under pm2 on an always-on server.

**Responsibilities:**

1. **Chain setup** (CLI command `sortes-house init`): draws the seed, precomputes all 10,000 links, and writes them to a file readable only by the owner. It prints the anchor and signs the enroll message with the ML-DSA-87 key.
2. **Window keeper:** reads the window with `fetchEvmWindow` every minute. It opens a new one with `openEvmWindowMsg` when fewer than 50 transactions or 20% of the blocks remain. Scope: allowed targets = the house contract only, 17,280 blocks, 1,000 transactions, and a value cap sized to gas.
3. **Reveal loop:** subscribes to `Requested` events, with a polling fallback every 5 seconds. For each request past its lock block, it sends `revealHouse` at once.
4. **Restart safety:** stores the last handled request id on disk. On start, it rescans events from that point, so a crash never skips a request.
5. **Health endpoint:** `GET /health` returns the window budget left, the last block seen, open requests, and the oldest unrevealed request's age. The verifier page shows it as "house status".
6. **Admin CLI:** `withdraw`, `set-payout`, `pause`, `rotate`. Each builds the signed message, signs it with ML-DSA-87, and sends it.

**Keys:** the ML-DSA-87 key and the secp256k1 key live in an encrypted file loaded at start, never in the repo or in environment variables committed anywhere. Use a fresh testnet-only account.

**Done when:** the daemon reveals every request within 10 blocks of its lock block for 24 hours straight, and it survives a kill-and-restart test with no missed request.

## 11. Web app, verifier and attack page

Next.js (App Router) with wagmi, viem and `@qorechain/qorex-rainbowkit`, hosted on Vercel. All chain reads go straight to diana RPC, with no backend except the daemon's health endpoint.

### Pages

| Route | Purpose | Must show |
| --- | --- | --- |
| `/` | Mint | QoreX connect; whether the user's EVM window is open, with how to open it; price; supply left; Mint button; live progress |
| `/lot/[id]` | One token | Art, traits with tiers, status, request id, links to every transaction, "Verify this lot" |
| `/gallery` | All minted tokens | Grid of art, filter by tier |
| `/verify` | Check any request | Input a request id or token id; every check below with a pass or fail |
| `/attacks` | Attack page | The 8 attacks below |
| `/build` | Integration guide | The 10-line example contract, deployed addresses, the `resultOf` interface |
| `/house` | House status | Bond, fees earned, open requests, window budget, daemon health |

### Mint progress states

Shown as a 4-step tracker: **Committed** (transaction sent) → **Lock block passed** → **House revealed** → **Your reveal sent** → **Traits revealed**. Show an "Act needed" banner if the browser is closed before step 4, and a "Claim refund" or "Finalize" button when a timeout applies.

**Secret handling:** generated with `crypto.getRandomValues`; saved in localStorage under the request id before the mint transaction is sent; offered as a one-click backup download. If the secret is lost, the result is the floor, so the app warns about this before minting.

### Verifier checks

1. The house value hashes forward to the anchor through the chain.
2. The secret matches the stored commitment.
3. `lockHash` equals the lock block's hash, read from the RPC.
4. Recomputing the result from the three inputs gives the stored result.
5. Recomputing the traits from the result gives the token's traits.
6. The request finished within its deadlines.

### Attack page

Each entry has a one-line explanation, the script that ran it (in `script/attacks/`), the diana transaction hash, and the error it hit. Show attacks as generic patterns, without naming other fest teams.

1. `block.prevrandao` returns the same value each block (if the day-0 check confirms it)
2. Transaction-hash randomness: the sender re-signs until the hash wins (an off-chain demo script with real signatures)
3. Forged house reveal: `BadReveal`
4. Silent house: `HouseTimedOut`, with floor traits plus a refund and penalty
5. Silent user after a bad result: `UserTimedOut`, with floor traits
6. Swapped secret: `BadSecret`
7. ECDSA-only thief in an open window tries `withdraw` and `setPayout`: `BadPqcSignature`
8. Replayed admin signature: `BadPqcSignature`

## 12. Testing plan and acceptance criteria

Target: 40+ Foundry tests, all green, with the exact count in the README. The precompiles don't exist in a local Foundry chain, so use mock contracts etched at `0x...0a01` and `0x...0a02` with `vm.etch`. Mark these mocks clearly, and prove the real path with diana scripts.

### Foundry tests

| Group | Tests |
| --- | --- |
| Enroll | Happy path; unregistered key; unproven key; bad signature; bond too low; double enroll |
| Request | Happy path; wrong fee; not accepting; bond can't cover penalties; positions increase |
| House reveal | Happy path; too early; too late; wrong value; skip over 32; earlier position derived; lock hash stored |
| User reveal | Happy path; wrong secret; secret bound to another beneficiary; too late |
| Timeouts | House timeout pays fee plus penalty; user timeout credits the house; neither before its deadline; anyone can call |
| Admin (ML-DSA) | Withdraw, setPayout, rotate, pause each succeed with a valid signature; fail with a bad signature; fail on replay; rotate blocked with open requests; withdraw blocked below cover |
| Mint | Mint opens a request; finalize after each status; floor on both timeouts; traits deterministic; tokenURI valid JSON; supply cap |
| One per guarantee | Guarantees 1 to 5 from section 9, as named tests |

**Fuzz tests:** chain-link check with random skip lengths; trait derivation always within tier ranges; commit binding with random secrets.

**Invariant tests:** the contract balance always equals bond plus earned plus fees held for open requests; no request stays non-final once both deadlines pass.

### Acceptance on diana

- [ ] House enrolled with a real ML-DSA-87 signature (transaction hash in the README)
- [ ] 30+ mints settled, 10+ from other wallets
- [ ] At least one house timeout and one user timeout, triggered on purpose
- [ ] All 8 attacks run with hashes recorded
- [ ] Verifier passes on 5 random lots
- [ ] Daemon ran 24 hours unattended
- [ ] QCAI Stage 1 and Stage 2 PDFs in `docs/audit/`

## 13. Repo layout, environments and deployment

One fresh public repo, MIT licence, with commits from today on.

```
sortes/
  contracts/            Foundry project
    src/                SortesHouse.sol, SortesMint.sol, SortesDice.sol, lib/Traits.sol, lib/Art.sol
    test/               unit, fuzz, invariant, mocks/PqcMock.sol
    script/             Deploy.s.sol, attacks/*.s.sol
  house/                daemon + admin CLI (TypeScript)
  web/                  Next.js app
  docs/                 THREAT_MODEL.md, AUDIT.md, audit/, INTEGRATION.md
  README.md  AI_USAGE.md  LICENSE
```

| Setting | Value |
| --- | --- |
| Network | qorechain-diana, chain ID 9800 |
| Precompiles | `pqcVerify` 0x...0a01, `pqcKeyStatus` 0x...0a02 (check `active_static_precompiles` on day 0) |
| Accounts | House (fresh, testnet only); test user; deployer can be the house |
| Secrets | `.env.local` only, listed in `.gitignore`; never commit keys |

**Deploy order:**

1. Register and prove the house account's ML-DSA-87 key, then open a scoped window.
2. Deploy `SortesHouse` with the parameters from section 6.
3. Run `sortes-house init`, then `enroll` with the bond.
4. Deploy `SortesMint` pointing at the house.
5. Start the daemon under pm2 and check `/health`.
6. Mint once from a second wallet end to end before telling anyone.
7. Add every contract and qor1 address to the README and the project page.

## 14. Submission deliverables and demo video

### Deliverables

- [ ] Public repo with an MIT licence
- [ ] README: thesis line; "Judge it in 5 minutes" (open the app, mint, verify, read the attacks); how it works; guarantees; trust model; scope; addresses and transaction hashes; exact test count; credits for every kit and library; rubric map
- [ ] `docs/THREAT_MODEL.md`, `docs/AUDIT.md`, `docs/audit/` (both QCAI PDFs, same EVM/Solidity setting), `docs/INTEGRATION.md`
- [ ] `AI_USAGE.md` (tools used, what for, what you checked by hand), with the AI-native box ticked
- [ ] Featured image: a grid of 6 real minted lots with the Sortes name
- [ ] Video under 3 minutes
- [ ] Project page: category, kits, features, every qor1 address, How it's made (pointing to the audit docs), country Nigeria, student
- [ ] Post on X with #BuildBeforeQDay on the day the mint goes live, and again at submission

### Video script (under 3:00)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 to 0:20 | Transaction-hash and block-hash attack demos | QoreChain apps have no fair randomness, and the tools other chains use break on Q-Day |
| 0:20 to 0:50 | Simple diagram of the three inputs | House value locked in advance, user secret, a block nobody knew. Silence gives the floor |
| 0:50 to 1:40 | Live mint on screen, progress tracker, traits appear, then `/verify` | Every check passes, and you can run it yourself |
| 1:40 to 2:20 | `/attacks`: forged reveal, silent house, ECDSA-only thief | Each one fails on chain, with the transaction hash |
| 2:20 to 2:45 | `/build` and `/house` | Any app plugs in with about 10 lines |
| 2:45 to 3:00 | Thesis line, repo link | QoreChain had no fair randomness. Now it does |

## 15. Build order, day-0 checks and open questions

### Build order

| Day | Date | Build | Done when |
| --- | --- | --- | --- |
| 0 | Tue 24 Nov | Register on the fest site; repo; faucet; keys; day-0 checks below; start `SortesHouse` | Every day-0 check answered |
| 1 | Wed 25 Nov | Finish `SortesHouse` and its tests | House tests green |
| 2 | Thu 26 Nov | `SortesMint`, traits, on-chain art, tests; first deploy to diana | 40+ tests green; a manual mint works on diana |
| 3 | Fri 27 Nov | Daemon (init, window keeper, reveal loop, health); enroll; Workshop 4 (17:30 Lagos); QCAI Stage 1 | Mints settle without you touching anything |
| 4 | Sat 28 Nov | Web app: mint, progress, lot page; answer the Stage 1 findings, then run Stage 2 | A full mint works in the browser, phone included |
| 5 | Sun 29 Nov | Verifier, attack scripts and page, gallery, house page; message the Quantum Flip and Quantum Dice teams | 8 attacks have hashes; verifier passes |
| 6 | Mon 30 Nov | Polish; 20+ outside testers; start the 24-hour daemon run; `SortesDice` only if all else is done | 10+ outside mints; no open bugs |
| 7 | Tue 1 Dec | README, threat model, integration guide, AI\_USAGE; featured image; record the video | Every deliverable box ticked except submission |
| 8 | Wed 2 Dec | Fill the project page, press Check again, post on X | Everything Verified by 20:00 Lagos |

### Day-0 checks (these can change the design)

- [x] **blockhash:** RESULT: zero in contracts (n−1 … n−9000). Kept as an optional input; see §0. a contract reading `blockhash(block.number - 2)` returns real, changing values on diana. If it doesn't, replace the lock hash with a second commit from the daemon and update section 6.
- [x] **pqcVerify message format:** RESULT: raw 32-byte digest, FIPS-204 ML-DSA-87, empty context; verified live (true / tampered false); ~312k gas. sign a 32-byte digest with `@qorechain/pqc`, then check it with an `eth_call` to `0x...0a01`. Confirm both sides use the same message bytes and the same context.
- [x] **Precompiles active:** RESULT: 0x…0a01 and 0x…0a02 listed (also 0x…0901, 0x…0C01). `GET /cosmos/evm/vm/v1/params` lists `0x...0a01` and `0x...0a02` in `active_static_precompiles`.
- [x] **User windows:** RESULT: QoreX cannot send EVM transactions; windows are opened from QoreX for coin-60 accounts (MetaMask). Both mint paths in §0. find out how QoreX opens an EVM window for a normal user before their first mint, and write the app's guidance around it.
- [x] **prevrandao:** RESULT: constant 0xff…ff in every block. read it in two blocks for the attack page.
- [ ] **Category:** confirm with the organisers that Sortes fits Post-Quantum dApp.

### Open questions

- Exact gas of `revealHouse` with a 32-step skip, and of `pqcVerify` with real key sizes. Measure on day 2.
- Whether QoreX can sign the user reveal without a second popup. If not, the progress tracker must make that second step obvious.
