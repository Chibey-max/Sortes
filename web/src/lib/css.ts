import type { CSSProperties } from "react";

/** Turns the design's inline style strings ("display: flex; gap: 8px") into a React style object. */
export function css(input: string): CSSProperties {
  const out: Record<string, string> = {};
  let depth = 0, cur = "";
  const decls: string[] = [];
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) { decls.push(cur); cur = ""; } else cur += ch;
  }
  decls.push(cur);
  for (const d of decls) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const prop = d.slice(0, i).trim();
    const val = d.slice(i + 1).trim();
    if (!prop || !val) continue;
    const key = prop.startsWith("--") ? prop : prop.replace(/^-(\w)/, (_, c) => c.toUpperCase()).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = val;
  }
  return out as CSSProperties;
}
