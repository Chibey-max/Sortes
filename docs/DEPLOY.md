# Deploying Sortes to qorechain-diana

Everything below runs on your always-on server (the house) except the web app (Vercel). Keys never go in the repo or in committed files.

## 0. Tools

Foundry, Node 20+, then:

```bash
cd contracts && npm ci && forge build && ./export-abi.sh
cd ../house && npm ci
cd ../web && npm ci
```

## 1. House account

```bash
cd house
export SORTES_KEY_PASSWORD='a long password from your password manager'
npm run cli -- keystore-new        # prints the mnemonic ONCE: write it down offline
npm run cli -- address             # qor1… and 0x… of the house
```

Fund the `qor1…` address from the [faucet](https://docs.qorechain.io/dashboard/faucet) with at least 320 QOR (200 bond, 50+ sponsor pool, deploys and gas).

```bash
npm run cli -- register-key        # registers the ML-DSA-87 key with a proof of possession
npm run cli -- open-window --deploy 900 12 320  # short unscoped window: 900 blocks, 12 txs, 320 QOR
                                                # (the cap counts value too: 200 bond + deploy gas)
```

## 2. Contracts

The house account deploys everything (it is eth-native, so the key in the keystore signs EVM transactions too; nothing is exported):

```bash
npm run cli -- deploy              # House, Renderer, Mint, Dice, Probe; writes data/deployment.json
```

Note the printed addresses and transaction hashes.

## 3. Enroll and run the daemon

```bash
export SORTES_HOUSE_CONTRACT=0x…  SORTES_MINT_CONTRACT=0x…
npm run cli -- init                 # draws the seed, writes data/chain.json (0600)
npm run cli -- enroll --bond 200    # ML-DSA-87-signed; prints the tx hash (put it in the README)
npm run build
SORTES_KEY_PASSWORD=… pm2 start dist/cli.js --name sortes-house -- run
curl localhost:8787/health
```

The daemon opens and renews its own window, scoped to the house and mint contracts only. Put `/health` and `/reveal` behind HTTPS (e.g. Caddy) and use that URL as `NEXT_PUBLIC_DAEMON_URL`.

Fund the QoreX sponsor pool (1 QOR per sponsored mint): `npm run cli -- sponsor 50`. Use the call, not a native bank transfer: a bank send raises the contract's balance without updating `sponsorPool`.

## 4. Web app

Set the variables from `web/.env.example` in Vercel, deploy `web/`.

## 5. Attacks and checks

```bash
cd house
SORTES_PROBE_CONTRACT=0x… npm run attacks -- all
cp data/attacks.json ../web/public/attacks.json    # or set SORTES_ATTACKS_JSON at build
```

Then mint once from a second wallet end to end, open `/verify` for it, and fill the addresses in the README.
