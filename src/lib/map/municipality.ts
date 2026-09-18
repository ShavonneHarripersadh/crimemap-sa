import {
  calculateChange,
  TREND_BAND_PERCENT,
  type Change,
} from "@/lib/metrics/change";
import type { MapStation } from "@/lib/data/map";

/** Match SAPS local municipality labels to Municipal Demarcation Board names. */

const STRIP =
  /\b(the|city of|local municipality of|local municipality|metropolitan municipality|metro municipality|municipality|lm)\b/g;

const ALIASES: Record<string, string> = {
  solplaatje: "solplaatjie",
  jbmarks: "ventersdorptlokwe",
  fetakgomotubatse: "greatertubatsefetakgomo",
};

export function municipalityKey(name: string | null | undefined): string {
  if (!name) return "";
  const ascii = name.normalize("NFKD").replace(/\p{M}/gu, "");
  const stripped = ascii.toLowerCase().replace(STRIP, " ");
  const compact = stripped.replace(/[^a-z0-9]+/g, "");
  return ALIASES[compact] ?? compact;
}

export function aggregateByMunicipality(
  stations: readonly { localMunicipality: string | null; value: number | null }[],
): Map<string, { value: number; stations: number; label: string }> {
  const totals = new Map<string, { value: number; stations: number; label: string }>();
  for (const station of stations) {
    const key = municipalityKey(station.localMunicipality);
    if (!key) continue;
    const current = totals.get(key);
    const value = Math.max(station.value ?? 0, 0);
    if (current) {
      current.value += value;
      current.stations += 1;
    } else {
      totals.set(key, {
        value,
        stations: 1,
        label: station.localMunicipality ?? key,
      });
    }
  }
  return totals;
}

/** Five quantile classes so one large metro does not paint the whole country one colour. */
export function classBreaks(values: readonly number[]): number[] {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0];
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] ?? 0;
  return [at(0.2), at(0.4), at(0.6), at(0.8)];
}

export function volumeClass(value: number, breaks: readonly number[]): number {
  if (value <= 0) return 0;
  if (value <= (breaks[0] ?? 0)) return 0;
  if (value <= (breaks[1] ?? 0)) return 1;
  if (value <= (breaks[2] ?? 0)) return 2;
  if (value <= (breaks[3] ?? 0)) return 3;
  return 4;
}

/**
 * Year-on-year classes used on the map. Documented on /methodology.
 * Strong movements are 10% or more; the inner band matches TREND_BAND_PERCENT.
 */
export const CHANGE_MAP_STRONG_PERCENT = 10;

export type ChangePaintClass =
  | "unavailable"
  | "strong_decrease"
  | "decrease"
  | "unchanged"
  | "increase"
  | "strong_increase";

export function changePaintClass(change: Change): ChangePaintClass {
  if (change.state !== "ok" || change.percentChange === null || change.lowBase) {
    return "unavailable";
  }
  const percent = change.percentChange;
  if (percent <= -CHANGE_MAP_STRONG_PERCENT) return "strong_decrease";
  if (percent < -TREND_BAND_PERCENT) return "decrease";
  if (percent > CHANGE_MAP_STRONG_PERCENT) return "strong_increase";
  if (percent > TREND_BAND_PERCENT) return "increase";
  return "unchanged";
}

export interface MunicipalityChangeRow {
  readonly label: string;
  readonly stations: number;
  readonly comparableStations: number;
  readonly current: number | null;
  readonly previous: number | null;
  readonly change: Change;
  readonly paint: ChangePaintClass;
}

/**
 * Municipality year-on-year change from stations that have a figure in both years.
 * Missing station-years are omitted rather than treated as zero.
 */
export function aggregateMunicipalityChange(
  stations: readonly MapStation[],
): Map<string, MunicipalityChangeRow> {
  const groups = new Map<
    string,
    {
      label: string;
      stations: number;
      current: number;
      previous: number;
      comparable: number;
    }
  >();

  for (const station of stations) {
    const key = municipalityKey(station.localMunicipality);
    if (!key) continue;
    const group = groups.get(key) ?? {
      label: station.localMunicipality ?? key,
      stations: 0,
      current: 0,
      previous: 0,
      comparable: 0,
    };
    group.stations += 1;
    if (station.value !== null && station.previousValue !== null) {
      group.current += station.value;
      group.previous += station.previousValue;
      group.comparable += 1;
    }
    groups.set(key, group);
  }

  const result = new Map<string, MunicipalityChangeRow>();
  for (const [key, group] of groups) {
    const change =
      group.comparable === 0
        ? calculateChange(null, null)
        : calculateChange(group.current, group.previous);
    result.set(key, {
      label: group.label,
      stations: group.stations,
      comparableStations: group.comparable,
      current: group.comparable === 0 ? null : group.current,
      previous: group.comparable === 0 ? null : group.previous,
      change,
      paint: changePaintClass(change),
    });
  }
  return result;
}
