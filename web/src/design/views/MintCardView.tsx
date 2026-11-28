/* Derived from the Sortes design (MintCard.dc.html). Unlike the other views this one is maintained by
 * hand: the design's single "Commit and pay" button became a choice of two wallets, and every value
 * on it is live. Markup and classes are the design's. */
import { Fragment } from "react";
import { A } from "@/components/A";
import { css } from "@/lib/css";
import { LotArt } from "@/design/LotArt";
import "./css/MintCard.css";

export function MintCardView({ v }: { v: any }) {
  return (
    <div className="pg-MintCard" style={{ display: "contents" }}>
      <div className={`pg ${v.th}`} style={css("background: transparent")}>
        <section className="card mc" aria-label="Draw a lot" style={css("padding: clamp(18px, 4cqw, 28px); display: flex; flex-direction: column; gap: 20px; box-sizing: border-box")}>
          <div style={css("display: flex; justify-content: space-between; align-items: center; gap: 10px")}>
            <span className="lab">Draw a lot</span>
            <span className="chip"><span className="dot" style={css("background: var(--acc)")} />{v.chip}</span>
          </div>
          <div>
            <div className="stp">{(v.steps as any[]).map((s, i) => <span key={i} className={s.c} />)}</div>
            <div className="sl">{(v.steps as any[]).map((s, i) => <b key={i} className={s.c}>{s.t}</b>)}</div>
          </div>

          {v.hasErr && (
            <div className={`alert ${v.errCls}`} role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={css("flex: none; margin-top: 1px")}><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>
              <span><b style={css("display: block; margin-bottom: 2px")}>{v.errT}</b>{v.errD}</span>
            </div>
          )}

          {v.isConnect && (
            <div style={css("display: flex; flex-direction: column; gap: 14px")}>
              <p className="h3">Connect your wallet <span className="it">to draw.</span></p>
              <p className="small" style={css("margin: 0")}>Sortes runs on the QoreChain diana testnet. With QoreX the draw is free and takes one approval. With MetaMask a draw costs 1 QOR and needs an open EVM window.</p>
              <button className="btn btn-p btn-w" onClick={v.connectQorex} disabled={v.busy}>{v.busy ? "Connecting…" : "Connect QoreX"}</button>
              <button className="btn btn-g btn-w" onClick={v.connectMetaMask} disabled={v.busy}>Connect MetaMask</button>
              <A className="small" href="/build#contracts" style={css("text-align: center")}>No test QOR yet? Read how to get some</A>
            </div>
          )}

          {v.isReady && (
            <div style={css("display: flex; flex-direction: column; gap: 14px")}>
              <div role="group" aria-label="How to pay" style={css("display: grid; grid-template-columns: 1fr 1fr; gap: 8px")}>
                {(v.pathTabs as any[]).map((t, i) => (
                  <button key={i} className="tab" aria-pressed={t.on} onClick={t.go} style={css("height: 44px")}>{t.t}</button>
                ))}
              </div>
              <div>{(v.rows as any[]).map((r, i) => (<div key={i} className="kv"><span>{r.k}</span>{r.b ? <b className="mono">{r.v}</b> : <span className="mono">{r.v}</span>}</div>))}</div>
              {v.faucetWarn && (
                <div className="alert warn" role="status"><span><b style={css("display: block; margin-bottom: 2px")}>This account has 0 QOR.</b>Open the <a href={v.faucetUrl} target="_blank" rel="noreferrer">QoreChain faucet</a>, paste <span className="mono">{v.faucetQor}</span> (same 20 bytes as this MetaMask account), claim test QOR, then come back. In MetaMask, click Connect for this site if it still says not connected.</span></div>
              )}
              {v.windowWarn && (
                <div className="alert warn" role="status"><span><b style={css("display: block; margin-bottom: 2px")}>No open EVM window.</b>MetaMask cannot open it. In QoreX, select the Ethereum account that matches this MetaMask 0x (add it from the same phrase if you only see a native key). Then switch to QoreX · free and press Draw — that path opens a one-shot window.</span></div>
              )}
              <div className="well" style={css("padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px")}>
                <span><span className="lab" style={css("display: block; margin-bottom: 6px")}>Your secret · kept in this browser</span><span className="mono" style={css("font-size: 14px")}>{v.secretMask}</span></span>
                <button className="btn btn-g btn-s" onClick={v.newSecret} aria-label="Make a new secret">New</button>
              </div>
              <button className="btn btn-p btn-w" onClick={v.start} aria-disabled={v.blocked} disabled={v.blocked === "true"}>{v.cta}</button>
              <p className="small" style={css("margin: 0; text-align: center")}>{v.readyNote}</p>
            </div>
          )}

          {v.isSigning && (
            <div style={css("display: flex; flex-direction: column; gap: 14px")}>
              <p className="h3" style={css("display: flex; align-items: center; gap: 12px")}>
                <svg className="spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>{v.waitTitle}
              </p>
              <div className="well" style={css("padding: 6px 16px")}>
                <div className="kv" style={css("border: 0")}><span>Method</span><span className="mono">{v.method}</span></div>
                <div className="kv"><span>Commitment</span><span className="mono">{v.commitShort}</span></div>
                <div className="kv"><span>Value</span><span className="mono">{v.valueLabel}</span></div>
              </div>
              <p className="small" style={css("margin: 0")}>{v.waitNote}</p>
            </div>
          )}

          {v.isCommitted && (
            <div style={css("display: flex; flex-direction: column; gap: 14px")}>
              <div className="alert ok">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" style={css("flex: none")}><path d="M5 12l5 5 9-10" /></svg>
                <span>{v.commitLine}<b className="mono">{v.commitBlock}</b></span>
              </div>
              {v.hasRequest && (
                <div>
                  <div style={css("display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 8px")}>
                    <span>Lock block <span className="mono">{v.lockBlock}</span></span>
                    <span className="mono" style={css("color: var(--mut)")}>{v.minedLabel}</span>
                  </div>
                  <div style={css("display: grid; grid-template-columns: 1fr 1fr; gap: 6px")}>
                    {(v.lockBars as any[]).map((b, i) => <span key={i} className={b.pulse ? "pulse" : undefined} style={css(`height: 8px; border-radius: 4px; background: ${b.on ? "var(--acc)" : "var(--line2)"}`)} />)}
                  </div>
                </div>
              )}
              <p className="small" style={css("margin: 0")}>{v.lockNote}</p>
              <p className="small" style={css("margin: 0; text-align: center")}>Your secret is saved in this browser. You can close this tab and come back.</p>
              <button className="btn btn-g btn-s" onClick={v.backup}>Download a backup of your secret</button>
            </div>
          )}

          {v.isRevealing && (
            <div style={css("display: flex; flex-direction: column; gap: 14px")}>
              <p className="h3">{v.revealTitle} <span className="it">{v.revealTitleIt}</span></p>
              <div>
                <div className="kv"><span>House link #{v.position}</span><span className="mono" style={css("color: var(--ok)")}>{v.houseValueShort} · valid</span></div>
                <div className="kv"><span>Lock block hash</span><span className="mono">{v.lockHashLabel}</span></div>
                <div className="kv"><span>Reveal window</span><span className="mono" style={css("color: var(--warn)")}>{v.windowLeft}</span></div>
              </div>
              <p className="small" style={css("margin: 0")}>{v.revealStatus}</p>
              <button className="btn btn-p btn-w" onClick={v.reveal} disabled={v.revealDisabled}>{v.revealCta}</button>
              <p className="small" style={css("margin: 0; text-align: center")}>If you stay silent past the window, you still get a lot with floor traits.</p>
            </div>
          )}

          {v.isDrawn && (
            <div style={css("display: flex; flex-direction: column; gap: 16px")}>
              <div style={css("display: grid; grid-template-columns: 112px 1fr; gap: 16px; align-items: center")}>
                <span style={css("display: block; border-radius: 14px; overflow: hidden")}>
                  <LotArt field={v.art.field} glyph={v.art.glyph} engraving={v.art.engraving} seal={v.art.seal} aura={v.art.aura} label={v.art.label} n={v.art.n} />
                </span>
                <span>
                  <span className="lab" style={css(`color: ${v.tierColor}`)}>{v.tierLabel}</span>
                  <span className="h3" style={css("display: block; margin-top: 6px")}>Lot #{v.art.n} <span className="it">{v.drawnIt}</span></span>
                  <span className="small" style={css("display: block; margin-top: 6px")}>{v.checksLabel}</span>
                </span>
              </div>
              {v.floorNote && <div className="alert warn" role="status"><span>{v.floorNote}</span></div>}
              <p className="small" style={css("margin: 0")}>This is an NFT on diana. The lot page shows every trait and the on-chain proof. Verify re-runs the math in this browser. The gallery lists every plate that has been drawn.</p>
              <div style={css("display: grid; grid-template-columns: 1fr 1fr; gap: 8px")}>
                <A className="btn btn-p" href={`/lot/${v.art.n}`}>View the lot</A>
                <A className="btn btn-g" href={`/verify?token=${v.art.n}`}>Verify the math</A>
              </div>
              <button className="btn btn-g btn-w" onClick={v.again}>Draw another</button>
            </div>
          )}

          {v.hasErr && v.errAction && (
            <button className="btn btn-g btn-w" onClick={v.errAction.go}>{v.errAction.t}</button>
          )}
        </section>
      </div>
    </div>
  );
}
