"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { SearchBox } from "@/components/search/search-box";
import { trackEvent } from "@/lib/analytics";
import type { SearchResult } from "@/lib/data/search";

export interface CompareSelection {
  readonly slug: string;
  readonly name: string;
  readonly href: string;
}

const MAX_AREAS = 3;

export function ComparePicker({ selected }: { selected: readonly CompareSelection[] }) {
  const router = useRouter();
  const pathname = usePathname();

  function replace(slugs: string[]) {
    const unique = [...new Set(slugs)].slice(0, MAX_AREAS);
    const href = unique.length > 0 ? `${pathname}?areas=${unique.join(",")}` : pathname;
    router.replace(href);
  }

  function onSelect(result: SearchResult) {
    if (result.type !== "station" && result.type !== "nearby_station") return;
    const slug = result.href.split("/").filter(Boolean).at(-1);
    if (!slug) return;
    if (selected.some((item) => item.slug === slug)) return;
    trackEvent("comparison_area_added", { count: selected.length + 1 });
    replace([...selected.map((item) => item.slug), slug]);
  }

  return (
    <div className="space-y-4">
      {selected.length < MAX_AREAS ? (
        <SearchBox
          size="lg"
          placeholder={
            selected.length === 0
              ? "Add a police station to compare"
              : "Add another police station"
          }
          onSelect={onSelect}
        />
      ) : (
        <p className="text-sm text-muted">
          Three precincts is the maximum. Remove one to add a different station.
        </p>
      )}

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <li
              key={item.slug}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm"
            >
              <Link href={item.href} className="font-medium hover:text-accent">
                {item.name}
              </Link>
              <button
                type="button"
                aria-label={`Remove ${item.name} from the comparison`}
                onClick={() =>
                  replace(selected.filter((entry) => entry.slug !== item.slug).map((entry) => entry.slug))
                }
                className="rounded-full p-0.5 text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
