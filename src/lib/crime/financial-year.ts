/**
 * The source dataset reports on the South African government financial year, which runs from
 * 1 April to 31 March. CrimeMap SA keeps that definition and never converts a financial year
 * into a calendar year.
 *
 * Canonical display form is the start year followed by the last two digits of the end year,
 * for example 2024/25.
 */

export interface FinancialYear {
  /** Calendar year in which the financial year starts, e.g. 2024 for 2024/25. */
  readonly start: number;
  /** Canonical display form, e.g. "2024/25". */
  readonly label: string;
}

export function formatFinancialYear(startYear: number): string {
  const endTwoDigits = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}/${endTwoDigits}`;
}

export function financialYear(startYear: number): FinancialYear {
  return { start: startYear, label: formatFinancialYear(startYear) };
}

/**
 * Parse a canonical financial year label back to its start year.
 * Returns null for anything that is not in canonical form, rather than guessing.
 */
export function parseFinancialYear(label: string): number | null {
  const match = /^(\d{4})\/(\d{2})$/.exec(label.trim());
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 10);
}

/**
 * The financial year immediately before the given label, or null when the label is not in
 * canonical form. Used wherever a comparison year has to be named in prose.
 */
export function previousFinancialYear(label: string): string | null {
  const start = parseFinancialYear(label);
  if (start === null) return null;
  return formatFinancialYear(start - 1);
}

/** Human explanation used on /methodology and in chart help text. */
export const FINANCIAL_YEAR_EXPLANATION =
  "The South African Police Service reports crime by financial year, which runs from 1 April to 31 March. 2024/25 therefore covers 1 April 2024 to 31 March 2025.";

export type TrendWindow = "5" | "10" | "all";

export const TREND_WINDOWS: readonly { value: TrendWindow; label: string }[] = [
  { value: "5", label: "5 years" },
  { value: "10", label: "10 years" },
  { value: "all", label: "All" },
];

/** Number of financial years a window covers, or null for the full available history. */
export function trendWindowLength(window: TrendWindow): number | null {
  if (window === "all") return null;
  return Number.parseInt(window, 10);
}
