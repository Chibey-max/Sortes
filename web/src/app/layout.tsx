import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Sortes",
  description: "Fair randomness for QoreChain, built only from quantum-safe parts. Mint a Sortes Lot and verify it yourself.",
};

const NAV = [
  ["/", "Mint"],
  ["/gallery", "Gallery"],
  ["/verify", "Verify"],
  ["/attacks", "Attacks"],
  ["/build", "Build"],
  ["/house", "House"],
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="top">
            <Link href="/" className="brand">Sortes</Link>
            <nav>
              {NAV.map(([href, label]) => (
                <Link key={href} href={href}>{label}</Link>
              ))}
            </nav>
          </header>
          <main>{children}</main>
          <footer className="foot">
            Sortes: fair randomness on QoreChain diana (testnet). keccak256 hash chains + ML-DSA-87. MIT licence.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
