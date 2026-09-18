import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { CategoriesMenu } from "@/components/layout/categories-menu";
import { SearchBox } from "@/components/search/search-box";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { explorableCategories } from "@/lib/crime/taxonomy";
import { cn } from "@/lib/utils";

const linkClass =
  "rounded-lg px-2 py-2 text-sm text-muted-strong transition-colors hover:bg-surface-hover hover:text-foreground sm:px-3";

export function SiteHeader() {
  const categories = explorableCategories().map((category) => ({
    href: `/crime-category/${category.key}`,
    label: category.label,
  }));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center" aria-label="CrimeMap SA home">
          <Logo />
        </Link>

        <div className="hidden min-w-0 flex-1 lg:block">
          <SearchBox size="md" placeholder="Search a station, suburb or town" />
        </div>

        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <Link href="/map" className={linkClass}>
            Map
          </Link>
          <CategoriesMenu items={categories} />
          <Link href="/compare" className={linkClass}>
            Compare
          </Link>
          <Link href="/methodology" className={cn(linkClass, "hidden md:inline-flex")}>
            Methodology
          </Link>
          <Link href="/about" className={cn(linkClass, "hidden md:inline-flex")}>
            About
          </Link>
          <ThemeToggle />
        </nav>
      </div>

      <div className="border-t border-border px-4 py-3 lg:hidden">
        <SearchBox size="md" placeholder="Search a station, suburb or town" />
      </div>
    </header>
  );
}
