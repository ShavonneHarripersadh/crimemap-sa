/**
 * Recorded-volume colours: green (fewer cases) through yellow and orange to red (more cases).
 * This is a count ramp, not a safety score.
 */
export const VOLUME_CLASS_COLORS = [
  "#2f9e5f",
  "#9cc93a",
  "#f0d03a",
  "#f08a2a",
  "#d23b2d",
] as const;

export function volumeClassColor(index: number): string {
  const clamped = Math.min(Math.max(Math.round(index), 0), VOLUME_CLASS_COLORS.length - 1);
  return VOLUME_CLASS_COLORS[clamped] ?? VOLUME_CLASS_COLORS[0];
}

export function volumeColor(t: number): string {
  const x = Math.min(Math.max(t, 0), 1) * (VOLUME_CLASS_COLORS.length - 1);
  const left = Math.floor(x);
  const right = Math.min(left + 1, VOLUME_CLASS_COLORS.length - 1);
  const u = x - left;
  const a = parseRgb(VOLUME_CLASS_COLORS[left] ?? "#2f9e5f");
  const b = parseRgb(VOLUME_CLASS_COLORS[right] ?? "#d23b2d");
  const r = Math.round(a[0] + (b[0] - a[0]) * u);
  const g = Math.round(a[1] + (b[1] - a[1]) * u);
  const bl = Math.round(a[2] + (b[2] - a[2]) * u);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Diverging colours for year-on-year change. Decrease is cooler, increase is warmer.
 * Grey is used when a percentage cannot be calculated. This is not a safety scale.
 */
export const CHANGE_CLASS_COLORS = {
  unavailable: "#d7d3c8",
  strong_decrease: "#3d6f8c",
  decrease: "#7fa3b5",
  unchanged: "#c4bfb0",
  increase: "#d4a05c",
  strong_increase: "#c45c38",
} as const;

export function changeClassColor(
  paint: keyof typeof CHANGE_CLASS_COLORS,
): string {
  return CHANGE_CLASS_COLORS[paint];
}

function parseRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}
