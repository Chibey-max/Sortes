# Sortes threat model

Scope: `SortesHouse`, `SortesMint`, `SortesDice`, the house daemon and the web app on `qorechain-diana`. Assets: the fairness of each result, the house bond and earned fees, users' fees and stakes.

## Parties and what each can do

| Party | Controls | Cannot |
| --- | --- | --- |
| House operator | its hash chain (fixed at enrollment), when it reveals, its keys | change a chain value, see a secret before revealing, move money without ML-DSA-87 |
| User | its secret (committed first), whether it reveals | change the secret after committing, re-roll |
| Sender of any transaction | its tx hash, gas, timing | influence any result input (tx hashes are not inputs) |
| Validator / proposer | block contents and order; the lock block's hash where the chain exposes it | see the secret or a future house value |
| Thief with the house's ECDSA key | EVM transactions inside the house's open window | pass `pqcVerify` |
| Quantum adversary (Shor) | forge ECDSA/BLS signatures, break pairings | invert keccak256 or forge ML-DSA-87 |
| Quantum adversary (Grover) | ~square-root speed-up on preimages | find a 256-bit keccak preimage (~2^128 work) |

## Inputs to a result

`result = keccak256("SORTES-RESULT-v1", houseValue, secret, lockHash, requestId, house, chainId)`

- `houseValue = v[p] = h[N−p]`, with `h[i] = keccak256(h[i−1])` and anchor `h[N]` on chain from enrollment. Position `p` is assigned at request time. Only assigned positions can ever be revealed (`checkpoint` refuses `p ≥ nextPosition`), so the value for any future request stays secret.
- `secret`: 32 random bytes from `crypto.getRandomValues`, committed as `keccak256("SORTES-COMMIT-v1", secret, beneficiary, consumer, chainId)`. Binding the beneficiary and the consumer contract stops a commitment being reused for another user or app.
- `lockHash = blockhash(requestBlock + 2)`, read when the house reveals. **On diana this is zero** (contracts get no block hashes; measured day 0), so on diana the result has two independent inputs.

## Collusion analysis

| Who colludes | Can they choose a result? | Why |
| --- | --- | --- |
| House alone | No | Its value is fixed by the anchor; it reveals without knowing the secret; a wrong value reverts `BadReveal`. Withholding gives the floor and costs it a 2 QOR penalty (`HouseTimedOut`). |
| User alone | No | The secret is committed before the house value is known; a different secret reverts `BadSecret`. Withholding gives the floor (`UserTimedOut`). |
| House + user | **Yes, on diana** | The house can tell the user `v[p]` in advance; the user grinds secrets offline until the result is rare, then commits. With a non-zero lock hash they would also need the proposer of the lock block. |
| House + validator | No | Neither knows the secret. |
| User + validator | No | Neither knows the house value before committing. |

This is the honest limit of any two-party commit-reveal: the scheme protects each party from the other, not the two of them from a third party who trusts neither. For Sortes Lots the "third party" is other collectors, so the house's incentive matters: it is a bonded, public operator whose every reveal is checkable on `/verify`, and a pattern of suspiciously rare lots for one wallet would be visible on chain. The README states this plainly rather than claiming more.

## Threat table

| Attacker | Attempt | Defence | Outcome | Test / demo |
| --- | --- | --- | --- | --- |
| House | Post a fake value | Hash-chain check from the checkpoint | `BadReveal` | `test_guarantee1_houseCannotSteer`, `/attacks` #3 |
| House | Reveal a value for a future position early | `checkpoint` only accepts assigned positions | `BadParams` | `test_checkpoint_cannotRevealUnassignedPosition` |
| House | Stay silent to avoid a bad outcome | It doesn't know the outcome; silence = floor + penalty | `HouseTimedOut` | `test_houseTimeout_paysFeePlusPenalty`, `/attacks` #4 |
| House + buyer | Stay silent until the result is rare | Silence = floor, never a re-roll | `HouseTimedOut` | `test_guarantee3_silenceGivesFloor` |
| User | Swap the secret after seeing the house value | Commitment check | `BadSecret` | `test_guarantee2_userCannotSteer`, `/attacks` #6 |
| User | Reuse a commitment for another wallet or app | Beneficiary and consumer are in the commitment | `BadSecret` | `test_revealUser_secretBoundTo{Beneficiary,Consumer}` |
| User | Stay silent after seeing a bad result | Floor result | `UserTimedOut` | `test_userTimeout_creditsHouse`, `/attacks` #5 |
| Sender | Grind the tx hash | Tx hash is not an input | n/a | `/attacks` #2 shows the attack on naive apps |
| Anyone | Rely on `prevrandao` / `blockhash` | Not used as sole entropy | n/a | `/attacks` #1 (`RandomnessProbe`) |
| ECDSA-only thief in an open window | Withdraw, change payout, rotate anchor, pause | `pqcVerify` against the key from `pqcKeyStatus` | `BadPqcSignature` | `test_guarantee5_ecdsaOnlyThiefFails`, `/attacks` #7 |
| Replayer | Reuse an old admin signature | Digest binds action, chain, contract, house, params hash, `adminNonce` | `BadPqcSignature` | `test_withdraw_replayRejected`, `test_enroll_signatureForAnotherDeploymentRejected`, `/attacks` #8 |
| Anyone | Re-enter during a payout | `ReentrancyGuard`, checks-effects-interactions, 50k gas stipend on pushes | revert | invariant suite |
| Beneficiary contract | Revert on refund to block a timeout | Push falls back to `owed[]` + `claimOwed` | settles anyway | `test_houseTimeout_refundToRejectingContractIsOwedNotStuck` |
| House | Under-bond and accept more requests than it can pay penalties for | `request` requires `bond ≥ (open+1) × PENALTY`; `withdraw` keeps that cover | `BondTooLow` | `test_request_revertsWhenBondCannotCoverPenalties`, `test_withdraw_blockedBelowCover` |
| Griefer | Open >32 requests and time them out so later reveals exceed `MAX_SKIP` | `checkpoint` advances the chain over finished positions | reveals continue | `test_checkpoint_unblocksLongSkip` |
| Sponsor-pool farmer | Drain the QoreX sponsor pool | 3 sponsored mints per address; pool is topped up deliberately | `SponsorLimit` / `PoolEmpty` | `test_mintSponsored_*` |
| Relay operator (the house) | Misuse a secret posted to `/reveal` | Accepted only after the house reveal (value already fixed) and only if it matches the commitment | nothing to gain | house e2e test 5 |

## Post-quantum notes

- **Trust path:** keccak256 (results, commitments, hash chain) and ML-DSA-87 (all house money actions, enrollment). No ECDSA, BLS, VRF or pairing in it.
- **ECDSA still exists** at the transaction layer (EVM signatures), which is why the house's money is gated by ML-DSA-87 regardless of who sends the transaction, and why the daemon's EVM window is scoped to the house and mint contracts only.
- **Signed message:** `keccak256(abi.encode("SORTES-ADMIN-v1", action, chainId, contract, house, keccak256(params), adminNonce))`, 32 bytes passed raw to `pqcVerify` (FIPS-204, empty context). Verified on diana with a real `@qorechain/pqc` signature (`house/test/live/pqc-sig.live.ts`).
- **Key status:** `pqcKeyStatus` has no possession flag on the EVM side; the `pqcVerify` check over the enroll digest is itself the proof of possession.

## Residual risks

- House + buyer collusion on diana (above).
- The secret lives in browser storage between commit and reveal; losing it gives the floor (warned before minting; backup download offered).
- The daemon is a liveness dependency, not a safety one: if it stops, requests time out in the users' favour.
- QoreX cross-VM into EVM is documented by QoreChain as "not yet tested against the live network"; the MetaMask path is the fallback.
