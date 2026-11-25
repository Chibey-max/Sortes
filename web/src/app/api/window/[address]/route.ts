import { NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";

/** The diana REST API sends no CORS headers, so the browser reads EVM window status through this
 * one-line proxy. Read-only; accepts only a 0x or qor1 address. */
export async function GET(_req: Request, { params }: { params: { address: string } }) {
  const a = params.address;
  if (!/^(0x[0-9a-fA-F]{40}|qor1[0-9a-z]{38,58})$/.test(a)) return NextResponse.json({ error: "bad address" }, { status: 400 });
  let qor = a;
  if (a.startsWith("0x")) {
    const { toQorAddress } = await import("@/lib/bech32");
    qor = toQorAddress(a);
  }
  const r = await fetch(`${CONFIG.rest}/qorechain/pqc/v1/evm_window/${qor}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json({ address: qor, ...(j.window ?? j) }, { status: r.ok ? 200 : 502 });
}
