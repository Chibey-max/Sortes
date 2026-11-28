"use client";

import { FooterView } from "./views/FooterView";
import { addressUrl, CONFIG, isDeployed } from "@/lib/config";
import { num, short, useHead } from "@/lib/live";
import { useTheme } from "@/lib/theme";

export function Footer({ dark }: { dark?: boolean | string }) {
  const { theme } = useTheme();
  const isDark = dark === undefined ? theme === "dark" : dark === true || dark === "true";
  const { head, error } = useHead(12000);
  const v = {
    th: isDark ? "dark" : "light",
    chainLine: error ? "diana testnet · not reachable" : head === null ? "diana testnet · connecting" : `diana testnet · block #${num(head)}`,
    chainDot: error ? "#f07a6e" : "#8cc27a",
    contractLine: isDeployed ? `contract ${short(CONFIG.house, 6, 4)}` : "contracts not deployed yet",
    contractHref: isDeployed ? addressUrl(CONFIG.house) : "",
    cols: [
      { t: "Draw", l: [{ t: "Mint a lot", h: "/mint" }, { t: "Gallery", h: "/gallery" }, { t: "Your lots", h: "/gallery?mine=1" }] },
      { t: "Proof", l: [{ t: "Verify a lot", h: "/verify" }, { t: "Attacks it refuses", h: "/attacks" }, { t: "The house", h: "/house" }] },
      { t: "Build", l: [{ t: "Build guide", h: "/build" }, { t: "Contracts", h: "/build#contracts" }, { t: "Status", h: "/status" }] },
    ],
  };
  return <FooterView v={v} />;
}
