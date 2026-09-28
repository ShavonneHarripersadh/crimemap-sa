import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-unavailable";
import { SearchBox } from "@/components/search/search-box";
import { Note } from "@/components/ui/note";
import { getProvinceOverviews } from "@/lib/data/aggregates";

export const revalidate = 86_400;

export default async function HomePage() {
  const provinces = await getProvinceOverviews();

  return (
    <div>
      <section className="hero-wash">
        <div className="mx-auto max-w-3xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-20">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            How safe is your area?
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Search a suburb, town or police precinct and see how reported crime changed in the
            latest figures the police have published. This is recorded crime, not a safety score
            and not a prediction.
          </p>
          <div className="mt-8">
            <SearchBox autoFocus placeholder="Search a suburb, town or police precinct" />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/map"
              className="inline-flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
            >
              Explore the map
            </Link>
            <Link
              href="/compare"
              className="inline-flex h-11 items-center rounded-lg border border-border bg-surface-raised px-4 text-sm font-medium"
            >
              Compare areas
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">What CrimeMap SA is</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">
            A plain way to read official South African Police Service crime statistics for the
            place you care about. You do not need to know the precinct name before you start.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">How the data works</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-muted sm:text-base">
            <li>
              Police publish counts for a precinct, which is the area served by one station. A
              suburb is not that boundary. When you search a suburb, the page is named for the
              suburb and the figures come from the nearest precinct.
            </li>
            <li>
              Each comparison uses the previous period that actually exists in the dataset. A
              missing figure stays missing. It is not treated as zero.
            </li>
            <li>
              Counts are not rates. A larger precinct often records more cases because more people
              live there, not because it has been scored as more dangerous.
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface px-5 py-4">
          <h2 className="text-sm font-semibold">About this data</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Figures are crimes recorded by the South African Police Service, organised by financial
            year. Cases that were never reported do not appear.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/methodology" className="font-medium text-accent hover:underline">
              Read how the figures are calculated
            </Link>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">Look across the country</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The map colours municipalities by how many cases were recorded. The colour is that
            count, not a rating of how safe a place is.
          </p>
          <Link
            href="/map"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Open the map
          </Link>
          {provinces.ok && provinces.data.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {provinces.data.map((province) => (
                <li key={province.slug}>
                  <Link
                    href={`/crime/${province.slug}`}
                    className="inline-flex rounded-full border border-border bg-surface-raised px-3 py-1.5 text-sm hover:border-border-strong"
                  >
                    {province.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : provinces.ok ? (
            <Note className="mt-4">No provinces are available until crime records have been loaded.</Note>
          ) : (
            <div className="mt-4">
              <DataUnavailable error={provinces.error} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
