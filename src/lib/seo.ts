import { siteUrl } from "@/lib/env";

export const SITE_NAME = "CrimeMap SA";

/** One public origin. Apex and http hosts redirect here at the platform. */
export const CANONICAL_ORIGIN = "https://www.crimemapsa.co.za";

export function pageTitle(leading: string): string {
  return `${leading} | ${SITE_NAME}`;
}

export interface Crumb {
  readonly name: string;
  readonly path: string;
}

export function breadcrumbList(crumbs: readonly Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: siteUrl(crumb.path),
    })),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl("/"),
    description:
      "Independent presentation of recorded South African Police Service crime statistics by police station precinct. Not an official SAPS service.",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl("/"),
    },
  };
}
