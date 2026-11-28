# Audit

Sortes is audited with QCAI in two stages, both with the **Ethereum (EVM/Solidity)** setting, as the fest FAQ asks for EVM contracts.

**Status (28 Nov 2026):** both stages are in the repo. Same flatten, same Ethereum (EVM/Solidity) setting. No contract change between the runs.

| Stage | Report | Scope |
| --- | --- | --- |
| Stage 1 | [`docs/audit/qcai-stage1.pdf`](audit/qcai-stage1.pdf) (28 Nov 2026, 08:29; downloaded as `QoreChain_Audit_Sortes_1795850998599.pdf`) | [`Sortes.flat.sol`](audit/Sortes.flat.sol): `contracts/src/` concatenated |
| Stage 2 | [`docs/audit/qcai-stage2.pdf`](audit/qcai-stage2.pdf) (28 Nov 2026, 08:43; downloaded as `QoreChain_Audit_Sortes_1795851809468.pdf`) | Same flatten, after every Stage 1 finding below was answered |

Under the EVM setting QCAI prints "Quantum readiness: Not scored". That is expected: the post-quantum design is explained in the next section instead.

## Post-quantum design (what QCAI does not score under EVM)

Sortes uses only two kinds of cryptography: **keccak256 hashes** for the randomness, and **ML-DSA-87 signatures, verified on chain**, for every action that moves or locks the house's money. No ECDSA signature ever decides a result or moves the bond.

### Where the precompiles are called

Both calls sit in one function, `SortesHouse._requirePqc` (`contracts/src/SortesHouse.sol`):

| Precompile | Address | What the call checks |
| --- | --- | --- |
| `pqcKeyStatus` | `0x…0a02` | The house account has a key registered on chain, and its `algorithmId` is 1 (ML-DSA-87). Otherwise it reverts with `KeyNotRegistered` or `KeyNotProven`. |
| `pqcVerify` | `0x…0a01` | An ML-DSA-87 signature by that registered key over the admin digest. Otherwise it reverts with `BadPqcSignature`. |

The admin digest is domain-separated so a signature works once, for one action, on one contract, on one chain:

```
keccak256(abi.encode("SORTES-ADMIN-v1", action, chainId, address(this), house, keccak256(params), adminNonce))
```

### What each call protects

| Action | Function | Without a valid ML-DSA-87 signature |
| --- | --- | --- |
| Enroll (post the bond, commit the hash-chain anchor) | `enroll` | The house cannot start; nobody can enroll an anchor in its name |
| Withdraw bond | `withdraw` | The bond cannot leave the contract, even with the house's ECDSA key |
| Change payout address | `setPayout` | Fees cannot be redirected |
| New hash chain | `rotateAnchor` | The house cannot swap in a chain it ground for good outcomes |
| Pause or resume | `setAccepting` | The house cannot be frozen or reopened by a key thief |

User-facing actions (`request`, `revealUser`, timeouts, `claimOwed`, `finalize`) need no signature at all: they are checked by hashes against values fixed earlier, so nothing an attacker signs, with any algorithm, can change a result.

### Tests that cover it

All in `contracts/test/SortesHouse.t.sol`; run `forge test` in `contracts/`. Locally the precompiles are mocks (`contracts/test/mocks/PqcMock.sol`); the real path is proven on diana by `npm run test:live` in `house/`, which sends a real ML-DSA-87 signature through diana's `pqcVerify`.

| Property | Tests |
| --- | --- |
| Key must be registered and ML-DSA-87 | `test_enroll_revertsWhenKeyNotRegistered`, `test_enroll_revertsWhenKeyIsNotMlDsa87` |
| Bad signatures revert | `test_enroll_revertsOnBadSignature`, `test_withdraw_badSignature`, `test_setPayout_validAndBad`, `test_setAccepting_badSignature` |
| Signature binds its parameters | `test_enroll_signatureBindsAnchor` |
| No replay (nonce), no cross-deployment use, no cross-action use | `test_withdraw_replayRejected`, `test_enroll_signatureForAnotherDeploymentRejected`, `test_adminSignature_cannotBeUsedForAnotherAction` |
| A thief with only the ECDSA key moves nothing | `test_guarantee5_ecdsaOnlyThiefFails` |
| Valid signatures work | `test_withdraw_withValidSignature`, `test_rotateAnchor_withValidSignature`, `test_setAccepting_pausesAndResumes` |

The same attacks were also sent as real diana transactions (`npm run attacks` in `house/`) and are shown with their transaction hashes on the app's `/attacks` page.

## Stage 1 findings and responses

Stage 1 score **65/100**, risk **HIGH**, 6 findings (2 high, 2 medium, 1 low, 1 info). Quantum readiness: "not scored for this setting". The line numbers in the PDF do not match `SortesHouse.sol` or the flatten (QCAI cited 350/363/373/380 for "admin functions"; those lines are internals `_setChain` / `_acceptChainValue` / `_close`). Each finding was matched by description.

No finding required a contract change. The access control the auditor asked for as `onlyOwner` is the ML-DSA-87 check the Ethereum setting cannot see; the rest are capped loops, checked arithmetic, or OpenZeppelin ERC-721.

| # | Severity | Finding (QCAI wording, short) | Response | Evidence |
| --- | --- | --- | --- | --- |
| 1 | HIGH | Missing access control on critical admin functions | **False positive / by design.** Enroll, withdraw, setPayout, rotateAnchor and setAccepting all call `_requirePqc`: registered ML-DSA-87 key plus `pqcVerify` over a nonce-bound digest. `onlyOwner` would be ECDSA `msg.sender`, which is exactly the key we refuse to trust. The cited lines are internal helpers, not the admin surface. | `test_guarantee5_ecdsaOnlyThiefFails`, `test_withdraw_badSignature`, `test_setPayout_validAndBad`, `test_setAccepting_badSignature`, `test_enroll_revertsOnBadSignature`; live `/attacks` T-07 |
| 2 | HIGH | Potential integer overflow in bond calculation | **False positive.** Solidity 0.8 reverts on overflow. The live check is `bond < (openRequests + 1) * PENALTY` (`request`, line 173). `PENALTY` is 2 QOR; wrapping `openRequests` is not reachable. A low bond reverts `BondTooLow`. | `test_enroll_revertsWhenBondTooLow`; `test_request` path that expects `BondTooLow` |
| 3 | MEDIUM | Unchecked return values from PQC precompile calls | **False positive.** `_requirePqc` requires a successful `staticcall`, a minimum return length, then decodes: missing/empty key → `KeyNotRegistered`; wrong algorithm → `KeyNotProven`; verify false or short data → `BadPqcSignature`. | `test_enroll_revertsWhenKeyNotRegistered`, `test_enroll_revertsWhenKeyIsNotMlDsa87`, `test_enroll_revertsOnBadSignature`; `house` `npm run test:live` |
| 4 | MEDIUM | Front-running in request flow | **By design.** A copied `request` is bound to `beneficiary` + `consumer` in the commitment; a copied `revealHouse` only works with the hash-chain preimage, which anyone may post. Commit-reveal plus lock delay is the protocol. A second commit-reveal would not change who can post the house value. | `test_guarantee1_houseCannotSteer`, `test_guarantee2_userCannotSteer` |
| 5 | LOW | Unbounded loop in chain value acceptance | **False positive.** `_acceptChainValue` walks at most `MAX_SKIP` (32) hashes and reverts `SkipTooFar` otherwise. Longer gaps use `checkpoint`. | `test_revealHouse_revertsOnSkipOver32`, `test_checkpoint_unblocksLongSkip` |
| 6 | INFO | ERC-721 missing optional `supportsInterface` | **False positive.** `SortesMint` is OpenZeppelin `ERC721`, which already implements ERC-165 `supportsInterface`. | OpenZeppelin `ERC721.supportsInterface` |

## Stage 2

Stage 2 score **72/100** (up from 65), risk still **HIGH**, 6 findings: 2 high, 2 medium, 1 low, 1 info. Quantum readiness: "not scored for this setting". The source was unchanged; the auditor's wording moved toward the Stage 1 reading.

| Severity | Finding | Stage 1 | Stage 2 | Assessment |
| --- | --- | --- | --- | --- |
| HIGH | Missing access control on admin functions | asked for `onlyOwner` | now: "additional access control **beyond PQC signatures**" | Same finding. PQC is the access control. Extra ECDSA ownership would let a stolen window key pass. Unchanged. |
| HIGH | Overflow in bond calculation | SafeMath | "explicit overflow checks or SafeMath" | Same finding. Solidity 0.8 already reverts. Unchanged. |
| MEDIUM | Unchecked PQC return values | stricter checks | same | Same finding. `_requirePqc` already checks `ok`, length, and decoded `true`. Unchanged. |
| MEDIUM | Front-running in request flow | "commitment scheme" | "commitment scheme or delay" | Same finding. Commit-reveal plus `LOCK_DELAY` already exists. Unchanged. |
| LOW | Unbounded loop | gas limits | now names `MAX_SKIP` | Same finding, closer to the code: `MAX_SKIP` is 32 and `SkipTooFar` reverts. Unchanged. |
| INFO | ERC-721 `supportsInterface` | add the method | same | Same finding. OpenZeppelin `ERC721` already implements it. Unchanged. |

The executive summary now says ML-DSA signatures "add a layer of security" and then treats relying on them as a risk. That is the EVM setting again: it cannot score `pqcVerify`. The post-quantum design above is the answer. Zero remaining findings is not required; the six repeats are documented, not silent.
