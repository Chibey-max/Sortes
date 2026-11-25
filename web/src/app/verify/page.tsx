"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { verify, type Verification } from "@/lib/verify";
import { STATUS_LABEL } from "@/lib/protocol";
import { NotDeployed } from "@/components/NotDeployed";

function VerifyInner() {
  const q = useSearchParams();
  const [kind, setKind] = useState<"token" | "request">(q.get("request") ? "request" : "token");
  const [id, setId] = useState(q.get("token") ?? q.get("request") ?? "");
  const [res, setRes] = useState<Verification>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(k = kind, v = id) {
    if (!v) return;
    setBusy(true); setErr(undefined); setRes(undefined);
    try {
      setRes(await verify(k === "token" ? { tokenId: BigInt(v) } : { requestId: BigInt(v) }));
    } catch (e: any) {
      setErr(e?.shortMessage ?? e?.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { if (id) void run(); }, []);

  return (
    <>
      <h1>Verify a result</h1>
      <p className="lead">
        Everything below is recomputed in your browser from chain data. Nothing is taken from the contract&apos;s own answer
        or from this site.
      </p>
      <NotDeployed />
      <form className="card" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="token">Lot (token id)</option>
          <option value="request">Request id</option>
        </select>{" "}
        <input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 1" inputMode="numeric" />{" "}
        <button className="btn" disabled={busy || !id}>{busy ? "Checking…" : "Verify"}</button>
      </form>
      {err && <p className="bad">{err}</p>}
      {res && (
        <section className="card">
          <h2>Request #{res.requestId.toString()}{res.tokenId !== undefined ? ` · Lot #${res.tokenId}` : ""} · {STATUS_LABEL[res.status]}</h2>
          <table>
            <tbody>
              {res.checks.map((c, i) => (
                <tr key={c.name}>
                  <td>{i + 1}</td>
                  <td>{c.name}</td>
                  <td className={c.pass === null ? "muted" : c.pass ? "ok" : "bad"}>{c.pass === null ? "n/a" : c.pass ? "pass" : "FAIL"}</td>
                  <td className="small mono">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

export default function VerifyPage() {
  return <Suspense><VerifyInner /></Suspense>;
}
