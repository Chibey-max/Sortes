/** The eight attacks of the design (T-01 … T-08) and how each maps to a result of house/src/attacks.ts. */
export interface AttackDef {
  id: string;
  key: string; // name in attacks.json
  title: string;
  try: string;
  res: string; // short result label
  kind: "naive" | "reverted" | "floor";
  why: string;
  test: string; // forge test name
  cmd: string;
}

export const ATTACKS: AttackDef[] = [
  { id: "T-01", key: "prevrandao", title: "Constant block randomness", try: "Use block.prevrandao as the random number.", res: "naive method broken", kind: "naive", test: "RandomnessProbe", cmd: "npm run attacks -- probe",
    why: "On diana block.prevrandao returns the same value in every block, and block hashes read as zero inside contracts, so a game built on them rolls the same number forever. Sortes never uses a block alone: it mixes in a house value and your secret, both fixed before the block existed." },
  { id: "T-02", key: "txhash", title: "Sender grinds the tx hash", try: "Re-sign the transaction until its hash favours you.", res: "naive method broken", kind: "naive", test: "attacks txhash", cmd: "npm run attacks -- txhash",
    why: "A game that rolls from the transaction hash lets the sender sign again and again, changing a gas price by one wei, until the hash wins. Sortes ignores anything the sender can grind: your commitment is fixed first, and the lock block comes after." },
  { id: "T-03", key: "forged-reveal", title: "House posts a forged value", try: "The house reveals a value it did not commit to.", res: "reverted · BadReveal", kind: "reverted", test: "test_guarantee1_houseCannotSteer", cmd: "npm run attacks -- forged-reveal",
    why: "Every house value must hash to the previous link of a chain committed in advance. A forged value cannot." },
  { id: "T-04", key: "silent-house", title: "House goes silent", try: "The house refuses to reveal after seeing a draw it dislikes.", res: "floor + 3 QOR to user", kind: "floor", test: "test_houseTimeout_paysFeePlusPenalty", cmd: "npm run attacks -- silent-house",
    why: "Silence costs the house. After the house window closes you get a floor lot, your 1 QOR back and 2 QOR from the house bond, and anyone can trigger it." },
  { id: "T-05", key: "silent-user", title: "User goes silent", try: "You skip your reveal because you dislike the result you predict.", res: "floor applied", kind: "floor", test: "test_userTimeout_creditsHouse", cmd: "npm run attacks -- silent-user",
    why: "You cannot predict the result before the lock block and the house reveal, and staying silent only gets you floor traits." },
  { id: "T-06", key: "swapped-secret", title: "User swaps the secret", try: "You reveal a different secret after seeing the house value.", res: "reverted · BadSecret", kind: "reverted", test: "test_guarantee2_userCannotSteer", cmd: "npm run attacks -- swapped-secret",
    why: "Your reveal must hash, with your address and the mint contract, to the commitment you sent. A new secret does not." },
  { id: "T-07", key: "ecdsa-thief", title: "Thief with only the ECDSA key", try: "Someone steals the house ECDSA key and tries to move the bond.", res: "reverted · BadPqcSignature", kind: "reverted", test: "test_guarantee5_ecdsaOnlyThiefFails", cmd: "npm run attacks -- thief",
    why: "House money only moves with an ML-DSA-87 signature, which a stolen ECDSA key cannot make, today or after Q-Day. The contract checks it with the pqcVerify precompile." },
  { id: "T-08", key: "replay", title: "Replayed admin signature", try: "Someone resends an old, valid admin signature.", res: "reverted · BadPqcSignature", kind: "reverted", test: "test_withdraw_replayRejected", cmd: "npm run attacks -- replay",
    why: "Every admin action signs a digest that includes a nonce and this contract's address. A signature works once and never again." },
];

export interface AttackResult { name: string; summary: string; tx: string | null; expected: string; observed: string; passed: boolean; at: string; extra?: any }

/** Terminal lines for the attacks page, built from a real result (or an honest "not run yet"). */
export function terminalLines(a: AttackDef, r?: AttackResult): { t: string; c: "g" | "b" | "o" | "m" | "w" }[] {
  if (!r) return [{ t: `$ ${a.cmd}`, c: "w" }, { t: "  not run on this network yet", c: "m" }];
  const lines: { t: string; c: "g" | "b" | "o" | "m" | "w" }[] = [{ t: `[${r.passed ? "PASS" : "FAIL"}] ${r.name}`, c: r.passed ? "g" : "b" }];
  lines.push({ t: `  ${r.summary}`, c: "m" });
  if (a.kind === "reverted") lines.push({ t: `  └─ revert ${r.observed}`, c: "b" });
  else lines.push({ t: `  └─ ${r.observed}`, c: a.kind === "floor" ? "o" : "b" });
  lines.push({ t: `  expected: ${r.expected}`, c: "m" });
  if (r.tx) for (const tx of r.tx.split(",")) lines.push({ t: `  tx ${tx}`, c: "m" });
  lines.push({ t: r.passed ? "1 passed · 0 failed" : "0 passed · 1 failed", c: r.passed ? "g" : "b" });
  return lines;
}
