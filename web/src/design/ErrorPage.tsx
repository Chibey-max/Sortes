"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorPageView } from "./views/ErrorPageView";
import { STILL, frameUrl } from "./frames";
import { publicClient } from "@/lib/chain";
import { CONFIG, isDeployed } from "@/lib/config";
import { useTheme } from "@/lib/theme";
import { useWallet } from "@/lib/wallet";
import { num } from "@/lib/live";
import { useMintStats } from "@/lib/data";

export type ErrorKind = "404" | "offline" | "maintenance" | "crash";

/** 404, "cannot reach QoreChain", "upgrading", and a recoverable runtime-error page. */
export function ErrorPage({ kind = "404", text, reset, active }: {
  kind?: ErrorKind;
  text?: { t1?: string; t2?: string; body?: string };
  reset?: () => void;
  active?: string;
}) {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const router = useRouter();
  const stats = useMintStats().data;
  const [rpc, setRpc] = useState<{ ok: boolean; block?: bigint; checking: boolean }>({ ok: false, checking: true });
  const [left, setLeft] = useState(12);

  useEffect(() => {
    if (kind !== "offline") return;
    let live = true;
    const ping = async () => { try { const b = await publicClient.getBlockNumber(); if (live) setRpc({ ok: true, block: b, checking: false }); } catch { if (live) setRpc((r) => ({ ok: false, block: r.block, checking: false })); } setLeft(12); };
    void ping();
    const t = setInterval(() => setLeft((s) => { if (s <= 1) { void ping(); return 12; } return s - 1; }), 1000);
    return () => { live = false; clearInterval(t); };
  }, [kind]);

  const total = stats ? Number(stats.total) : undefined;
  const K = {
    "404": { code: "404", label: "Not found", tone: "var(--acc)", t1: text?.t1 ?? "This lot was", t2: text?.t2 ?? "never drawn.", body: text?.body ?? `There is no page or lot at this address.${total ? ` Lots are numbered from 1 to ${num(total)} so far, and every one of them is in the gallery.` : ""}`, hasSearch: true, a1: "Open the gallery", h1: "/gallery", a2: "Draw a lot", h2: "/mint", foot: "Followed a broken link from somewhere? The lot number at the end of it is probably still right.", img: frameUrl(STILL.hero), pos: "72% 50%", sc: "1.2", op: "1", gs: "0" },
    offline: { code: rpc.ok ? "OK" : "503", label: rpc.ok ? "Network reachable" : "Network unreachable", tone: rpc.ok ? "var(--ok)" : "var(--warn)", t1: rpc.ok ? "QoreChain" : "We cannot reach", t2: rpc.ok ? "is answering." : "QoreChain.", body: rpc.ok ? "The diana testnet RPC is answering again. You can go back to your draw." : "The diana testnet RPC is not answering. Your draws are safe: every deadline is counted in blocks, so no window closes while the chain is stalled.", hasStatus: true, a1: rpc.ok ? "Back to the app" : "Try again", h1: rpc.ok ? "/" : "/status", a2: "Read about deadlines", h2: "/build#fees", foot: rpc.ok ? "All good." : `Retrying on its own in ${left} seconds.`, img: frameUrl(STILL.blackBall), pos: "62% 32%", sc: "1.35", op: rpc.ok ? "1" : ".55", gs: rpc.ok ? "0" : "1" },
    maintenance: { code: "···", label: "Upgrading", tone: "var(--info)", t1: "Sortes is", t2: "being upgraded.", body: "The site is paused while it is upgraded. Draws already in progress finish on chain as normal, and you can still verify any lot from a terminal.", a1: "Read the build guide", h1: "/build", a2: "See the house status", h2: "/house", foot: "Nothing about the contracts changes in this upgrade.", img: frameUrl(STILL.crank), pos: "72% 72%", sc: "1.4", op: "1", gs: "0" },
    crash: { code: "ERR", label: "Page error", tone: "var(--acc)", t1: text?.t1 ?? "Something broke,", t2: text?.t2 ?? "not your draw.", body: text?.body ?? "The page hit an error. Nothing was sent from your wallet.", hasSearch: false, a1: "Try again", h1: "/mint", a2: "Open the gallery", h2: "/gallery", foot: "A reload also works. Your secret, if you had started a draw, stays in this browser.", img: frameUrl(STILL.hero), pos: "72% 50%", sc: "1.2", op: "1", gs: "0" },
  }[kind] as any;
  const v = {
    ...K, th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label, reset, navActive: active ?? "",
    noop: (e: any) => { e?.preventDefault?.(); const n = new FormData(e.target).get("lot"); if (n) router.push(`/lot/${String(n).replace(/\D/g, "")}`); },
    hasSearch: !!K.hasSearch, hasStatus: !!K.hasStatus,
    status: [
      { k: "diana RPC", v: rpc.checking ? "checking…" : rpc.ok ? "answering" : "no answer", c: rpc.checking ? "var(--warn)" : rpc.ok ? "var(--ok)" : "var(--bad)", p: rpc.ok ? "" : "pulse" },
      { k: "Last block seen", v: rpc.block ? `#${num(rpc.block)}` : "none yet", c: rpc.block ? "var(--ok)" : "var(--warn)", p: "" },
      { k: "Sortes contracts", v: isDeployed ? "unchanged" : "not configured", c: isDeployed ? "var(--ok)" : "var(--warn)", p: "" },
    ].map((s, i) => ({ ...s, b: i ? "1px solid var(--line)" : "0" })),
    alt: "Rendered still of the Sortes allotment machine", chain: CONFIG.evmChainId,
  };
  return <ErrorPageView v={v} />;
}
