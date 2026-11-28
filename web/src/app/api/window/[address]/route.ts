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
  const url = `${CONFIG.rest}/qorechain/pqc/v1/evm_window/${qor}`;
  let last = "fetch failed";
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      return NextResponse.json({ address: qor, ...(j.window ?? j) }, { status: r.ok ? 200 : 502 });
    } catch (e: any) {
      last = String(e?.cause?.code ?? e?.message ?? e);
      await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
    }
  }
  // Degrade instead of 500: MetaMask mint still works; the window pill just shows unknown.
  return NextResponse.json({ address: qor, found: false, live: false, error: last });
}
