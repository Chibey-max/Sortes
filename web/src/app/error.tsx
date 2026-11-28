"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ErrorPage } from "@/design/ErrorPage";

const NAV: [string, string][] = [
  ["/mint", "Mint"], ["/gallery", "Gallery"], ["/verify", "Verify"],
  ["/attacks", "Attacks"], ["/build", "Build"], ["/house", "House"],
];

/** Runtime errors used to reuse the 404 layout, so /mint looked missing. Recover in place. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const path = usePathname() || "";
  const active = NAV.find(([p]) => path === p || path.startsWith(p + "/"))?.[1];
  useEffect(() => { console.error(error); }, [error]);
  return (
    <ErrorPage
      kind="crash"
      active={active}
      reset={reset}
      text={{
        t1: "Something broke,",
        t2: "not your draw.",
        body: "The page hit an error. Nothing was sent from your wallet. Try again, or reload: every draw deadline is counted in blocks, so nothing times out while you are away.",
      }}
    />
  );
}
