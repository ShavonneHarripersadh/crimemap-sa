"use client";

import { useEffect } from "react";

import { trackEvent, type AnalyticsEvent, type AnalyticsProperties } from "@/lib/analytics";

export function TrackOnMount({
  event,
  properties,
}: {
  event: AnalyticsEvent;
  properties?: AnalyticsProperties;
}) {
  const signature = JSON.stringify(properties ?? null);

  useEffect(() => {
    trackEvent(event, properties);
    // signature is the stable snapshot of properties for this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, signature]);

  return null;
}
