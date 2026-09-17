import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">Not found</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">That page is not here</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The address may be misspelt, or the page may not exist yet. Search for a police station
        from the header, or go back to the national overview.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium hover:bg-surface-hover"
        >
          Home
        </Link>
        <Link
          href="/map"
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-strong hover:bg-surface-hover hover:text-foreground"
        >
          Map
        </Link>
        <Link
          href="/compare"
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-strong hover:bg-surface-hover hover:text-foreground"
        >
          Compare
        </Link>
      </div>
    </div>
  );
}
