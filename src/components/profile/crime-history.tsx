import { formatCount, formatPercent } from "@/lib/format";
import type { CrimeHistoryMilestones } from "@/lib/metrics/history";

/**
 * Factual highs, lows and largest year-on-year movements for one series.
 */
export function CrimeHistory({
  milestones,
  entityLabel,
}: {
  milestones: CrimeHistoryMilestones;
  entityLabel: string;
}) {
  const items = [
    milestones.highest
      ? {
          title: "Highest recorded year",
          body: `${milestones.highest.financialYear} — ${formatCount(milestones.highest.value)} incidents`,
        }
      : null,
    milestones.lowest
      ? {
          title: "Lowest recorded year",
          body: `${milestones.lowest.financialYear} — ${formatCount(milestones.lowest.value)} incidents`,
        }
      : null,
    milestones.largestIncrease
      ? {
          title: "Largest year-on-year increase",
          body: `${milestones.largestIncrease.financialYear} — ${formatPercent(milestones.largestIncrease.change.percentChange)}`,
        }
      : null,
    milestones.largestDecrease
      ? {
          title: "Largest year-on-year decrease",
          body: `${milestones.largestDecrease.financialYear} — ${formatPercent(milestones.largestDecrease.change.percentChange)}`,
        }
      : null,
  ].filter((item): item is { title: string; body: string } => item !== null);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        There are not enough comparable years in the {entityLabel} record to list historical
        highs, lows or year-on-year extremes.
      </p>
    );
  }

  return (
    <dl className="grid gap-6 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.title}>
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">{item.title}</dt>
          <dd className="mt-1.5 text-base font-medium text-foreground">{item.body}</dd>
        </div>
      ))}
    </dl>
  );
}
