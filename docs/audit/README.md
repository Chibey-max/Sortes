# QCAI reports

Paste [`Sortes.flat.sol`](Sortes.flat.sol) into the dashboard Contract Auditor at https://dashboard.qorechain.io/audit. Use the **Ethereum (EVM/Solidity)** setting (the fest FAQ: CosmWasm is the wrong setting for these contracts).

The flatten is `contracts/src/` concatenated in dependency order. OpenZeppelin 5.x stays as imports.

| File | What |
| --- | --- |
| [`qcai-stage1.pdf`](qcai-stage1.pdf) | Stage 1, 28 Nov 2026 08:29 (downloaded as `QoreChain_Audit_Sortes_1795850998599.pdf`). Score 65/100, risk HIGH, 6 findings. Responses in [`../AUDIT.md`](../AUDIT.md). |
| `qcai-stage2.pdf` | Stage 2: same flatten and setting, after every Stage 1 finding was answered. Not exported yet. |
