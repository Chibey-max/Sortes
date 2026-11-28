# QCAI reports

Paste [`Sortes.flat.sol`](Sortes.flat.sol) into the dashboard Contract Auditor at https://dashboard.qorechain.io/audit. Use the **Ethereum (EVM/Solidity)** setting (the fest FAQ: CosmWasm is the wrong setting for these contracts).

The flatten is `contracts/src/` concatenated in dependency order. OpenZeppelin 5.x stays as imports.

Dated PDFs (export from the auditor after each run):

- `qcai-stage1.pdf`: first run
- `qcai-stage2.pdf`: second run, after every Stage 1 finding is answered in [`../AUDIT.md`](../AUDIT.md)

Those PDFs are not in the repo until both runs have been exported from a signed-in dashboard session. Do not invent them.
