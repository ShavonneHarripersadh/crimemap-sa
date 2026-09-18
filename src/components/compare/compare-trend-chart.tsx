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

const STROKES = ["var(--accent)", "var(--muted-strong)", "var(--neutral)"] as const;

export interface CompareSeries {
  readonly key: string;
  readonly label: string;
  readonly points: readonly { financialYear: string; value: number | null }[];
}

export function CompareTrendChart({
  series,
  height = 300,
}: {
  series: readonly CompareSeries[];
  height?: number;
}) {
  const years = [...new Set(series.flatMap((item) => item.points.map((point) => point.financialYear)))];
  const data = years.map((financialYear) => {
    const row: Record<string, string | number | null> = { financialYear };
    for (const item of series) {
      row[item.key] = item.points.find((point) => point.financialYear === financialYear)?.value ?? null;
    }
    return row;
  });

  if (series.length === 0 || data.every((row) => series.every((item) => row[item.key] == null))) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center rounded-lg border border-dashed border-border text-sm text-muted"
      >
        No overlapping years are available to plot.
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
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
              value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value)
            }
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-strong)",
              borderRadius: "0.5rem",
              fontSize: "0.8125rem",
            }}
            formatter={(value, name) => [
              formatCount(typeof value === "number" ? value : null),
              String(name),
            ]}
          />
          {series.map((item, index) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={STROKES[index] ?? STROKES[0]}
              strokeWidth={2}
              dot={{ r: 2, fill: STROKES[index] ?? STROKES[0], strokeWidth: 0 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
