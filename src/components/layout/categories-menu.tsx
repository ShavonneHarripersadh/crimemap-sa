"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function CategoriesMenu({
  items,
}: {
  items: readonly { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-muted-strong transition-colors hover:bg-surface-hover hover:text-foreground sm:px-3",
          open ? "bg-surface-hover text-foreground" : null,
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        Categories
        <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : null)} aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute top-full right-0 z-50 mt-1 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border-strong bg-surface-raised shadow-panel sm:right-auto sm:left-0"
        >
          <Link
            href="/crime-category"
            role="menuitem"
            className="block border-b border-border px-3 py-2.5 text-sm font-medium hover:bg-surface-hover"
            onClick={() => setOpen(false)}
          >
            All categories
          </Link>
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  className="block px-3 py-2 text-sm text-muted-strong hover:bg-surface-hover hover:text-foreground"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
