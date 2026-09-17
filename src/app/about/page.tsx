import type { Metadata } from "next";
import Link from "next/link";

import { Note } from "@/components/ui/note";
import { Eyebrow, PageHeader } from "@/components/ui/section";
import { SOURCE_COVERAGE, SOURCE_PRODUCER, SOURCE_UNIT_OF_OBSERVATION } from "@/lib/source";

export const metadata: Metadata = {
  title: "About CrimeMap SA",
  description:
    "CrimeMap SA presents recorded crime statistics published by the South African Police Service. It does not assess safety, predict crime or rank places.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader>
        <Eyebrow>About</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          What CrimeMap SA is
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          An independent presentation of recorded crime statistics from the South African Police
          Service, organised by police station precinct so you can look up a place, see what was
          recorded, and compare areas on the same measures.
        </p>
      </PageHeader>

      <div className="space-y-10 text-sm leading-relaxed text-muted-strong">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">What it shows</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Crimes recorded by police in each station precinct, by financial year.</li>
            <li>How each category has changed, with the figures behind the percentage.</li>
            <li>Where stations are, using the coordinates in the source, not precinct outlines.</li>
            <li>Which source column each displayed figure comes from.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">What it does not show</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Whether an area is safe or dangerous. These figures do not measure that.</li>
            <li>Crime rates per person. The source has no population figures per precinct.</li>
            <li>Any forecast of future crime.</li>
            <li>Any ranking of areas, or any explanation of why a figure moved.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Where the figures come from</h2>
          <p>
            CrimeMap SA shows crimes recorded by {SOURCE_PRODUCER}. Coverage: {SOURCE_COVERAGE}{" "}
            Unit of observation: {SOURCE_UNIT_OF_OBSERVATION} The underlying records are not
            offered for download from this site.
          </p>
          <p>
            <Link
              href="/methodology"
              className="text-accent underline decoration-dotted underline-offset-2"
            >
              How figures are calculated
            </Link>
          </p>
        </section>

        <Note>
          CrimeMap SA is not affiliated with the South African Police Service. Recorded crime is
          not the same as crime that occurred: figures reflect cases reported to and recorded by
          police, so differences between areas can reflect differences in reporting as well as
          differences in offending.
        </Note>
      </div>
    </div>
  );
}
