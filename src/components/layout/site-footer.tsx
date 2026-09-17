import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div>
          <p className="text-sm font-semibold">CrimeMap SA</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Recorded crime statistics published by the South African Police Service, presented as
            maps, trends and comparisons. CrimeMap SA reports what was recorded. It does not
            assess safety, predict crime or rank places.
          </p>
        </div>

        <nav aria-label="Footer" className="text-sm">
          <p className="font-medium text-foreground">Explore</p>
          <ul className="mt-3 space-y-2 text-muted">
            <li>
              <Link href="/map" className="hover:text-foreground">
                National map
              </Link>
            </li>
            <li>
              <Link href="/compare" className="hover:text-foreground">
                Compare areas
              </Link>
            </li>
            <li>
              <Link href="/methodology" className="hover:text-foreground">
                Methodology and calculations
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-foreground">
                About
              </Link>
            </li>
          </ul>
        </nav>

        <div className="text-sm">
          <p className="font-medium text-foreground">Figures</p>
          <p className="mt-3 leading-relaxed text-muted">
            Counts of crimes recorded by the South African Police Service, shown by police station
            and financial year. CrimeMap SA does not publish the underlying file.
          </p>
        </div>
      </div>

      <div className="border-t border-border px-4 py-5 sm:px-6 lg:px-8">
        <p className="mx-auto max-w-7xl text-xs leading-relaxed text-muted">
          Recorded crime is not the same as crime that occurred. Figures reflect cases reported to
          and recorded by police, so differences between areas can reflect differences in
          reporting as well as differences in offending. CrimeMap SA is an independent project and
          is not affiliated with the South African Police Service.
        </p>
      </div>
    </footer>
  );
}
