import { ChangeIndicator } from "@/components/data/change-indicator";
import { Note } from "@/components/ui/note";
import { formatCount } from "@/lib/format";
import { CHANGE_HIGHLIGHT_RULES, rankChanges, type CategoryChange } from "@/lib/metrics/change";

/**
 * The categories that moved most between two financial years.
 *
 * Only changes clearing the documented thresholds appear, which keeps a jump from one case to two
 * out of a panel headed "what's changing". Increases and decreases are shown side by side and
 * given equal weight: this is a description of the figures, not an assessment of the area.
 */
export function WhatsChanging({
  changes,
  financialYear,
  previousFinancialYear,
}: {
  changes: readonly CategoryChange[];
  financialYear: string;
  previousFinancialYear: string | null;
}) {
  const increases = rankChanges(changes, "increase", 5);
  const decreases = rankChanges(changes, "decrease", 5);

  if (previousFinancialYear === null) {
    return (
      <Note>
        {financialYear} is the earliest financial year available for this area, so there is no
        previous year to compare it with.
      </Note>
    );
  }

  if (increases.length === 0 && decreases.length === 0) {
    return (
      <Note>
        No category changed by enough between {previousFinancialYear} and {financialYear} to be
        reported here. A change is only listed when the previous year recorded at least{" "}
        {CHANGE_HIGHLIGHT_RULES.minimumPreviousValue} cases and the movement is at least{" "}
        {CHANGE_HIGHLIGHT_RULES.minimumAbsoluteChange} cases and{" "}
        {CHANGE_HIGHLIGHT_RULES.minimumPercentChange}%.
      </Note>
    );
  }

  const highlighted = [...decreases, ...increases].sort(
    (a, b) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0),
  );

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface-raised">
      {highlighted.map((item) => (
        <li key={item.column} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-foreground">{item.label}</span>
          <span className="flex shrink-0 items-baseline gap-3">
            <span className="tabular hidden text-xs text-muted sm:inline">
              {formatCount(item.previous)} to {formatCount(item.current)}
            </span>
            <ChangeIndicator change={item} size="sm" />
          </span>
        </li>
      ))}
    </ul>
  );
}

