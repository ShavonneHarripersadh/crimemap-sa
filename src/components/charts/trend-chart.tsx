"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCount } from "@/lib/format";

export interface TrendPoint {
  readonly financialYear: string;
  readonly value: number | null;
  /** How many contributing source figures were missing for this year. */
  readonly missingCount?: number;
}

/**
 * Recorded crime over time.
 *
 * A year the source does not provide is left as a gap in the line rather than joined through,
 * so a missing year never looks like a fall to zero. The y-axis is not forced to zero because
 * these are counts over a long series; the axis labels always state the actual values.
 */
export function TrendChart({
  data,
  label,
  height = 300,
}: {
  data: readonly TrendPoint[];
  label: string;
  height?: number;
}) {
  const hasAnyValue = data.some((point) => point.value !== null);

  if (!hasAnyValue) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center rounded-lg border border-dashed border-border text-sm text-muted"
      >
        No figures are available for this category.
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...data]} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="financialYear"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            stroke="var(--border)"
            tickMargin={8}
            minTickGap={18}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            stroke="var(--border)"
            width={56}
            tickFormatter={(value: number) =>
              value >= 1_000_000
                ? `${(value / 1_000_000).toFixed(1)}m`
                : value >= 1_000
                  ? `${Math.round(value / 1_000)}k`
                  : String(value)
            }
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-strong)",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
            }}
            labelStyle={{ color: "var(--muted)" }}
            itemStyle={{ color: "var(--foreground)" }}
            formatter={(value) => [
              formatCount(typeof value === "number" ? value : null),
              label,
            ]}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={label}
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 2, fill: "var(--accent)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            // Leaves a gap where the source has no figure instead of interpolating across it.
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
