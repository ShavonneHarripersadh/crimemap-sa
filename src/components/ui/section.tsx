import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ className, ...props }: ComponentProps<"header">) {
  return <header className={cn("mb-8", className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "text-xs font-medium tracking-[0.14em] text-muted uppercase",
        className,
      )}
      {...props}
    />
  );
}
