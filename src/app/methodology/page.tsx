import type { Metadata } from "next";
import Link from "next/link";

import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { FINANCIAL_YEAR_EXPLANATION } from "@/lib/crime/financial-year";
import { HEADLINE_COMMUNITY_COLUMNS, POLICE_ACTION_COLUMNS } from "@/lib/crime/taxonomy";
import { CHANGE_HIGHLIGHT_RULES, LOW_BASE_THRESHOLD } from "@/lib/metrics/change";
import { SOURCE_PRODUCER } from "@/lib/source";

export const metadata: Metadata = {
  title: "Methodology and calculations",
  description:
    "How CrimeMap SA turns South African Police Service annual crime records into totals, year-on-year change and maps, without inventing values or converting financial years.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <TrackOnMount event="methodology_opened" />
      <PageHeader>
        <Eyebrow>Methodology</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          How the figures are calculated
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Every number on CrimeMap SA is either a source value or a documented derivation from
          source values. Nothing is imputed, forecast or converted into a calendar year.
        </p>
      </PageHeader>

      <div className="space-y-10 text-sm leading-relaxed text-muted-strong">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Financial years</h2>
          <p>{FINANCIAL_YEAR_EXPLANATION}</p>
          <p>
            Labels such as 2024/25 always mean 1 April 2024 to 31 March 2025. CrimeMap SA never
            splits or restates those years as calendar years.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">What is in the headline total</h2>
          <p>
            “Recorded crime” on this site is the sum of the {HEADLINE_COMMUNITY_COLUMNS.length}{" "}
            community-reported serious crime categories in the source. Nested totals in the source
            — aggravated robbery and sexual offences — already include their subcategories, so the
            subcategories are not added again.
          </p>
          <p>
            The {POLICE_ACTION_COLUMNS.length} police-action categories (illegal firearms, drug
            crime, driving under the influence, and police-detected sexual offences) are shown
            separately. They largely reflect policing activity rather than public reports, so they
            are not part of the headline total.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Missing values and negatives</h2>
          <p>
            If the source does not provide a figure, CrimeMap SA shows “Not available”. A missing
            value is never treated as zero.
          </p>
          <p>
            The source contains some negative values, almost all in sexual-offence breakdowns for
            early years. A count of recorded crimes cannot be negative, so those values are stored
            exactly as distributed and treated as missing in every calculation.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Year-on-year change</h2>
          <p>
            Percentage change is (current − previous) / previous × 100, rounded to one decimal
            place. If the previous value is zero and the current value is above zero, the change is
            labelled “Newly recorded” rather than as a percentage. If either value is missing, the
            change is unavailable.
          </p>
          <p>
            A previous count below {LOW_BASE_THRESHOLD} is flagged as a small base, because a
            single extra case moves a small number by a large percentage. A change is only listed
            under “what’s changing” when the previous count is at least{" "}
            {CHANGE_HIGHLIGHT_RULES.minimumPreviousValue}, the absolute movement is at least{" "}
            {CHANGE_HIGHLIGHT_RULES.minimumAbsoluteChange}, and the percentage movement is at least{" "}
            {CHANGE_HIGHLIGHT_RULES.minimumPercentChange}%.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Places and the map</h2>
          <p>
            Each map circle is a police station, placed at the coordinates in the source. The
            dataset does not include precinct boundary polygons, so CrimeMap SA does not draw
            precincts as areas.
          </p>
          <p>
            Province is derived from the source district municipality using a documented Statistics
            South Africa lookup. It is not a column in the SAPS file.
          </p>
          <p>
            Search matches police station, municipality, district and province names in the
            dataset. Suburb names such as Bromhof are not in that file. When a search matches no
            source name, CrimeMap SA looks the place up geographically and offers the nearest
            stations. That is a distance hint, not an official statement of which precinct a
            suburb falls in.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Historical context</h2>
          <p>
            Five-year and ten-year averages are the mean of recorded totals whose financial years
            fall in that window, counting only years the source provides. A missing year is omitted
            from the mean rather than treated as zero. If fewer years exist than the window, the
            average uses the years that are present and the page says how many.
          </p>
          <p>
            Historical high and low are the maximum and minimum recorded totals in the available
            series. Ties are assigned to the most recent year that holds the extreme value.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Unusual movements</h2>
          <p>
            A latest year-on-year percentage is compared with earlier comparable percentages for
            the same station or category, not with a national ranking. A movement is comparable
            only when both years have a figure, the previous-year count is at least{" "}
            {LOW_BASE_THRESHOLD}, and the change is not a rise from zero.
          </p>
          <p>
            At least five earlier comparable movements are required. The latest movement is the
            largest recorded increase or decrease when it is strictly larger than every earlier
            comparable movement in that direction. It is notable when it is not the series extreme
            but its absolute percentage is at least 1.5 times the median of earlier absolute
            percentages, and it still clears the “what’s changing” size rules. Otherwise it is
            described as within the historical range. If those conditions are not met, no unusual
            claim is made.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Map year-on-year change</h2>
          <p>
            The optional year-on-year map layer colours a local municipality from the stations that
            have a figure in both the selected year and the previous year. Stations with a missing
            value are left out of that municipality’s change rather than counted as zero. A
            previous-year count below {LOW_BASE_THRESHOLD} is not painted as a percentage. A change
            of 10% or more is a strong movement; movements inside 2% are treated as broadly
            unchanged, matching the rest of the site.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Source</h2>
          <p>
            Figures are crimes recorded by {SOURCE_PRODUCER}, organised by police station and
            financial year. CrimeMap SA does not host or link to the underlying file.
          </p>
          <p>
            <Link
              href="/about"
              className="text-accent underline decoration-dotted underline-offset-2"
            >
              About CrimeMap SA
            </Link>
          </p>
        </section>

        <Note>
          Recorded crime is not the same as crime that occurred. Differences between areas can
          reflect differences in reporting and recording as well as differences in offending.
        </Note>
      </div>
    </div>
  );
}
