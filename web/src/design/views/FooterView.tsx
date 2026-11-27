/* GENERATED from the Sortes design (Footer.dc.html) by dc2tsx. The markup is the design's;
 * behaviour lives in the component that renders this view. */
import { Fragment } from "react";
import { A } from "@/components/A";
import { css } from "@/lib/css";

import "./css/Footer.css";

export function FooterView({ v }: { v: any }) {
  return (<div className="pg-Footer" style={{ display: "contents" }}><footer className={`ft ${v.th}`}><div className="wrap" style={css("padding-top: 64px; padding-bottom: 36px")}><div className="cols"><div className="brand" style={css("display: flex; flex-direction: column; gap: 16px; max-width: 360px")}><span style={css("display: flex; align-items: center; gap: 10px")}><svg width="30" height="30" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="var(--bandInk)" /><path d="M7 21 V7 H21 V17 H11 V11 H17 V14" fill="none" stroke="#e0703f" strokeWidth="2.2" /></svg><span className="fr" style={css("font-size: 23px; font-weight: 600")}>{"Sortes"}</span></span><p style={css("margin: 0; font-size: 14px; line-height: 1.6; color: var(--bandMut)")}>{"Fair randomness for QoreChain. Hashes and post-quantum signatures only. Testnet for now."}</p><span className="mono" style={css("display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--bandMut)")}><span className="dot" style={css(`background: ${v.chainDot}`)} />{v.chainLine}</span></div>{(v.cols as any[]).map((c, i0) => (<Fragment key={i0}><div><p className="lab" style={css("margin: 0 0 10px; color: var(--bandMut)")}>{c.t}</p>{(c.l as any[]).map((l, i1) => (<Fragment key={i1}><A href={l.h} style={css("display: block")}>{l.t}</A></Fragment>))}</div></Fragment>))}</div><div style={css("display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 56px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,.1); font-size: 13px; color: var(--bandMut)")}><span>{"© 2026 Sortes. Built for Build Before Q-Day."}</span><span className="mono">{v.contractLine}</span></div></div></footer></div>);
}
