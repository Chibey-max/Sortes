# sortes-house

The house daemon and admin CLI. It holds the hash chain and the ML-DSA-87 key, reveals every request, keeps a scoped EVM window open, relays users' reveals, and finalizes mint lots.

```bash
npm ci
npm run cli -- help
```

| Command | Does |
| --- | --- |
| `keystore-new` / `keystore-import` | create the encrypted keystore (scrypt + AES-256-GCM, file 0600) |
| `address` | qor1 / 0x of the house and its PQC key status |
| `register-key` | register the ML-DSA-87 key on the native lane, with proof of possession |
| `open-window [--deploy B T Q]` | scoped window (house + mint), or a short unscoped one for deploys |
| `deploy` | deploy House, Renderer, Mint, Dice and Probe from the house account; writes `data/deployment.json` |
| `sponsor <qor>` | top up the mint's sponsor pool for QoreX mints |
| `init [--n 10000]` | draw a seed, write `data/chain.json` (0600), print the anchor |
| `enroll [--bond 200]` | post anchor + bond, ML-DSA-87-signed |
| `run` | reveal loop, window keeper, `GET /health`, `POST /reveal` |
| `withdraw`, `set-payout`, `pause`, `resume`, `rotate` | admin actions, each ML-DSA-87-signed; the CLI checks its digest against the contract's `adminDigest` first |
| `npm run attacks -- <name|all>` | send the attack-page attacks as real transactions; results in `data/attacks.json` |

Environment: `SORTES_HOUSE_CONTRACT`, `SORTES_MINT_CONTRACT`, `SORTES_KEY_PASSWORD`, `SORTES_DATA_DIR` (`./data`), `SORTES_EVM_RPC`, `SORTES_REST`, `SORTES_COMET_RPC`, `SORTES_HEALTH_PORT` (8787). Window size: `SORTES_WINDOW_BLOCKS`, `SORTES_WINDOW_MAX_TXS`, `SORTES_WINDOW_MAX_VALUE_UQOR`.

**Restart safety:** the daemon keeps the lowest request id it may still owe work to in `data/state.json` and rescans from there, so a crash never skips a request (tested by killing it mid-run).

**Relay safety:** `POST /reveal` accepts a secret only once the house has revealed (its value is fixed) and only if it matches the on-chain commitment.

Tests: `npm test` (5 end-to-end tests on anvil, PQC precompiles mocked), `npm run test:live` (a real ML-DSA-87 signature from the daemon's key through diana's `pqcVerify`).
