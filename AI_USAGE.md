# AI usage

Sortes was built with AI assistance, and the product itself contains no AI.

## Tools

- **Claude (planning chat):** field research on the fest's projects, choosing the idea, the PRD and the day plan (`docs/PRD.md`, `docs/PLAN.md`).
- **Claude Code (cloud session):** day-0 checks against diana, contracts, tests, the house daemon, the web app's logic layer and these docs.
- **Grok:** an earlier idea discussion (QoreFeed), superseded.

## What was checked by hand or against the real chain

- Every claim about diana in the README was measured, not assumed: chain ID, block time, active precompiles, `blockhash` (zero), `prevrandao` (constant), `pqcVerify` with a real ML-DSA-87 signature, and QoreX's EVM limits (from the QoreX integration docs and kit sources).
- The off-chain mirrors (daemon `protocol.ts`, web `protocol.ts`) are tested against the Solidity: digests and commitments against the deployed contract on anvil, traits against vectors generated from the contracts.
- The QoreX `MsgCrossVMCall` encoder is checked byte for byte against `@qorechain/sdk`'s codec.
- The whole stack runs end to end locally in a real browser (`scripts/smoke.mjs`): every page, dark mode, phone width and a full mint through a mocked QoreX.
- The web app's pages were generated from the author's Claude Design canvas by a converter script, then wired to live chain data by hand; the on-chain plate art is generated from the same design's art sheet.
- Design decisions taken by the author after reviewing the AI's findings: keep the lock hash as an optional third input and state a two-party trust model; offer both QoreX (sponsored) and MetaMask (paid) mints; no co-author lines in commits.

## What the author owns

The idea's direction, every product decision above, the web app's visual design, wallet testing with a real QoreX extension, the diana deployment and keys, and the submission.
