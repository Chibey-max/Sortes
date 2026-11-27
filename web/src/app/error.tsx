"use client";
import { ErrorPage } from "@/design/ErrorPage";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorPage kind="404" text={{ t1: "Something broke,", t2: "not your draw.", body: "The page hit an error. Nothing was sent from your wallet. Reload, or come back in a moment: every draw deadline is counted in blocks, so nothing times out while you are away." }} />;
}
