// Copies contract ABIs (contracts/abi) and, if present, the attack results from the house
// daemon (SORTES_ATTACKS_JSON, default ../house/data/attacks.json) into the web app.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const abiSrc = resolve(root, "../contracts/abi");
const abiDst = resolve(root, "src/abi");
mkdirSync(abiDst, { recursive: true });
if (existsSync(abiSrc)) {
  for (const f of readdirSync(abiSrc)) cpSync(resolve(abiSrc, f), resolve(abiDst, f));
} else if (!existsSync(resolve(abiDst, "SortesMint.json"))) {
  throw new Error("contracts/abi missing and web/src/abi is empty");
}
const attacks = process.env.SORTES_ATTACKS_JSON ?? resolve(root, "../house/data/attacks.json");
if (existsSync(attacks)) cpSync(attacks, resolve(root, "public/attacks.json"));
console.log("synced ABIs" + (existsSync(attacks) ? " and attacks.json" : ""));
