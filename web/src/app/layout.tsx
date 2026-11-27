import type { Metadata, Viewport } from "next";
import "lenis/dist/lenis.css";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_BOOT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Sortes: fair randomness for QoreChain",
  description: "The Athenian lottery machine, rebuilt on chain. Every lot carries its proof. Hashes and post-quantum signatures only.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
