import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/lib/env";
import { websiteJsonLd } from "@/lib/seo";
import { THEME_BOOTSTRAP } from "@/lib/theme";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: {
    default: "CrimeMap SA — South African Crime Statistics & Maps",
    template: "%s — CrimeMap SA",
  },
  description:
    "Recorded South African crime statistics from the South African Police Service, by police precinct. Maps, trends since 2005/06, category breakdowns and area comparisons.",
  applicationName: "CrimeMap SA",
  openGraph: {
    type: "website",
    siteName: "CrimeMap SA",
    locale: "en_ZA",
    url: siteUrl("/"),
    title: "CrimeMap SA — South African Crime Statistics & Maps",
    description:
      "Recorded crime statistics from the South African Police Service, by police precinct. Maps, trends and comparisons. Not an official SAPS service.",
  },
  twitter: { card: "summary" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en-ZA"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <JsonLd data={websiteJsonLd()} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-foreground"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
