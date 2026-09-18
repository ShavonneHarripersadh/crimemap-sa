import type { Metadata } from "next";
import Link from "next/link";

import { Eyebrow, PageHeader } from "@/components/ui/section";
import { explorableCategories } from "@/lib/crime/taxonomy";

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: "Crime categories in South Africa",
  description:
    "Explore recorded crime in South Africa by category: national trends, provincial breakdowns and historical highs and lows from SAPS station records.",
  alternates: { canonical: "/crime-category" },
};

export default function CrimeCategoryIndexPage() {
  const categories = explorableCategories();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader>
        <Eyebrow>Categories</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Recorded crime by category
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Each page is the national record for one CrimeMap SA category. Composite names such as
          robbery group more than one source column and say so.
        </p>
      </PageHeader>

      <ul className="divide-y divide-border">
        {categories.map((category) => (
          <li key={category.key} className="py-4 first:pt-0">
            <Link
              href={`/crime-category/${category.key}`}
              className="font-medium hover:text-accent"
            >
              {category.label}
            </Link>
            <p className="mt-1 text-sm leading-relaxed text-muted">{category.definition}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
