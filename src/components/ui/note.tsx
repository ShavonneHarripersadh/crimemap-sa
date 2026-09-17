import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A disclosure block. Used wherever the interface has to tell the reader something about the
 * data itself: that a figure is partial, that a comparison is not possible, or that a
 * calculation is a CrimeMap SA derivation rather than a SAPS published figure.
 */
export function Note({
  children,
  tone = "info",
  className,
}: {
  children: ReactNode;
  tone?: "info" | "caution";
  className?: string;
}) {
  const Icon = tone === "caution" ? TriangleAlert : Info;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3.5 text-sm leading-relaxed",
        tone === "caution"
          ? "border-increase/25 bg-increase-surface/60 text-increase"
          : "border-border bg-surface-raised/60 text-muted",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="[&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2">
        {children}
      </div>
    </div>
  );
}
