"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Address } from "viem";
import { CONFIG } from "./config";
import { connectQorex as qorexConnect, flattenErr, getQorexNative, HOW_TO_SWITCH_DIANA, type QorexAccount } from "./qorex";
import { short } from "./live";

type Kind = "qorex" | "evm" | null;
export type WalletError = null | "no-qorex" | "no-metamask" | "rejected" | "network";

interface WalletCtx {
  kind: Kind;
  address?: Address;
  /** MetaMask 0x, kept even while QoreX is also connected. */
  evmAddress?: Address;
  label: string;
  qorex?: QorexAccount;
  evmChainOk: boolean;
  busy: boolean;
  error: WalletError;
  clearError(): void;
  connectQorex(): Promise<QorexAccount | undefined>;
  connectEvm(): Promise<void>;
  switchToDiana(): Promise<void>;
  disconnect(): void;
}

const Ctx = createContext<WalletCtx>({
  kind: null, label: "", evmChainOk: true, busy: false, error: null, clearError() {},
  async connectQorex() { return undefined; }, async connectEvm() {}, async switchToDiana() {}, disconnect() {},
});
const KEY = "sortes:wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const acct = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [qorex, setQorex] = useState<QorexAccount>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WalletError>(null);

  // Silently restore a QoreX connection the user made earlier.
  useEffect(() => {
    let live = true;
    try {
      if (localStorage.getItem(KEY) === "qorex" && getQorexNative()) {
        qorexConnect().then((a) => live && setQorex(a)).catch(() => {});
      }
    } catch {}
    const refresh = () => { try { if (localStorage.getItem(KEY) === "qorex") qorexConnect().then((a) => live && setQorex(a)).catch(() => {}); } catch {} };
    window.addEventListener("qorex_keystorechange", refresh);
    window.addEventListener("keplr_keystorechange", refresh);
    return () => { live = false; window.removeEventListener("qorex_keystorechange", refresh); window.removeEventListener("keplr_keystorechange", refresh); };
  }, []);

  const connectQorex = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      if (!getQorexNative()) { setError("no-qorex"); return undefined; }
      const a = await qorexConnect();
      setQorex(a);
      try { localStorage.setItem(KEY, "qorex"); } catch {}
      return a;
    } catch (e: any) {
      const m = flattenErr(e);
      setError(/reject|denied|cancel/i.test(m) ? "rejected" : /qorechain-vladi|does not match the active network|switch the network in QoreX/i.test(m) ? "network" : "no-qorex");
      return undefined;
    } finally { setBusy(false); }
  }, []);

  const connectEvm = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const c = connectors.find((x) => x.id === "metaMaskSDK" || /metamask/i.test(x.name)) ?? connectors[0];
      if (!c) { setError("no-metamask"); return; }
      if (!(window as any).ethereum) { setError("no-metamask"); return; }
      await connectAsync({ connector: c, chainId: CONFIG.evmChainId }).catch(async (e) => {
        // Already connected to wagmi from an earlier visit: reuse it.
        if (/already connected/i.test(String(e?.message))) return;
        throw e;
      });
      try { localStorage.setItem(KEY, "evm"); } catch {}
    } catch (e: any) {
      setError(/reject|denied|cancel/i.test(String(e?.message ?? e)) ? "rejected" : "no-metamask");
    } finally { setBusy(false); }
  }, [connectors, connectAsync]);

  const switchToDiana = useCallback(async () => {
    // A page cannot move QoreX between vladi and diana (QoreX docs). MetaMask we can switch.
    if (getQorexNative() && (localStorage.getItem(KEY) === "qorex" || qorex)) {
      setError("network");
      throw new Error(HOW_TO_SWITCH_DIANA);
    }
    try {
      await switchChainAsync({ chainId: CONFIG.evmChainId });
      setError(null);
    } catch { setError("network"); }
  }, [switchChainAsync, qorex]);

  const disconnect = useCallback(() => {
    setQorex(undefined); wagmiDisconnect();
    try { localStorage.removeItem(KEY); } catch {}
  }, [wagmiDisconnect]);

  const kind: Kind = qorex ? "qorex" : acct.isConnected ? "evm" : null;
  const evmAddress = acct.address as Address | undefined;
  const address = (qorex ? qorex.evm : evmAddress) as Address | undefined;
  const evmChainOk = !acct.isConnected || acct.chainId === CONFIG.evmChainId;

  const value = useMemo<WalletCtx>(() => ({
    kind, address, evmAddress, label: short(address, 6, 4), qorex, evmChainOk, busy, error,
    clearError: () => setError(null), connectQorex, connectEvm, switchToDiana, disconnect,
  }), [kind, address, evmAddress, qorex, evmChainOk, busy, error, connectQorex, connectEvm, switchToDiana, disconnect]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWallet = () => useContext(Ctx);
