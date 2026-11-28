import { NextResponse } from "next/server";
import { CONFIG } from "@/lib/config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Same-origin JSON-RPC proxy. The diana RPC flakes and has no CORS; the browser talks here. */
export async function POST(req: Request) {
  const body = await req.text();
  let last = "RPC unavailable";
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(CONFIG.evmRpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (r.status === 429 || r.status >= 500) {
        last = `HTTP ${r.status}`;
        await sleep(350 * 2 ** i);
        continue;
      }
      const text = await r.text();
      return new NextResponse(text, { status: r.ok ? 200 : r.status, headers: { "content-type": "application/json" } });
    } catch (e: any) {
      last = String(e?.cause?.code ?? e?.message ?? e);
      await sleep(350 * 2 ** i);
    }
  }
  return NextResponse.json({ jsonrpc: "2.0", error: { code: -32000, message: last } }, { status: 502 });
}
