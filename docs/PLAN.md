# Build Before Q-Day: Research and Winning Plan

Nov 23, 2026 · @Dave

> Where this plan and `docs/PRD.md` differ, the PRD wins. Known differences: the PRD uses a single `claimTimeout(id)` (this plan names `claimHouseTimeout` / `claimUserTimeout`), `withdraw` (this plan: `withdrawBond`), `setAccepting` (this plan: `exit`), adds the lock block hash as a third result input, and fixes the commit/result encodings in its section 6.

## Bottom line

Drop QoreFeed. Build **Sortes**, fair randomness that any QoreChain app plugs into, shipped with a polished fair-trait NFT mint on top. Enter it in the **Post-Quantum dApp** category. Submit by 2 December 2026, 23:59 UTC (00:59 on 3 December in Lagos).

- **QoreFeed is out for two reasons.** Protocol Builders needs a team of 2 to 4, so you can't enter it solo. And three oracle projects are already listed: Sealed Scouts, Augury and Oraqle.
- **Randomness is the clearest open gap.** None of the 146 projects provides a randomness source. Yet BANZAI VEGAS, Quantum Dice and Quantum Flip need one, and the fest runs its own raffle on drand, off chain.
- **It fits the Q-Day theme well.** The best-known randomness services, Chainlink VRF and drand, rest on cryptography that a large quantum computer breaks. Sortes uses only hash chains and ML-DSA-87.
- **Thesis line for judges:** *"QoreChain had no fair randomness. Sortes brings proven commit-reveal to QoreChain, built only from quantum-safe parts, with the house's funds locked behind ML-DSA-87."*

## Rules that matter

You have about 9 days. Building runs 4 November to 2 December 2026, with the deadline at 23:59 UTC on 2 December. Checks run 3 to 5 December, judging 6 to 15 December, and winners are announced live on 16 December. The [rules](https://build.qorechain.io/rules) and [prizes](https://build.qorechain.io/prizes) pages also say details may still change.

**Rubric** (same for every category, from the [FAQ](https://build.qorechain.io/faq)):

| Criterion | Weight |
| --- | --- |
| Works as described | 25% |
| QoreChain tech usage, verified in repo and on chain | 25% |
| Post-quantum correctness and security | 20% |
| Originality | 15% |
| Clarity, UX and documentation | 15% |

**Post-Quantum dApp requirements:** a scoped EVM window, pqcVerify, a two-stage QCAI audit, and Foundry or Hardhat tests. Team size is 1 to 3. Prizes are $1,500, $750 and $500.

**Submission checklist:**

- [ ] Registered with GitHub, X and a QoreX testnet address all connected
- [ ] Fresh public repo (only commits from 4 November count)
- [ ] README crediting every library, kit and template used
- [ ] Featured image
- [ ] Video of 3 minutes or less
- [ ] Testnet qor1 addresses on the project page
- [ ] MIT or Apache-2.0 licence file
- [ ] `docs/audit/` with both dated QCAI PDFs, plus `docs/AUDIT.md` mapping each Stage 1 finding to your response
- [ ] A README line and the "How it's made" field pointing to the audit docs
- [ ] `AI_USAGE.md` and the AI-native box ticked (for Best AI-Native Build)

**Two audit details:** use the EVM/Solidity setting for both stages. "Quantum readiness: Not scored" under EVM is expected, so explain your post-quantum design in `docs/AUDIT.md`.

## Field map

The [projects page](https://build.qorechain.io/projects) lists 146 projects. Post-Quantum dApp is the biggest category, but most entries are variations on a few ideas.

| Category | Projects | What most of them are |
| --- | --- | --- |
| Post-Quantum dApp | 39 | Vaults, escrows, inheritance, timelocks; one price feed (Oraqle) |
| Quantum Pass | 33 | Readiness checkers, certificates, small games |
| Post-Quantum AI Agents | 29 | Spending-limit and bill-pay agents (Leash, Tollgate, Fenestella and many more) |
| Encrypted Apps | 27 | Sealed messaging, payroll, sealed-bid auctions |
| Protocol Builders | 10 | Rollups, including two price oracles (Sealed Scouts, Augury) |
| Cross-VM | 8 | Escrow and vesting across EVM and Native |

**Gaps no listed project fills:** a randomness source, a stablecoin, an indexer, a lending protocol, and a bridge. Randomness is the only one that is small enough to finish solo in 9 days and also has users waiting: BANZAI VEGAS (daily raffle), Quantum Dice and Quantum Flip.

**Why randomness is a real gap:** the [EVM Development](https://docs.qorechain.io/developer-guide/evm-development) and [EVM Precompiles](https://docs.qorechain.io/developer-guide/evm-precompiles) pages don't mention randomness at all, and no randomness precompile exists. QoreChain runs on Cosmos EVM, and Cosmos-based EVMs such as [Cronos](https://docs.cronos.com/for-dapp-developers/cronos-evm-differences-from-ethereum/evm-opcode-difficulty-prevrandao) return a constant for `block.prevrandao`. Grok said the same for QoreChain, but I couldn't confirm it from the docs, so check it on day 0 (see the last section).

**Closest fest projects:** three entries use randomness, and none uses a fair source. [Quantum Flip](https://github.com/andiPangeranm142/quantum-flip)'s own README says it would need commit-reveal or a VRF for anything of value. [Quantum Dice](https://github.com/agusher21/quantum-dice) takes the result from the transaction hash, which the sender knows before sending. [BANZAI VEGAS](https://github.com/agusher21/banzai-vegas-qorechain) uses a future block hash. These are your first integration targets, not rivals to name on the attack page.

## Why QoreFeed is out

QoreFeed was the right call two weeks ago, but the field has moved on.

- **Category blocked:** the Grok bot compared QoreFeed with Sealed Scouts, a Protocol Builders entry. The [rules](https://build.qorechain.io/rules) put Protocol Builders at 2 to 4 members, so a solo entry isn't eligible there.
- **Three oracles already exist:** [Sealed Scouts](https://github.com/AaroneGeorge/Sealed-Scouts) already has bonded scouts, ML-KEM-sealed reports, a rollup and a live demo. Augury is a second oracle rollup, and Oraqle is a price feed in Post-Quantum dApp, the category you'd enter.
- **Originality risk:** a fourth oracle scores poorly on originality (15% of the rubric) and invites a direct comparison with a team that has a two-week head start.

## The pick: Sortes

Sortes is fair randomness that any QoreChain app plugs into. Neither the app's house nor the user can steer a result, and anyone who refuses to reveal gets the default outcome. You ship it with one polished app on top, a fair-trait NFT mint, and one small second user, dice, to prove it's reusable. Sortes is a working name (Latin for "lots").

**Thesis line for judges:** *"QoreChain had no fair randomness. Sortes brings proven commit-reveal to QoreChain, built only from quantum-safe parts, with the house's funds locked behind ML-DSA-87."*

**Why two parties:** a committee beacon always leaves its last revealer a way to bias the result. With two parties, only the side that refuses to reveal could gain, and refusing is scored as the default loss, so withholding is useless. [Pyth Entropy](https://docs.pyth.network/entropy/protocol-design) uses the same commit-reveal family on other chains. Sortes adds an ML-DSA-protected house and built-in timeouts, and it's the first fair randomness source on QoreChain.

**Why not just sign with ML-DSA?** ML-DSA signatures are randomized, so a signer can make many valid signatures for one message and pick the one that hashes best. A hash chain fixes the house's values in advance, so the house has nothing to grind.

### How a request works

1. **House enrolls.** It generates a secret seed and computes a keccak256 chain of N links. It posts the chain's tip (the anchor) and a bond. The contract checks the house's key with `pqcKeyStatus` (requiring `registered` and `possessionProven`). It then checks an ML-DSA-87 signature over `SORTES-ENROLL-v1 | chainId | contract | house | anchor | N | nonce` with `pqcVerify` at `0x…0a01`.
2. **User requests.** The app (for example, the mint) sends `keccak256(secret)` from the user's browser, plus the fee. The contract assigns the house's next unused chain position. That value was fixed at enrollment, and the house never sees the secret.
3. **House reveals.** The house daemon reveals the chain value for that position within W blocks. The contract checks that it hashes to the previous link.
4. **User reveals.** The app sends the secret automatically. The result is `keccak256("SORTES" | houseValue | secret | requestId)`, and the app reads it with `resultOf(id)`.
5. **Timeouts close both doors.** If the house misses W blocks, the user is refunded plus a penalty from the bond. If the user misses W blocks after the house reveals, the app applies its default (the NFT gets common traits, and a dice stake goes to the house).

### What pqcVerify protects

The house daemon keeps an EVM window open for hours, and during that time anyone holding only its ECDSA key can send transactions. So `rotateAnchor`, `withdrawBond`, `setPayout` and `exit` each need a fresh ML-DSA-87 signature with a nonce and domain tag. `revealHouse` needs none, because only the true preimage passes the hash check.

### What Sortes guarantees

Each guarantee gets its own Foundry test and an on-chain demo.

- **The house can't bias a result:** its value is fixed before the user's secret exists.
- **The user can't bias a result:** the secret is committed before the house value is revealed.
- **Withholding never pays:** the silent side gets the default by timeout.
- **Funds never get stuck:** every request ends in a result, a refund or the default.
- **A stolen ECDSA key can't move the bond:** every house money action needs ML-DSA-87.
- **No elliptic-curve or pairing cryptography:** results use keccak256 only, which keeps about 128-bit preimage security against Grover's algorithm.

**Scope:** Sortes covers outcomes between a user and an app, such as mints, loot, dice and card draws. Draws with many entrants, such as raffles, need a different design, and Sortes doesn't claim them.

### Full scope: contracts

| Contract | Must have |
| --- | --- |
| `SortesHouse.sol` | `enroll`, `rotateAnchor`, `withdrawBond`, `setPayout`, `exit` (all ML-DSA-gated); `request`, `revealHouse`, `revealUser`, `resultOf`, `claimHouseTimeout`, `claimUserTimeout`; an event for every step |
| `SortesMint.sol` (flagship) | ERC-721; `mint` pays the fee and opens a request; traits come from the result through a fixed rarity table; common traits on user timeout; refund on house timeout; fully on-chain SVG art built from traits, with no IPFS |
| `SortesDice.sol` (day 6, only if on track) | About 60 lines: pick, stake, settle through Sortes |

### Full scope: off-chain

| Piece | Must have |
| --- | --- |
| House daemon (TypeScript) | Watches requests and reveals each one; renews its scoped EVM window with the ML-DSA key; runs under pm2 on an always-on server with a health endpoint |
| Mint web app | QoreX connect; EVM window status and how to open one; mint button; live progress (requested, house revealed, your reveal, traits); gallery; refund and claim buttons |
| Verifier page | Look up any request and recompute the hash link, commitment, result and traits in the browser |
| Attack page | Every attack below, each with a real diana transaction hash |
| Integration guide | About 10 lines of Solidity for another app to use the house |

### Full scope: proof and paperwork

- **Tests:** Foundry unit tests for every function, one test per guarantee, fuzzing of the hash-chain check and trait derivation, and an invariant that no funds get stuck. Target 40+, with the exact count in the README.
- **Audit:** QCAI Stage 1 and Stage 2 with the EVM/Solidity setting; both PDFs in `docs/audit/`; `docs/AUDIT.md` answering every Stage 1 finding.
- **Docs:** README ("judge it in 5 minutes", thesis, how it works, guarantees, scope, contract and qor1 addresses, test counts, credits, rubric map), THREAT\_MODEL.md, AI\_USAGE.md, MIT licence.
- **Submission:** featured image, video under 3 minutes, and the project page filled in (kits, features, addresses, How it's made, Nigeria, AI-native, student).

### What you need before day 1

- GitHub, X and a QoreX testnet address, all connected on the fest site
- Two testnet accounts with registered, proven ML-DSA-87 keys (house and test user), funded from the faucet
- Foundry, Node 20+, and the kits: `create-qorechain-dapp`, `@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/evm`, `@qorechain/qorex-rainbowkit`
- Somewhere to host the web app (for example, Vercel), plus an always-on server for the daemon. A laptop that sleeps will stop reveals.

### Attack page

Show attacks as generic patterns, without naming other fest teams.

- `block.prevrandao` returns the same value each block (if the day-0 check confirms it)
- Transaction-hash randomness: the sender re-signs until the hash wins
- The house submits a forged reveal: reverts with `BadReveal`
- The house goes silent: the user is refunded plus the penalty
- The user goes silent after seeing a bad result: the default applies
- The user tries to swap the secret: reverts with `BadSecret`
- An attacker with only the ECDSA key, inside an open window, tries `withdrawBond` and `rotateAnchor`: both revert with `BadPqcSignature`
- An enrollment signature replayed on a second deployment is rejected by the domain tag

## Rubric mapping

Each criterion gets one concrete piece of evidence that a judge can check in under a minute.

| Criterion | Weight | Evidence for Sortes |
| --- | --- | --- |
| Works as described | 25% | NFT mint live on diana with real mints; verifier page recomputes every result; README gives exact test counts |
| QoreChain tech usage | 25% | pqcVerify and pqcKeyStatus in contract bytecode; scoped EVM window renewed by the daemon; SDK, pqc and evm kits in package.json; all qor1 addresses on the project page |
| Post-quantum correctness | 20% | Uses only hashes and ML-DSA-87; ECDSA-only attacks fail on chain; THREAT\_MODEL.md; domain-separated signed messages |
| Originality | 15% | The only randomness source among 146 projects; explains why ML-DSA can't serve as a VRF |
| Clarity, UX, docs | 15% | "Judge it in 5 minutes" README section; polished mint app; 3-minute video; falsifiable limitations |

**Real usage is the multiplier.** Message the BANZAI VEGAS, Quantum Dice and Quantum Flip teams on day 4 with a 10-line integration snippet. One outside game using Sortes, or 20 outside minters, makes "Works as described" much stronger.

## Prizes you can stack

One project can win its category prize and special awards at the same time. Regional and Top-Quality awards go only to projects that win nothing else ([prizes](https://build.qorechain.io/prizes)).

| Prize | Amount | Why you qualify |
| --- | --- | --- |
| Post-Quantum dApp, 1st / 2nd / 3rd | $1,500 / $750 / $500 | Main target |
| Quantum Campus | $500 | Solo team, enrolled at AFIT; proof of enrolment by email if shortlisted |
| Best AI-Native Build | $500 | Add AI\_USAGE.md and tick the box |
| People's Choice | $500 / $300 / $200 | QoreX mainnet vote, 6 to 15 December; outside operators and consumers become voters |
| Regional (Middle East and Africa) | $200 | Pick Nigeria on the form; only if you win nothing else |
| Top-Quality | $250 | Score 70/100 or more and pass all checks; only if you win nothing else |

The Q-Day Survivor drill (18 November) has already passed.

## Day-by-day plan

Build the core by day 3 and get it live on diana by day 4. Day 8 is a buffer: submit by the evening of 2 December, Lagos time.

| Day | Date | Build | Done when |
| --- | --- | --- | --- |
| 0 | Tue 24 Nov | Register (GitHub, X, QoreX); fresh repo; create-qorechain-dapp Foundry starter; faucet; register and prove the ML-DSA key; run the day-0 checks below | prevrandao result recorded; category confirmed with organisers |
| 1 | Wed 25 Nov | `SortesHouse.sol`: enroll (pqcKeyStatus + pqcVerify), bet, house reveal, player reveal, settle, both timeouts | Foundry tests green, including signature binding and bad-reveal cases |
| 2 | Thu 26 Nov | Gated rotate, withdraw, payout and exit; `SortesMint.sol` traits, on-chain SVG, common traits on timeout | 40+ tests, including one per guarantee and fuzzing of the chain-link check |
| 3 | Fri 27 Nov | House daemon with self-renewing scoped window; deploy to diana; house daemon live; attend Workshop 4 (17:30 Lagos); run QCAI Stage 1 | Requests settling on diana for 2+ hours unattended |
| 4 | Sat 28 Nov | Fix Stage 1 findings, then Stage 2; write AUDIT.md; mint web app and verifier page; message the dice and flip teams | Both audit PDFs in `docs/audit/`; a full mint works end to end in the app |
| 5 | Sun 29 Nov | Attack page: all 8 attacks run on diana, with tx hashes | Every attack has a linked hash and the expected revert |
| 6 | Mon 30 Nov | Polish the mint app (loading states, errors, mobile); invite 20+ testers; add the dice contract only if the mint app is finished | Outside users have minted; no TODOs left in the repo |
| 7 | Tue 1 Dec | README (judge in 5 minutes, rubric map, exact test counts, addresses, limitations), THREAT\_MODEL.md, AI\_USAGE.md, licence, featured image; record the video | Video under 3 minutes uploaded |
| 8 | Wed 2 Dec | Fill the project page: kits, features, addresses, How it's made, Nigeria, AI-native, student; press Check again; post on X with #BuildBeforeQDay | All checks show Verified before 20:00 Lagos |

## Day-0 checks and risks

Three checks tomorrow decide whether the plan holds. Each takes under 30 minutes.

- [ ] **prevrandao:** deploy a one-line contract that returns `block.prevrandao`, or read `mixHash` from two blocks with `cast block`. If the values differ, the attack page drops that item, and the thesis rests on the quantum weakness of VRFs and the lack of any fair randomness source.
- [ ] **Category fit:** ask the organisers in the fest channel whether a randomness beacon belongs in Post-Quantum dApp. The FAQ says a pqcVerify tool deployed and tested on diana fits there.
- [ ] **Window renewal:** open a scoped window from a script with `openEvmWindowMsg`. The [window reference](https://docs.qorechain.io/developer-guide/evm-window-reference) allows up to 17,280 blocks and 1,000 transactions per window. Up to 1,000 house reveals fit in one window. Also confirm how QoreX opens a window for users, since each request and reveal is an EVM transaction.

| Risk | Fallback |
| --- | --- |
| Rules change before the deadline (the site says they may) | Check the rules and prizes pages on days 0, 4 and 8 |
| House daemon dies overnight | Run it under pm2 with a health check; users are refunded by timeout, so funds never get stuck |
| Window value cap runs out mid-run | Set a high testnet value cap; the daemon reopens the window when 20% is left |
| QCAI findings take longer than a day | Document false positives in AUDIT.md; zero findings isn't required |
| Judges ask why users should trust the house | They don't have to: the README's guarantees section and the attack page show the house can't bias or keep a stake |

## Sources

- [Build Before Q-Day home](https://build.qorechain.io/)
- [Rules](https://build.qorechain.io/rules)
- [Prizes](https://build.qorechain.io/prizes)
- [FAQ](https://build.qorechain.io/faq)
- [Projects](https://build.qorechain.io/projects)
- [Kits](https://build.qorechain.io/kits)
- [Workshop 2: pqcVerify, pqcKeyStatus, EVM window](https://docs.qorechain.io/build-before-qday/workshop-2)
- [EVM Precompiles](https://docs.qorechain.io/developer-guide/evm-precompiles)
- [EVM Development](https://docs.qorechain.io/developer-guide/evm-development)
- [EVM Window Reference](https://docs.qorechain.io/developer-guide/evm-window-reference)
- [Sealed Scouts repo](https://github.com/AaroneGeorge/Sealed-Scouts)
- [Cronos: DIFFICULTY / PREVRANDAO](https://docs.cronos.com/for-dapp-developers/cronos-evm-differences-from-ethereum/evm-opcode-difficulty-prevrandao)
- Earlier Grok conversation: "Continue QoreFeed Project Plan and Schedule"
- [Pyth Entropy protocol design](https://docs.pyth.network/entropy/protocol-design)
- [Quantum Flip repo](https://github.com/andiPangeranm142/quantum-flip)
- [Quantum Dice repo](https://github.com/agusher21/quantum-dice)
- [BANZAI VEGAS repo](https://github.com/agusher21/banzai-vegas-qorechain)
