import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="max-w-md">
          <Logo />
          <p className="mt-3 text-sm text-muted">
            Recorded SAPS crime by police station. Not a safety score.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          <Link href="/map" className="hover:text-foreground">
            Map
          </Link>
          <Link href="/crime-category" className="hover:text-foreground">
            Categories
          </Link>
          <Link href="/compare" className="hover:text-foreground">
            Compare
          </Link>
          <Link href="/methodology" className="hover:text-foreground">
            Methodology
          </Link>
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
        </nav>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-6 lg:px-8">
        <p className="mx-auto max-w-7xl text-xs text-muted">
          Recorded crime is not all crime that occurred. CrimeMap SA is independent and not
          affiliated with SAPS.
        </p>
      </div>
    </footer>
  );
}
