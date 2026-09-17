import { ChangeIndicator } from "@/components/data/change-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChangeList
        title="Recorded more often"
        items={increases}
        emptyText={`No category increased by enough to be reported between ${previousFinancialYear} and ${financialYear}.`}
      />
      <ChangeList
        title="Recorded less often"
        items={decreases}
        emptyText={`No category decreased by enough to be reported between ${previousFinancialYear} and ${financialYear}.`}
      />
    </div>
  );
}

function ChangeList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: readonly CategoryChange[];
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted">{emptyText}</p>
        ) : (
          <ol className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.column} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-sm text-foreground">{item.label}</span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="tabular text-xs text-muted">
                    {formatCount(item.previous)} → {formatCount(item.current)}
                  </span>
                  <ChangeIndicator change={item} size="sm" />
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
