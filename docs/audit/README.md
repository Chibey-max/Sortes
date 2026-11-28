# QCAI reports

Paste [`Sortes.flat.sol`](Sortes.flat.sol) into the dashboard Contract Auditor at https://dashboard.qorechain.io/audit. Use the **Ethereum (EVM/Solidity)** setting (the fest FAQ: CosmWasm is the wrong setting for these contracts).

The flatten is `contracts/src/` concatenated in dependency order. OpenZeppelin 5.x stays as imports.

| File | What |
| --- | --- |
| [`qcai-stage1.pdf`](qcai-stage1.pdf) | Stage 1, 28 Nov 2026 08:29 (downloaded as `QoreChain_Audit_Sortes_1795850998599.pdf`). Score 65/100, risk HIGH, 6 findings. |
| [`qcai-stage2.pdf`](qcai-stage2.pdf) | Stage 2, 28 Nov 2026 08:43 (downloaded as `QoreChain_Audit_Sortes_1795851809468.pdf`). Score 72/100, risk HIGH, same 6 findings, wording closer to the code. |

Every finding and the post-quantum design: [`../AUDIT.md`](../AUDIT.md).
