import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-raised text-muted-strong",
        accent: "border-accent/30 bg-accent/10 text-accent",
        increase: "border-increase/25 bg-increase-surface text-increase",
        decrease: "border-decrease/25 bg-decrease-surface text-decrease",
        warning: "border-increase/40 bg-increase-surface text-increase",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
