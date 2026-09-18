import { formatCount } from "@/lib/format";
import type { HistoricalContext } from "@/lib/metrics/history";

function averageLine(label: string, average: HistoricalContext["fiveYear"]) {
  const suffix =
    average.missingCount > 0
      ? ` · ${average.presentCount} of ${average.presentCount + average.missingCount} years available`
      : "";

  return {
    label,
    value: formatCount(average.average),
    note: average.fromYear && average.toYear ? `${average.fromYear}–${average.toYear}${suffix}` : suffix.trim(),
  };
}

/**
 * Latest recorded figure against the same series' own history.
 */
export function HistoricalContextTable({ context }: { context: HistoricalContext }) {
  const rows = [
    {
      label: context.latestYear,
      value: formatCount(context.latestValue),
      note: "Latest financial year",
    },
    averageLine("5-year average", context.fiveYear),
    averageLine("10-year average", context.tenYear),
    {
      label: "Historical high",
      value: formatCount(context.extremes.high?.value ?? null),
      note: context.extremes.high?.financialYear ?? "No year with a recorded figure",
    },
    {
      label: "Historical low",
      value: formatCount(context.extremes.low?.value ?? null),
      note: context.extremes.low?.financialYear ?? "No year with a recorded figure",
    },
  ];

  const rangeNote =
    context.rangeRelation === "historical_high"
      ? "The latest figure is the highest in the available dataset."
      : context.rangeRelation === "historical_low"
        ? "The latest figure is the lowest in the available dataset."
        : context.rangeRelation === "inside_range" &&
            context.extremes.high &&
            context.extremes.low &&
            context.latestValue !== null
          ? `The latest figure sits between the historical low of ${formatCount(context.extremes.low.value)} and the historical high of ${formatCount(context.extremes.high.value)}.`
          : null;

  return (
    <div>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className="text-sm text-muted-strong">
              {row.label}
              {row.note ? <span className="mt-0.5 block text-xs text-muted">{row.note}</span> : null}
            </dt>
            <dd className="tabular text-sm font-medium text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      {rangeNote ? <p className="mt-4 text-sm leading-relaxed text-muted">{rangeNote}</p> : null}
    </div>
  );
}
