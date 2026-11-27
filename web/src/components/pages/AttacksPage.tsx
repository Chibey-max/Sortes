"use client";

import { useEffect, useState } from "react";
import { AttacksView } from "@/design/views/AttacksView";
import { ATTACKS, terminalLines, type AttackResult } from "@/lib/attacks";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import { useWallet } from "@/lib/wallet";

const COLOR = { g: "#8cc27a", b: "#f07a6e", o: "#e2ad5c", m: "#b4b2ad", w: "#f2f0eb" };

export function AttacksPage() {
  const { theme, setTheme } = useTheme();
  const wallet = useWallet();
  const toast = useToast();
  const [sel, setSel] = useState(2);
  const [results, setResults] = useState<Record<string, AttackResult>>({});
  useEffect(() => { fetch("/attacks.json").then((r) => (r.ok ? r.json() : [])).then((l: AttackResult[]) => setResults(Object.fromEntries(l.map((x: AttackResult) => [x.name, x])))).catch(() => {}); }, []);
  const R = "var(--bad)", O = "var(--warn)", G = "var(--mut)";
  const colorOf = (k: string) => (k === "reverted" ? R : k === "floor" ? O : G);
  const a = ATTACKS[sel];
  const ran = ATTACKS.filter((x) => results[x.key]?.passed).length;
  const v = {
    th: theme, isDark: theme === "dark", setTheme, wallet: wallet.label,
    legend: [
      [String(ATTACKS.filter((x) => x.kind === "reverted").length), "Reverted", "The chain rejects the attempt outright.", R],
      [String(ATTACKS.filter((x) => x.kind === "floor").length), "Made whole", "Silence is allowed but costs the silent side.", O],
      [String(ATTACKS.filter((x) => x.kind === "naive").length), "Naive baselines", `Methods Sortes avoids, shown failing. ${ran} of 8 have a recorded run.`, G],
    ].map((l) => ({ n: l[0], t: l[1], d: l[2], c: l[3] })),
    list: ATTACKS.map((x, i) => ({ id: x.id, t: x.title, try: x.try, res: x.res, c: colorOf(x.kind), on: i === sel ? "true" : "false", go: () => setSel(i) })),
    sel: { id: a.id, head: results[a.key] ? `recorded run · ${new Date(results[a.key].at).toISOString().slice(0, 10)}` : a.cmd, why: a.why, out: terminalLines(a, results[a.key]).map((o) => ({ t: o.t, c: COLOR[o.c] })) },
    copy: () => { void navigator.clipboard?.writeText(`cd house && ${a.cmd}`).then(() => toast.push({ c: "var(--ok)", t: "Command copied", d: `Run it in house/ on the machine that holds the house key.` })); },
  };
  return <AttacksView v={v} />;
}
