import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

/** Internal paths go through next/link (client navigation); everything else is a plain anchor. */
export function A({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  if (href.startsWith("/")) {
    return (
      <Link
        href={href}
        scroll
        {...(rest as any)}
        onClick={(e) => {
          (rest as any).onClick?.(e);
          try {
            window.scrollTo(0, 0);
            (window as any).__lenis?.scrollTo(0, { immediate: true, force: true });
          } catch { /* ignore */ }
        }}
      >
        {children}
      </Link>
    );
  }
  return <a href={href} {...rest}>{children}</a>;
}
