import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

/** Internal paths go through next/link (client navigation); everything else is a plain anchor. */
export function A({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  if (href.startsWith("/")) return <Link href={href} {...(rest as any)}>{children}</Link>;
  return <a href={href} {...rest}>{children}</a>;
}
