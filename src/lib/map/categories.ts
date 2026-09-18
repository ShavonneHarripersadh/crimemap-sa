import { CRIME_CATEGORIES, HEADLINE_COMMUNITY_COLUMNS } from "@/lib/crime/taxonomy";

export interface MapCategoryOption {
  readonly value: string;
  readonly label: string;
  readonly definition: string;
}

/**
 * Categories offered on the map: the headline total plus the 17 community-reported crimes.
 * Subcategories are excluded so a parent and its parts are never both mapped.
 */
export function mapCategories(): MapCategoryOption[] {
  const options: MapCategoryOption[] = [
    {
      value: "total_recorded_crime",
      label: "All recorded crime",
      definition:
        "The sum of the 17 community-reported serious crime categories. Crimes detected through police action, such as drug offences, are excluded because they largely reflect police activity.",
    },
  ];

  for (const column of HEADLINE_COMMUNITY_COLUMNS) {
    const category = CRIME_CATEGORIES.find((item) => item.name === column);
    if (!category) continue;

    const hasSubcategories = CRIME_CATEGORIES.some((item) => item.parent === column);

    options.push({
      value: column,
      label: category.shortLabel,
      definition: hasSubcategories
        ? `Cases the source records as ${category.label.toLowerCase()}. This figure already includes the subcategories the source reports separately, which are not offered here so that a case is never counted twice.`
        : `Cases the source records as ${category.label.toLowerCase()}.`,
    });
  }

  return options;
}
