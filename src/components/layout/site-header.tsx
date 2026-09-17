import Link from "next/link";

import { SearchBox } from "@/components/search/search-box";

const NAV = [
  { href: "/map", label: "Map" },
  { href: "/compare", label: "Compare" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="CrimeMap SA home"
        >
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-sm font-bold text-accent"
          >
            SA
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            CrimeMap SA
          </span>
        </Link>

        <div className="hidden min-w-0 flex-1 lg:block">
          <SearchBox size="md" placeholder="Search a station, suburb or municipality" />
        </div>

        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-strong transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-border px-4 py-3 lg:hidden">
        <SearchBox size="md" placeholder="Search a station, suburb or municipality" />
      </div>
    </header>
  );
}
