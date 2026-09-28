# CrimeMap SA — SEO audit

**Date:** 28 September 2026.

**Production origin:** https://www.crimemapsa.co.za/

`crimemap-sa.vercel.app` is not the public identity. The audit read the live site first. The code changes below were then checked on a local production build. They are not on the live domain until this revision is deployed.

---

## 1. Current production domain

The live host is already the www HTTPS origin.

| Request | Result on 28 September 2026 |
| --- | --- |
| `https://www.crimemapsa.co.za/` | 200 |
| `https://crimemapsa.co.za/` | 308 to `https://www.crimemapsa.co.za/` |
| `http://www.crimemapsa.co.za/` | 308 to `https://www.crimemapsa.co.za/` |
| `http://crimemapsa.co.za/` | 308 to `https://crimemapsa.co.za/`, which then 308s to www |

That is two hops from HTTP on the apex, and it does not loop. Trailing slashes 308 to the slash-free path (`/map/` → `/map`).

`https://crimemap-sa.vercel.app/` still returned **200** with the same robots file. It is a second host. The app now permanently redirects that host to www. Preview URLs are left alone.

`NEXT_PUBLIC_SITE_URL` on the live deployment is `https://www.crimemapsa.co.za`. The live sitemap and robots file use that origin. Local `.env` stays on localhost, which is why a local production build emits localhost canonicals.

## 2. Current indexing status

Not verified in Google Search Console. There is no verification file or meta tag in the repository, and this audit had no Search Console access.

A public `site:crimemapsa.co.za` query on 28 September 2026 returned no listed pages. That is not an index count.

What the live HTML did show, before this change:

- `robots` meta is `index, follow`.
- `/robots.txt` allows `/` and disallows `/api/`.
- The homepage `<title>` was `CrimeMap SA — South African recorded crime statistics`.
- The homepage had **no** `<link rel="canonical">`.
- `/place/bromhof` was reachable and titled `bromhof crime overview — CrimeMap SA`, using the raw URL text.
- `/crime/gauteng/randburg` was titled `Randburg crime statistics — CrimeMap SA`, with a canonical on www.

So a crawler was not blocked. The likely reasons for a weak search presence are:

1. Suburb URLs such as `/place/bromhof` are created by search, not by a link or a sitemap entry. Google has no crawl path to them.
2. The homepage, the page that should match "CrimeMap SA", had no canonical while `crimemap-sa.vercel.app` also returned 200.
3. A crawled suburb page would have had a lowercase title and the site-wide Open Graph title, not a Bromhof-specific one.
4. The sitemap has not been confirmed as submitted.

## 3. Robots status

Live file, unchanged in substance:

```
User-Agent: *
Allow: /
Disallow: /api/

Sitemap: https://www.crimemapsa.co.za/sitemap.xml
```

Public pages are allowed. API routes are not. There is no admin page in the app router.

## 4. Sitemap status

Live `https://www.crimemapsa.co.za/sitemap.xml` returned 200 and **972** URLs, all on `https://www.crimemapsa.co.za`:

| Kind | Count |
| --- | --- |
| Home, map, compare, methodology, about | 5 |
| Category index and category pages | 15 |
| Province pages | 9 |
| Precinct pages | 943 |

`/crime/gauteng/randburg` is included. `/place/bromhof` is not.

Suburb pages stay out of the sitemap. A `/place/` URL is a geocoded name plus the nearest station. It is not a stored directory of suburbs. Putting guessed suburbs in the sitemap would publish pages that may not resolve.

Stations with no `province_slug` stay out as well. They have no single public URL.

`lastmod` is no longer set to the time of the request. A fresh timestamp on every fetch tells Google that every page changed. Precinct `lastmod` is the station `updated_at` when that value exists.

## 5. Metadata status

Live gaps, and what the local production build now serves:

| Page | Live title before this change | Title after this change |
| --- | --- | --- |
| Home | CrimeMap SA — South African recorded crime statistics | CrimeMap SA — South African Crime Statistics & Maps |
| `/place/bromhof` | bromhof crime overview | Bromhof Crime Statistics & Trends \| CrimeMap SA |
| `/crime/gauteng/randburg` | Randburg crime statistics | Randburg Crime Statistics & Trends \| CrimeMap SA |
| `/crime/gauteng` | Gauteng recorded crime | Gauteng Crime Statistics \| CrimeMap SA |
| `/crime-category/vehicle_theft` | (category) in South Africa | Vehicle theft Crime Statistics South Africa \| CrimeMap SA |

Bromhof's description now says: "Crime data shown for Bromhof is reported at police-precinct level using the nearest precinct, Randburg. These figures are not a count of incidents inside Bromhof."

That matches the implementation. `geocodeSouthAfricanPlace` asks OpenStreetMap for a South African point. `getNearbyStations` picks the closest station with coordinates. The page already said the Randburg precinct is about 3.5 km away and is not a count of incidents inside Bromhof. It is not an official suburb-to-precinct assignment. The footer no longer says the precinct "covers" the place.

A place that cannot be geocoded, or that has no nearby station, is `noindex`. Mixed-case place URLs redirect to the lowercase path so `/place/Bromhof` and `/place/bromhof` are one URL. Search results now link straight to the lowercase path.

Precinct H1 is now "{name} police precinct". Province pages keep the province name as the H1 and carry the year, total, and station count in the description. They already list every precinct, so they are not empty doorway pages.

## 6. Canonical status

Canonicals are path-absolute and resolved with `metadataBase` from `NEXT_PUBLIC_SITE_URL`.

On the live site, precinct, place, and category pages already canonicalised to www. The homepage did not. It does now.

Compare keeps one canonical, `/compare`, including when `?areas=` is present. Category year and province query strings stay on the category path canonical.

## 7. Structured-data status

Present, and checked by parsing the JSON-LD on the local production pages:

- `WebSite` on every page, with CrimeMap SA as publisher. The description says it is not an official SAPS service.
- `BreadcrumbList` on place, precinct, province, and category pages. Bromhof's trail is Home → Gauteng → Randburg police precinct → Bromhof.
- `Dataset` on `/methodology`, naming the SAPS annual crime records as the dataset and SAPS as creator. CrimeMap SA is not described as the producer.

No ratings, reviews, or safety scores.

## 8. Internal-linking status

Already present: homepage to provinces, province pages to precincts, precinct breadcrumbs to the province, footer to map, categories, compare, methodology, and about.

Added:

- Homepage links to every published crime category.
- Precinct pages link to those category pages and to methodology.
- Place breadcrumbs link to the province and the nearest precinct.
- Category province names link to `/crime/{province}`.
- Methodology links to the map and the category index.

Suburb pages are still only created when someone searches. They are not a crawlable directory. That is deliberate.

## 9. Dynamic page crawlability

Precinct, province, and category pages are server-rendered HTML with titles, H1s, and links. The live Randburg and Bromhof responses were full documents, not empty client shells.

`/place/[place]` is server-rendered too, but only after a request. Nothing in the sitemap or the static HTML points at a specific suburb, so a crawler will not discover Bromhof by walking the site.

## 10. Search-intent coverage

| Query | Page that can answer it |
| --- | --- |
| CrimeMap SA, CrimeMapSA, CrimeMap South Africa | Homepage title |
| South African crime statistics, crime map South Africa | Homepage, `/map` |
| Gauteng crime statistics | `/crime/gauteng` |
| Johannesburg crime statistics | No city page. Johannesburg is not a province. Precincts in the city are individual `/crime/gauteng/{station}` pages. |
| Randburg crime statistics, Randburg SAPS crime statistics | `/crime/gauteng/randburg` |
| Bromhof crime statistics | `/place/bromhof`, once something links to it or it is inspected directly |
| Vehicle theft / burglary statistics South Africa | `/crime-category/vehicle_theft`, `/crime-category/burglary` |
| Crime trends South Africa | Category pages and precinct trend sections |

The copy stays on recorded counts. It does not say an area is safe.

## 11. Google Search Console setup

Do this in [Google Search Console](https://search.google.com/search-console). It cannot be finished from the repository.

1. Add the domain property `crimemapsa.co.za`, or the URL-prefix property `https://www.crimemapsa.co.za/`. The domain property covers www and the apex. DNS verification is the reliable method.
2. Do not add `crimemap-sa.vercel.app` as the property you report on.
3. After deploy, submit `https://www.crimemapsa.co.za/sitemap.xml`.
4. URL Inspection on `/`, `/place/bromhof`, and `/crime/gauteng/randburg`.
5. Request indexing for those three if Inspection shows they are not indexed.
6. Use the Pages report for the index count and the Performance report for queries, impressions, clicks, and position.

Search Console is the source for those Google metrics. This app does not store them.

## 12. Vercel Analytics status

`@vercel/analytics` 2.0.1 is installed. `<Analytics />` is mounted once in the root layout. The live deployment already serves `/_vercel/insights/script.js` with HTTP 200.

On the local production build the script is injected once, at `/_vercel/insights/script.js`. It is not in the server HTML; the client adds it. One tag was present on the category page.

## 13. Analytics event taxonomy

See `docs/analytics.md`. Events go to Vercel. They are not written to Supabase.

## 14. Privacy

Events carry a public slug or a place name the reader chose (`bromhof`, `randburg`, `gauteng`). They do not carry account fields, email, phone, an internal numeric id, or a coordinate. An unmatched search stores the normalised place query only when it does not look like an email address or a long digit string. Vercel, not CrimeMap SA, holds IP-level visit data for its own aggregate reports.

## 15. Changes implemented

- Homepage canonical, title, description, and Open Graph.
- Unique titles, descriptions, and Open Graph on place, precinct, province, category, map, compare, about, and methodology pages.
- Place metadata names the nearest precinct and refuses to call it official. Unresolved places are `noindex`. Place URLs canonicalise to lowercase.
- Precinct H1 includes "police precinct".
- Breadcrumb and dataset JSON-LD.
- Homepage, precinct, category, and methodology links as described above.
- Footer wording matches nearest-precinct, not an official boundary.
- Permanent redirect from `crimemap-sa.vercel.app` to www.
- Sitemap no longer stamps every URL with the current time.
- Analytics events narrowed to the taxonomy in `docs/analytics.md`. Keystroke-by-keystroke search events were removed.
- Search result links for places use the lowercase canonical path.

## 16. Remaining work

Deploy this revision. Until then the live titles, homepage canonical, and vercel.app behaviour stay as they were on 28 September 2026.

Then:

1. Verify the domain in Search Console and submit the sitemap.
2. Inspect `/`, `/place/bromhof`, and `/crime/gauteng/randburg`.
3. Confirm Vercel Web Analytics shows the new events after real visits. A local check saw `search_performed`, `area_viewed`, and `map_filter_changed`. The Vercel dashboard itself was not opened; the project API token for this session could not read the team.
4. Decide later whether a small set of suburbs should be linked from precinct pages. That needs a real list of places, not a generated directory.

Do not add suburb URLs to the sitemap until those places are real, linked, and checked.
