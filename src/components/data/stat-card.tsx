import type { ReactNode } from "react";

import { ChangeIndicator } from "@/components/data/change-indicator";
import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import type { Change } from "@/lib/metrics/change";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  change,
  caption,
  footnote,
  className,
}: {
  label: string;
  value: number | null | string;
  change?: Change;
  caption?: ReactNode;
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="tabular mt-2 text-3xl font-semibold tracking-tight text-foreground">
        {typeof value === "string" ? value : formatCount(value)}
      </p>
      {change ? (
        <p className="mt-1.5">
          <ChangeIndicator change={change} showAbsolute />
        </p>
      ) : null}
      {caption ? <p className="mt-2 text-sm leading-relaxed text-muted">{caption}</p> : null}
      {footnote ? <p className="mt-3 text-xs leading-relaxed text-muted">{footnote}</p> : null}
    </Card>
  );
}
