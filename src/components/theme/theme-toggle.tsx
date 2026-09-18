"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { trackEvent } from "@/lib/analytics";
import { applyTheme, readStoredTheme, type Theme } from "@/lib/theme";

/**
 * Light is the default. Dark is an explicit choice, remembered locally.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-strong transition-colors hover:bg-surface-hover hover:text-foreground"
      aria-label={next === "dark" ? "Switch to dark theme" : "Switch to light theme"}
      onClick={() => {
        setTheme(next);
        applyTheme(next);
        trackEvent("theme_changed", { theme: next });
      }}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
