# Audit

Sortes is audited with QCAI in two stages, both with the **Ethereum (EVM/Solidity)** setting, as the fest FAQ asks for EVM contracts. The dated reports live in [`docs/audit/`](audit/):

| Stage | Report | Scope |
| --- | --- | --- |
| Stage 1 | `docs/audit/qcai-stage1.pdf` | `contracts/src/` (SortesHouse, SortesMint, SortesRenderer, SortesDice, lib/) |
| Stage 2 | `docs/audit/qcai-stage2.pdf` | Same scope, after every Stage 1 finding below was answered |

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

Each Stage 1 finding gets one row: **fixed** (with the commit and the regression test's name), or **false positive** (with the reason).

| # | Severity | Finding (QCAI wording, short) | Response | Evidence |
| --- | --- | --- | --- | --- |

## Stage 2

Stage 2 was run on the code after the responses above. Remaining items and their status are listed in the Stage 2 report.
