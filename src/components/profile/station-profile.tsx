import Link from "next/link";

import { ChangeIndicator } from "@/components/data/change-indicator";
import { WhatsChanging } from "@/components/data/whats-changing";
import { CrimeMap } from "@/components/map/crime-map";
import { AreaInsights } from "@/components/profile/area-insights";
import { AreaProfileVisuals } from "@/components/profile/area-profile-visuals";
import { CrimeHistory } from "@/components/profile/crime-history";
import { HistoricalContextTable } from "@/components/profile/historical-context";
import { NearbyStations, type NearbyStationLink } from "@/components/profile/nearby-stations";
import { UnusualMovements } from "@/components/profile/unusual-movements";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Note } from "@/components/ui/note";
import { Eyebrow, Section } from "@/components/ui/section";
import { FINANCIAL_YEAR_EXPLANATION } from "@/lib/crime/financial-year";
import { FEATURED_SERIES, HEADLINE_COMMUNITY_COLUMNS } from "@/lib/crime/taxonomy";
import type { StationProfile as StationProfileData } from "@/lib/data/stations";
import { describeChangeState, directionIndicator, formatCount } from "@/lib/format";
import { calculateChange, trendDirection, type Change } from "@/lib/metrics/change";
import {
  buildCrimeHistory,
  buildHistoricalContext,
  classifyUnusualMovement,
  totalSeries,
} from "@/lib/metrics/history";
import { buildInsights, missingTotalNote } from "@/lib/metrics/insights";
import {
  buildBreakdown,
  buildCategoryChanges,
  buildSeries,
  buildYearTotals,
  totalChange,
} from "@/lib/metrics/profile";

/** How the page names the place the reader searched, when that is not the precinct itself. */
export interface ProfileSubject {
  readonly name: string;
  readonly kind: "place" | "precinct";
  readonly sourceStationName: string;
  readonly sourceHref: string;
  readonly distanceLabel?: string | null;
}

/**
 * Everything CrimeMap SA can say about one police station precinct.
 *
 * The opening sections answer what changed. Longer history and category charts stay available
 * under detailed analysis.
 */
export function StationProfile({
  profile,
  nearby = [],
  subject,
}: {
  profile: StationProfileData;
  nearby?: readonly NearbyStationLink[];
  subject?: ProfileSubject;
}) {
  const { station, records } = profile;

  const ordered = [...records].sort((a, b) => a.financialYearStart - b.financialYearStart);
  const latest = ordered.at(-1);
  const previous = ordered.at(-2) ?? null;

  if (!latest) {
    return (
      <Note tone="caution">
        The dataset contains {station.name} as a police station precinct but has no crime records
        for it, so there are no figures to show.
      </Note>
    );
  }

  const totals = buildYearTotals(latest);
  const change = totalChange(latest, previous);
  const categoryChanges = buildCategoryChanges(latest, previous);
  const series = totalSeries(ordered);
  const historical = buildHistoricalContext(series);
  const history = buildCrimeHistory(series);
  const unusual = classifyUnusualMovement(series);

  const breakdownRows = buildBreakdown(latest);
  const breakdownWithChange = breakdownRows.map((row) => ({
    ...row,
    change: calculateChange(
      latest.counts[row.column] ?? null,
      previous ? (previous.counts[row.column] ?? null) : null,
    ),
  }));

  const insights = buildInsights({
    entityId: station.slug,
    financialYear: latest.financialYear,
    previousFinancialYear: previous?.financialYear ?? null,
    totalRecordedCrime: totals.totalRecordedCrime,
    previousTotalRecordedCrime: previous ? buildYearTotals(previous).totalRecordedCrime : null,
    missingCategories: totals.missingCategories,
    totalChange: change,
    categoryChanges,
    historical,
    unusual,
    breakdown: breakdownRows,
  });

  const categoryUnusual = FEATURED_SERIES.filter((item) => item.key !== "all")
    .map((item) => ({
      label: item.label,
      movement: classifyUnusualMovement(buildSeries(ordered, item)),
    }))
    .filter(
      (item) =>
        item.movement.classification === "notable" ||
        item.movement.classification === "largest_increase" ||
        item.movement.classification === "largest_decrease",
    )
    .slice(0, 3);

  const missingNote = missingTotalNote(totals.missingCategories);
  const placeName = subject?.name ?? station.name;
  const sourceName = subject?.sourceStationName ?? station.name;
  const sourceHref = subject?.sourceHref ?? (station.provinceSlug
    ? `/crime/${station.provinceSlug}/${station.slug}`
    : `/station/${station.slug}`);

  return (
    <div className="space-y-14">
      <section aria-labelledby="crime-overview-heading">
        <h2 id="crime-overview-heading" className="text-sm font-medium tracking-wide text-muted uppercase">
          Crime overview
        </h2>
        <p className="mt-3 text-5xl font-semibold tracking-tight tabular sm:text-6xl">
          <span aria-hidden>{directionIndicator(trendDirection(change))}</span>{" "}
          <span className={overviewTone(change)}>{overviewFigure(change)}</span>
        </p>
        <p className="mt-3 max-w-xl text-base text-foreground">
          {overviewSentence(change, previous?.financialYear ?? null)}
        </p>
        <p className="mt-2 text-sm text-muted">
          {formatCount(totals.totalRecordedCrime)} recorded cases in {latest.financialYear}, across
          the {HEADLINE_COMMUNITY_COLUMNS.length} community-reported categories.
        </p>
        <dl className="mt-5 space-y-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">Data source</dt>
            <dd>
              <Link href={sourceHref} className="font-medium text-foreground hover:text-accent">
                {sourceName} SAPS precinct
              </Link>
              {subject?.distanceLabel ? (
                <span className="text-muted"> · {subject.distanceLabel} from {placeName}</span>
              ) : null}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">Latest available data</dt>
            <dd className="font-medium">{latest.financialYear}</dd>
          </div>
        </dl>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Crime statistics are reported at police-precinct level. They are not suburb-specific
          incident counts.
        </p>
        {missingNote ? <Note className="mt-4">{missingNote}</Note> : null}
      </section>

      <Section
        title="What changed?"
        description={
          previous
            ? `Largest movements between ${previous.financialYear} and ${latest.financialYear}. Smaller changes, and any missing figure, are left out.`
            : undefined
        }
      >
        <WhatsChanging
          changes={categoryChanges}
          financialYear={latest.financialYear}
          previousFinancialYear={previous?.financialYear ?? null}
        />
      </Section>

      <AreaProfileVisuals
        records={ordered}
        breakdown={breakdownWithChange}
        totalRecordedCrime={totals.totalRecordedCrime}
      />

      <section className="rounded-xl border border-border bg-surface px-5 py-5">
        <h2 className="text-lg font-semibold tracking-tight">Compare this area</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
          Put the {sourceName} precinct, which supplies the figures
          {subject?.kind === "place" ? ` for ${placeName}` : ""}, next to another precinct. The
          comparison does not pick a safer area.
        </p>
        <Link
          href={`/compare?areas=${station.slug}`}
          className="mt-4 inline-flex h-11 items-center rounded-lg border border-border bg-surface-raised px-4 text-sm font-medium hover:border-border-strong"
        >
          Compare with another area
        </Link>
      </section>

      <details className="group rounded-xl border border-border bg-surface-raised">
        <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            Detailed analysis
            <span className="text-sm font-normal text-muted group-open:hidden">Show</span>
            <span className="hidden text-sm font-normal text-muted group-open:inline">Hide</span>
          </span>
          <span className="mt-1 block text-sm font-normal text-muted">
            History, unusual movements, and crimes recorded through police action.
          </span>
        </summary>
        <div className="space-y-12 border-t border-border px-5 py-6">
      <Section
        title="Area snapshot"
        description={`The ${latest.financialYear} total compared with this precinct's own history. Averages skip years the source does not provide rather than treating them as zero. ${ordered[0]?.financialYear} to ${latest.financialYear}. ${FINANCIAL_YEAR_EXPLANATION}`}
      >
        <HistoricalContextTable context={historical} />
      </Section>

      <Section
        title="What the figures show"
        description="Plain-English statements generated from the calculations on this page. They describe what was recorded and nothing beyond it."
      >
        <AreaInsights insights={insights} />
      </Section>

      <Section
        title="Crime history"
        description={`Highest and lowest recorded years for ${station.name}, and the largest comparable year-on-year movements in the dataset.`}
      >
        <CrimeHistory milestones={history} entityLabel={station.name} />
      </Section>

      <Section
        title="Unusual movements"
        description="The latest year-on-year change compared with this precinct's own earlier comparable movements, not with a national ranking."
      >
        <UnusualMovements movement={unusual} categoryMovements={categoryUnusual} />
      </Section>

      {nearby.length > 0 ? (
        <Section
          title="Nearby stations"
          description="Geographic context only. CrimeMap SA does not assign a suburb to an official precinct."
        >
          <NearbyStations stations={nearby} placeName={station.name} />
        </Section>
      ) : null}

      <Section
        title="Crime detected through police action"
        description="Reported separately because these figures largely reflect how much policing activity took place, not how much crime was reported by the public. They are not part of the total above."
      >
        <Card>
          <CardHeader>
            <CardTitle>{latest.financialYear}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted">Total detected through police action</span>
              <span className="flex items-baseline gap-3">
                <span className="tabular text-lg font-semibold">
                  {formatCount(totals.policeActionTotal)}
                </span>
                <ChangeIndicator
                  change={calculateChange(
                    totals.policeActionTotal,
                    previous ? buildYearTotals(previous).policeActionTotal : null,
                  )}
                  size="sm"
                />
              </span>
            </div>
          </CardContent>
        </Card>
      </Section>
        </div>
      </details>

      <Section title="About this data">
        <div className="space-y-4">
          <Note>
            These are crimes <strong>recorded by police</strong> in the {station.name} precinct, not
            all crime that occurred there. Cases that were never reported do not appear, and
            reporting rates differ between areas and between categories.
          </Note>
          <Note>
            Figures are counts, not rates. The source data contains no population figure for a
            precinct, so CrimeMap SA cannot show crime per 100,000 people and does not estimate one.
            A precinct covering a dense area will usually record more of everything.
          </Note>
          <Note>
            Precinct boundaries change over time as stations are opened, closed or redrawn. A large
            movement in a single year can reflect a boundary change rather than a change in
            recorded crime.
          </Note>
          <p className="text-xs leading-relaxed text-muted">
            Figures are crimes recorded by the South African Police Service.{" "}
            <Link href="/methodology" className="text-accent underline decoration-dotted">
              Read the full methodology
            </Link>
            .
          </p>
        </div>
      </Section>

      {station.latitude === null || station.longitude === null ? (
        <Note tone="caution">
          The source data has no coordinates for this station, so it does not appear on the map.
          Its recorded figures are unaffected.
        </Note>
      ) : (
        <Section
          title="Where this precinct is"
          description="The source file has a point for the police station, not an official precinct outline. Nearby stations are shown for context."
        >
          <CrimeMap
            financialYear={latest.financialYear}
            category="total_recorded_crime"
            categoryLabel="Recorded crimes"
            chrome={false}
            focus={{
              slug: station.slug,
              longitude: station.longitude,
              latitude: station.latitude,
            }}
          />
          <p className="mt-3 text-sm text-muted">
            <Link href="/map" className="text-accent underline decoration-dotted underline-offset-2">
              Open the national map
            </Link>
          </p>
        </Section>
      )}
    </div>
  );
}

/** Location line and quick facts shown in the page header. */
export function StationHeader({ profile }: { profile: StationProfileData }) {
  const { station, records } = profile;
  const latest = [...records].sort((a, b) => a.financialYearStart - b.financialYearStart).at(-1);

  return (
    <div>
      <Eyebrow>Police precinct</Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {station.name} police precinct
      </h1>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        {[station.localMunicipality, station.districtMunicipality, station.provinceName]
          .filter(Boolean)
          .join(" · ") || "Location not recorded in the source data"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {latest ? <Badge variant="accent">Latest year {latest.financialYear}</Badge> : null}
        <Badge>{records.length} financial years of records</Badge>
        {station.latitude === null ? <Badge variant="warning">No coordinates</Badge> : null}
      </div>
    </div>
  );
}

function overviewFigure(change: Change): string {
  if (change.state === "ok" && change.percentChange !== null) {
    return `${Math.abs(change.percentChange).toFixed(1)}%`;
  }
  if (change.state === "newly_recorded") return "New";
  if (change.state === "none_in_either_year") return "None";
  return "—";
}

function overviewTone(change: Change): string {
  const direction = trendDirection(change);
  if (direction === "increase") return "text-increase";
  if (direction === "decrease") return "text-decrease";
  return "text-foreground";
}

function overviewSentence(change: Change, previousYear: string | null): string {
  if (!previousYear) {
    return "There is no earlier period in the dataset to compare with.";
  }
  const direction = trendDirection(change);
  if (change.state === "ok" && change.percentChange !== null && direction !== "unavailable") {
    const amount = `${Math.abs(change.percentChange).toFixed(1)}%`;
    if (direction === "increase") {
      return `Reported crime increased by ${amount} compared with ${previousYear}.`;
    }
    if (direction === "decrease") {
      return `Reported crime decreased by ${amount} compared with ${previousYear}.`;
    }
    if (direction === "broadly_unchanged") {
      return `Reported crime was broadly unchanged compared with ${previousYear}.`;
    }
  }
  return `${describeChangeState(change)} The comparison period is ${previousYear}.`;
}
