"use client";

import { useEffect } from "react";

import { trackEvent, type AnalyticsEvent } from "@/lib/analytics";

export function TrackOnMount({
  event,
  properties,
}: {
  event: AnalyticsEvent;
  properties?: Record<string, string | number | boolean | null>;
}) {
  useEffect(() => {
    trackEvent(event, properties);
  }, [event]);

  return null;
}
