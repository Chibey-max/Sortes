import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { commitmentOf, deriveTraits, resultFrom, variantName } from "../src/lib/protocol";

// Vectors generated from the Solidity code: contracts/script/dev/Vectors.t.sol
const v = JSON.parse(readFileSync(resolve(__dirname, "vectors.json"), "utf8"));

test("trait derivation and names match the contracts on 40 results", () => {
  for (const t of v.traits) {
    const s = deriveTraits(t.result);
    assert.deepEqual(s.tier, t.tier, t.result);
    assert.deepEqual(s.variant, t.variant, t.result);
    assert.deepEqual(s.tier.map((tier, i) => variantName(i, tier, s.variant[i])), t.names);
  }
});

test("commitment matches SortesHouse.commitmentOf", () => {
  const c = v.commit;
  assert.equal(commitmentOf(c.secret, c.beneficiary, c.consumer, BigInt(v.chainId)), c.commit);
});

test("result matches SortesHouse.resultFrom", () => {
  const r = v.result;
  assert.equal(resultFrom(r.houseValue, r.secret, r.lockHash, BigInt(r.id), v.house, BigInt(v.chainId)), r.result);
});

test("bech32 qor1 encoding matches @qorechain/evm toQorAddress", async () => {
  const { toQorAddress } = await import("../src/lib/bech32");
  assert.equal(toQorAddress("0x9858EfFD232B4033E47d90003D41EC34EcaEda94"), "qor1npvwllfr9dqr8erajqqr6s0vxnk2ak55am9g2c");
});

test("MsgCrossVMCall encoder matches the bytes verified against @qorechain/sdk", async () => {
  const { encodeCrossVmCall } = await import("../src/lib/qorex");
  const hex = Buffer.from(encodeCrossVmCall("qor19rl4cm2hmr8afy4kldpxz3fka4jguq0agt672h", "0x0000000000000000000000000000000000000C01", "0x0266319d")).toString("hex");
  assert.equal(hex, "0a2a716f723139726c34636d32686d7238616679346b6c6470787a33666b61346a67757130616774363732681208636f736d7761736d1a0365766d222a3078303030303030303030303030303030303030303030303030303030303030303030303030304330312a040266319d");
});
