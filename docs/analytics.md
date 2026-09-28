# CrimeMap SA analytics

Traffic measurement uses two outside systems. CrimeMap SA does not store page views or events in Supabase.

| Question | System |
| --- | --- |
| Visitors, page views, referrers, top pages, countries, devices | Vercel Web Analytics |
| Google impressions, clicks, queries, average position, indexed pages | Google Search Console |
| Which places and features people use | Vercel custom events, listed below |

## Architecture

`@vercel/analytics` is mounted once, as `<Analytics />` in `src/app/layout.tsx`. The browser loads `/_vercel/insights/script.js` after hydration. `src/lib/analytics.ts` calls `track()` for the events below.

The same event and payload inside one second is sent once, so a React remount does not double-count.

There is no analytics table in the crime database. Vercel already aggregates visitors, page views, referrers, and custom events. A Supabase copy would duplicate that and would mix product telemetry with crime records. Add a separate store only if a report needs a query Vercel cannot answer.

## What Vercel Web Analytics measures

In the Vercel project **crimemap-sa**, open Analytics:

- visitors and page views
- returning visitors, as Vercel defines them
- top pages
- referrers
- countries and devices
- custom events and their properties

The script is one deferred file. It is not a second tag manager. Map pages do not load an extra analytics library.

## What Search Console measures

After the domain is verified and the sitemap is submitted:

- indexed pages
- impressions, clicks, queries, and average position

Those numbers stay in Search Console. See the setup steps in `docs/seo-audit.md`.

## Custom events

| Event | When | Properties |
| --- | --- | --- |
| `search_performed` | A suggestion is chosen, or a query returns nothing | `search_type` (`lookup`), `entity_type`, `entity`, `province` when the URL has one, `result_count`. Unmatched queries add `unmatched_query` and set `entity_type` to `none`. |
| `area_viewed` | A `/place/` page has a nearest precinct | `area`, `precinct`, `province` |
| `crime_category_viewed` | A category page loads | `category` |
| `comparison_viewed` | A comparison has at least two precincts | `comparison_type` (`precinct`), `entity_a`, `entity_b`, `entity_c` |
| `map_viewed` | `/map` loads | none |
| `map_filter_changed` | Period, category, or analysis mode changes on the map | `period`, `category`, `analysis_mode` (`volume` or `yoy`) |

`entity_type` uses the search result type: `place`, `station`, `nearby_station`, `province`, `local_municipality`, or `district_municipality`. A geocoded suburb or town is `place`, because the geocoder does not tell those apart.

`entity` is the public slug (`randburg`, `bromhof`), not a database id.

Typing in the search box does not emit an event on each pause. Only a chosen result, or a query with zero results, does.

## Privacy

Do not send:

- names of people, email addresses, or phone numbers
- IP addresses into Supabase
- coordinates
- internal entity ids

`unmatched_query` is the place text the reader typed, lowercased and trimmed, at most 80 characters. Values containing `@` or a run of 7 digits are dropped.

## How to read it

1. Vercel → project **crimemap-sa** → Analytics, for visits and the events above.
2. Search Console → Performance and Pages, for Google.

A local production check on 28 September 2026 saw one analytics script and these payloads:

- `search_performed` with `entity_type=place`, `entity=bromhof`, `result_count=1`
- `area_viewed` with `area=bromhof`, `precinct=randburg`, `province=gauteng`
- `map_filter_changed` with `period=2024/25`, `category=total_recorded_crime`, `analysis_mode=volume`

The Vercel dashboard was not opened in this session.

## Later dashboard

An in-app analytics page is not built. The app has no admin UI. If one is added later, read Vercel's aggregated analytics API from that admin route. Do not copy events into the crime database to power it.
