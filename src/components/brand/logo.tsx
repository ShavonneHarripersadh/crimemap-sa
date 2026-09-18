/**
 * CrimeMap SA mark: a folded map with a pin. Fills follow the theme so it works light and dark.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M7.5 11.2 16 6.5l8.5 4.7v11.6L16 27.5l-8.5-4.7V11.2Z"
        fill="var(--accent-foreground)"
        opacity="0.22"
      />
      <path
        d="M16 8.2 24 12.6v8.8L16 25.8 8 21.4v-8.8L16 8.2Z"
        fill="none"
        stroke="var(--accent-foreground)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M16 8.2v17.6M8 12.6l8 4.4 8-4.4"
        fill="none"
        stroke="var(--accent-foreground)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="15.2" r="3.1" fill="var(--mark)" />
      <circle cx="16" cy="15.2" r="1.15" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="size-8 shrink-0" />
      {compact ? null : (
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">
          CrimeMap <span className="text-muted-strong">SA</span>
        </span>
      )}
    </span>
  );
}
