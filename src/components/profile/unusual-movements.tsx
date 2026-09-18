import type { UnusualMovement } from "@/lib/metrics/history";

const LABELS: Record<UnusualMovement["classification"], string> = {
  normal: "Within the historical range",
  notable: "Notable",
  largest_increase: "Largest recorded increase",
  largest_decrease: "Largest recorded decrease",
  insufficient: "Not classified",
  unavailable: "Not classified",
};

/**
 * Whether the latest year-on-year movement is unusual relative to this series' own history.
 */
export function UnusualMovements({
  movement,
  categoryMovements = [],
}: {
  movement: UnusualMovement;
  categoryMovements?: readonly { label: string; movement: UnusualMovement }[];
}) {
  const unusualCategories = categoryMovements.filter(
    (item) =>
      item.movement.classification === "notable" ||
      item.movement.classification === "largest_increase" ||
      item.movement.classification === "largest_decrease",
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          Latest movement · recorded crime
        </p>
        <p className="mt-1.5 text-base font-medium text-foreground">
          {LABELS[movement.classification]}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{movement.reason}</p>
      </div>

      {unusualCategories.length > 0 ? (
        <ul className="space-y-3 border-t border-border pt-4">
          {unusualCategories.map((item) => (
            <li key={item.label}>
              <p className="text-sm font-medium text-foreground">
                {item.label}
                <span className="ml-2 text-xs font-normal tracking-wide text-muted uppercase">
                  {LABELS[item.movement.classification]}
                </span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.movement.reason}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
