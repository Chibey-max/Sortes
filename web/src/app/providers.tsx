"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { qorechainTestnet } from "@qorechain/qorex-rainbowkit";
import { useState, type ReactNode } from "react";
import { CONFIG } from "@/lib/config";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/lib/toast";
import { WalletProvider } from "@/lib/wallet";

/** MetaMask (EVM lane) goes through wagmi; QoreX (native lane) is handled in lib/wallet + lib/qorex. */
export const wagmiConfig = createConfig({
  chains: [qorechainTestnet as any],
  connectors: [injected({ target: "metaMask" })],
  transports: { [CONFIG.evmChainId]: http(CONFIG.evmRpc) },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <ToastProvider>
            <WalletProvider>{children}</WalletProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
