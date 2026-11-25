"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, connectorsForWallets, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { metaMaskWallet } from "@rainbow-me/rainbowkit/wallets";
import { qorexWallet, qorechainTestnet } from "@qorechain/qorex-rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { useState, type ReactNode } from "react";
import { CONFIG } from "@/lib/config";

const connectors = connectorsForWallets(
  [{ groupName: "QoreChain", wallets: [() => qorexWallet({ pollAccountsOnFocus: true }), metaMaskWallet] }],
  { appName: "Sortes", projectId: CONFIG.walletConnectProjectId },
);

export const wagmiConfig = createConfig({
  chains: [qorechainTestnet as any],
  connectors,
  transports: { [CONFIG.evmChainId]: http(CONFIG.evmRpc) },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider theme={{ lightMode: lightTheme(), darkMode: darkTheme() }}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
