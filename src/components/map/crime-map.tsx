"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

const CrimeMapView = dynamic(
  () => import("@/components/map/crime-map-view").then((mod) => mod.CrimeMapView),
  {
    ssr: false,
    loading: () => (
      <div
        className="map-frame overflow-hidden rounded-xl border border-border"
        role="status"
        aria-label="Loading map"
      />
    ),
  },
);

/**
 * Client-only map. Leaflet touches `window` on import, so this wrapper skips server rendering.
 */
export function CrimeMap({
  className,
  chrome = true,
  ...props
}: {
  financialYear: string | null;
  category: string;
  categoryLabel: string;
  className?: string;
  chrome?: boolean;
  focus?: { slug: string; longitude: number; latitude: number } | null;
}) {
  return (
    <div className={cn(className)}>
      <CrimeMapView chrome={chrome} {...props} />
    </div>
  );
}
