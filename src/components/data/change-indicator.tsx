import { cn } from "@/lib/utils";
import {
  describeChangeState,
  directionIndicator,
  directionWord,
  formatAbsoluteChange,
  formatChange,
} from "@/lib/format";
import { trendDirection, type Change } from "@/lib/metrics/change";

/**
 * The single place a change is rendered.
 *
 * Direction is always given three ways at once: an arrow, a signed percentage and, for screen
 * readers, a word. Colour only reinforces what the text already says, so the meaning survives
 * for a reader who cannot distinguish the two hues.
 */
export function ChangeIndicator({
  change,
  size = "md",
  showAbsolute = false,
  className,
}: {
  change: Change;
  size?: "sm" | "md" | "lg";
  showAbsolute?: boolean;
  className?: string;
}) {
  const direction = trendDirection(change);

  const tone =
    direction === "increase"
      ? "text-increase"
      : direction === "decrease"
        ? "text-decrease"
        : "text-neutral";

  const sizes = {
    sm: "text-xs gap-1",
    md: "text-sm gap-1.5",
    lg: "text-base gap-2",
  } as const;

  return (
    <span
      className={cn("inline-flex items-baseline tabular", sizes[size], tone, className)}
      title={describeChangeState(change)}
    >
      <span aria-hidden>{directionIndicator(direction)}</span>
      <span className="font-medium">{formatChange(change)}</span>
      {showAbsolute && change.absoluteChange !== null ? (
        <span className="text-muted">({formatAbsoluteChange(change)})</span>
      ) : null}
      {change.lowBase && change.state === "ok" ? (
        <span
          className="rounded border border-border px-1 text-[0.625rem] leading-4 text-muted"
          title="This percentage is based on a small number of cases in the previous year, so it can look dramatic for a change of only a few cases."
        >
          small base
        </span>
      ) : null}
      <span className="sr-only">
        {" "}
        {directionWord(direction)}. {describeChangeState(change)}
      </span>
    </span>
  );
}
