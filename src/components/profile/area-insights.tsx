import type { Insight } from "@/lib/metrics/insights";

export function AreaInsights({ insights }: { insights: readonly Insight[] }) {
  if (insights.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        There is no additional historical observation to add beyond the figures on this page.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {insights.map((insight) => (
        <li key={insight.id} className="flex gap-3 text-sm leading-relaxed">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          <span className="text-muted-strong">{insight.text}</span>
        </li>
      ))}
    </ul>
  );
}
