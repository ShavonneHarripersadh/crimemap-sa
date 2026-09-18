import Link from "next/link";

import { ChangeIndicator } from "@/components/data/change-indicator";
import { StatCard } from "@/components/data/stat-card";
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
import { formatCount } from "@/lib/format";
import { calculateChange } from "@/lib/metrics/change";
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

/**
 * Everything CrimeMap SA can say about one police station precinct.
 *
 * The order answers what was recorded, what the mix looks like, whether the latest year moved,
 * how that compares with history, and which nearby stations provide geographic context.
 */
export function StationProfile({
  profile,
  nearby = [],
}: {
  profile: StationProfileData;
  nearby?: readonly NearbyStationLink[];
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

  return (
    <div className="space-y-14">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={`Recorded crime, ${latest.financialYear}`}
          value={totals.totalRecordedCrime}
          change={change}
          caption={`Across the ${HEADLINE_COMMUNITY_COLUMNS.length} community-reported serious crime categories.`}
        />
        <StatCard
          label="Years of data"
          value={`${ordered.length}`}
          caption={`${ordered[0]?.financialYear} to ${latest.financialYear}. ${FINANCIAL_YEAR_EXPLANATION}`}
        />
      </div>

      {missingNote ? <Note>{missingNote}</Note> : null}

      <Section
        title="Area snapshot"
        description={`The ${latest.financialYear} total compared with this precinct's own history. Averages skip years the source does not provide rather than treating them as zero.`}
      >
        <HistoricalContextTable context={historical} />
      </Section>

      <Section
        title="What the figures show"
        description="Plain-English statements generated from the calculations on this page. They describe what was recorded and nothing beyond it."
      >
        <AreaInsights insights={insights} />
      </Section>

      <AreaProfileVisuals
        records={ordered}
        breakdown={breakdownWithChange}
        totalRecordedCrime={totals.totalRecordedCrime}
      />

      <Section
        title="What's changing"
        description={
          previous
            ? `Categories with the largest movements between ${previous.financialYear} and ${latest.financialYear}. A change is only listed when it is large enough in both absolute and proportional terms.`
            : undefined
        }
      >
        <WhatsChanging
          changes={categoryChanges}
          financialYear={latest.financialYear}
          previousFinancialYear={previous?.financialYear ?? null}
        />
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

      <Section title="Source and methodology">
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
      <Eyebrow>Police station precinct</Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{station.name}</h1>
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
