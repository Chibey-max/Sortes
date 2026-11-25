"use client";

import { useEffect, useState } from "react";
import { txUrl } from "@/lib/config";

interface Result { name: string; summary: string; tx: string | null; expected: string; observed: string; passed: boolean; at: string; extra?: any }

/** Fixed order and one-line explanations; results come from house/src/attacks.ts (public/attacks.json). */
const ATTACKS: { name: string; title: string; why: string; script: string }[] = [
  { name: "prevrandao", title: "block.prevrandao is a constant", why: "On diana every block returns the same prevrandao, so any app rolling from it rolls the same number.", script: "attacks probe" },
  { name: "txhash", title: "Transaction-hash randomness is chosen by the sender", why: "The sender knows the hash before sending and re-signs until it wins.", script: "attacks txhash" },
  { name: "forged-reveal", title: "Forged house reveal", why: "The house's values are fixed by its hash chain; any other value fails the chain check.", script: "attacks forged-reveal" },
  { name: "silent-house", title: "Silent house", why: "A house that refuses to reveal gives the floor result and pays the user fee + penalty.", script: "attacks silent-house" },
  { name: "silent-user", title: "Silent user after a bad result", why: "A user who sees a bad outcome and walks away gets the floor, never a re-roll.", script: "attacks silent-user" },
  { name: "swapped-secret", title: "Swapped secret", why: "The secret was committed before anything else was known; another secret fails the commitment.", script: "attacks swapped-secret" },
  { name: "ecdsa-thief", title: "ECDSA-only thief in an open window", why: "Every money action needs a fresh ML-DSA-87 signature, which an ECDSA key cannot make.", script: "attacks thief" },
  { name: "replay", title: "Replayed admin signature", why: "The signed digest includes a nonce and this contract's address, so a used signature is dead.", script: "attacks replay" },
];

export default function Attacks() {
  const [results, setResults] = useState<Record<string, Result>>({});
  useEffect(() => {
    fetch("/attacks.json").then((r) => (r.ok ? r.json() : [])).then((list: Result[]) => setResults(Object.fromEntries(list.map((x) => [x.name, x])))).catch(() => {});
  }, []);
  return (
    <>
      <h1>Attacks</h1>
      <p className="lead">
        Each attack below was sent as a real transaction on QoreChain diana and hit the error shown. Run them yourself
        with <span className="mono">npm run attacks -- &lt;name&gt;</span> in <span className="mono">house/</span>.
      </p>
      {ATTACKS.map((a, i) => {
        const r = results[a.name];
        return (
          <section key={a.name} className="card">
            <h2>{i + 1}. {a.title}</h2>
            <p className="small">{a.why}</p>
            {r ? (
              <table className="small">
                <tbody>
                  <tr><td>Expected</td><td>{r.expected}</td></tr>
                  <tr><td>Observed</td><td className={r.passed ? "ok" : "bad"}>{r.observed}</td></tr>
                  {r.tx && (
                    <tr><td>Transaction</td><td>{r.tx.split(",").map((t) => <div key={t}><a className="mono" href={txUrl(t)} target="_blank" rel="noreferrer">{t}</a></div>)}</td></tr>
                  )}
                  <tr><td>Run</td><td className="mono">{a.script}</td></tr>
                </tbody>
              </table>
            ) : (
              <p className="small muted">Not run on diana yet.</p>
            )}
          </section>
        );
      })}
    </>
  );
}
