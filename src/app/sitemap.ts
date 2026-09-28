import type { MetadataRoute } from "next";

import { explorableCategories } from "@/lib/crime/taxonomy";
import { getProvinceOverviews } from "@/lib/data/aggregates";
import { getAllStationRoutes } from "@/lib/data/stations";
import { siteUrl } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    "/",
    "/map",
    "/compare",
    "/methodology",
    "/about",
    "/crime-category",
  ].map((path) => ({
    url: siteUrl(path),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const categoryPages: MetadataRoute.Sitemap = explorableCategories().map((category) => ({
    url: siteUrl(`/crime-category/${category.key}`),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const [provinces, stations] = await Promise.all([getProvinceOverviews(), getAllStationRoutes()]);

  const provincePages: MetadataRoute.Sitemap = provinces.ok
    ? provinces.data.map((province) => ({
        url: siteUrl(`/crime/${province.slug}`),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
    : [];

  // Stations without a province have no single public URL, so they are left out.
  // Suburb /place URLs are geocoded on demand and are not a stored directory.
  const stationPages: MetadataRoute.Sitemap = stations.ok
    ? stations.data.flatMap((station) => {
        if (!station.provinceSlug) return [];
        return [
          {
            url: siteUrl(`/crime/${station.provinceSlug}/${station.slug}`),
            ...(station.updatedAt ? { lastModified: new Date(station.updatedAt) } : {}),
            changeFrequency: "weekly" as const,
            priority: 0.6,
          },
        ];
      })
    : [];

  return [...staticPages, ...categoryPages, ...provincePages, ...stationPages];
}
