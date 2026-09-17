"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { SearchResult } from "@/lib/data/search";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

/**
 * Autocomplete over stations, municipalities, districts and provinces.
 *
 * Implements the combobox pattern from WAI-ARIA: the input owns the listbox, the active option
 * is advertised through aria-activedescendant, and arrow keys move the selection without moving
 * focus out of the input. Every suggestion states what kind of place it is, so "Kempton Park"
 * the station is never confused with "Kempton Park" the municipality.
 */
export function SearchBox({
  autoFocus = false,
  placeholder = "Search a station, suburb, town or municipality",
  size = "lg",
  className,
  onSelect,
}: {
  autoFocus?: boolean;
  placeholder?: string;
  size?: "md" | "lg";
  className?: string;
  /** When set, the suggestion is handed to the caller instead of navigating. */
  onSelect?: (result: SearchResult) => void;
}) {
  const router = useRouter();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    // Debounced so a typed word issues one request rather than one per keystroke.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { results?: SearchResult[]; error?: string };

        if (!response.ok) {
          setError(
            response.status === 503
              ? "Search is unavailable because no data has been loaded yet."
              : "Search could not be completed. Please try again.",
          );
          setResults([]);
          return;
        }

        setError(null);
        setResults(body.results ?? []);
        setActiveIndex(-1);
        trackEvent("search_performed", { characters: trimmed.length });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("Search could not be completed. Please try again.");
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const select = useCallback(
    (result: SearchResult) => {
      trackEvent("search_result_selected", { type: result.type });
      setOpen(false);
      setQuery("");
      if (onSelect) {
        onSelect(result);
        return;
      }
      router.push(result.href);
    },
    [onSelect, router],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % Math.max(results.length, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
      return;
    }
    if (event.key === "Enter") {
      const active = results[activeIndex] ?? results[0];
      if (active) {
        event.preventDefault();
        select(active);
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showList = open && query.trim().length >= 2;
  const activeId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border border-border bg-surface px-4 transition-colors focus-within:border-accent/60",
          size === "lg" ? "h-14" : "h-11",
        )}
      >
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label="Search for a police station, suburb, municipality, district or province"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delayed so a click on an option is registered before the list unmounts.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted",
            size === "lg" ? "text-base" : "text-sm",
            "[&::-webkit-search-cancel-button]:hidden",
          )}
        />
        {loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />
        ) : null}
      </div>

      <span aria-live="polite" className="sr-only">
        {showList && !loading
          ? results.length === 0
            ? "No matching places found."
            : `${results.length} suggestion${results.length === 1 ? "" : "s"} available.`
          : ""}
      </span>

      {showList ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border-strong bg-surface-raised shadow-2xl shadow-black/60">
          <ul id={listboxId} role="listbox" aria-label="Search suggestions" className="max-h-80 overflow-y-auto">
            {error ? (
              <li className="px-4 py-3 text-sm text-muted">{error}</li>
            ) : results.length === 0 && !loading ? (
              <li className="px-4 py-3 text-sm text-muted">
                No police station, municipality or province matches that name. Suburb names are
                not in the police dataset — if this is a neighbourhood, nearest stations will
                appear after a moment, or search the station name (for example Randburg).
              </li>
            ) : (
              results.map((result, index) => (
                <li
                  key={`${result.type}-${result.href}-${result.label}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    select(result);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 last:border-b-0",
                    index === activeIndex ? "bg-surface-hover" : "bg-transparent",
                  )}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {result.label}
                      </span>
                      <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.6875rem] text-muted">
                        {result.typeLabel}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {result.context}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
