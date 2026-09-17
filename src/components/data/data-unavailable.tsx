import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { DataError } from "@/lib/data/result";

/**
 * What the reader sees when a figure cannot be shown.
 *
 * Each case says plainly why, and never renders a zero or an empty chart in place of data that
 * does not exist.
 */
export function DataUnavailable({
  error,
  context,
  showDetail = false,
}: {
  error: DataError;
  context?: string;
  showDetail?: boolean;
}) {
  const copy =
    error.kind === "not_configured"
      ? {
          title: "No data has been loaded yet",
          body: "CrimeMap SA is not connected to a database with crime records in it, so there is nothing to show. Once the South African Police Service data has been loaded, figures will appear here.",
        }
      : error.kind === "not_found"
        ? {
            title: "Nothing recorded for this selection",
            body:
              context ??
              "The source data does not contain records for this area or financial year.",
          }
        : {
            title: "These figures could not be loaded",
            body: "Something went wrong reading the crime records. Reloading the page usually resolves it.",
          };

  return (
    <Card className="p-8 text-center">
      <p className="text-base font-semibold text-foreground">{copy.title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">{copy.body}</p>
      {showDetail ? (
        <p className="mx-auto mt-3 max-w-lg font-mono text-xs break-words text-muted/70">
          {error.message}
        </p>
      ) : null}
      <p className="mt-4 text-sm">
        <Link href="/methodology" className="text-accent underline decoration-dotted">
          Read how CrimeMap SA handles missing data
        </Link>
      </p>
    </Card>
  );
}
