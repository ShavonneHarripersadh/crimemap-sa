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
