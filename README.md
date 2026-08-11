# Hokkaido 2026 September Trip — Candidate Experience Framework

This repository is a long-lived, unranked travel research inventory and interactive map for 2026-09-05 through 2026-09-18. Phase A migrates the application from the historical flat 42-record file to the 77-record Candidate Experience framework.

## Authoritative data and separation

The migration input of record is the external `../data/hokkaido_places_master.json`. The application consumes its exact repository mirror at `data/hokkaido_places_master.json`; this is the only current research canonical file in the implementation. Do not recreate `data/places_master.json`, `master_v2`, or another competing current master.

- `data/hokkaido_places_master.json` — current nested Candidate Experience canonical (77 Candidates).
- `data/candidate_research_schema.md` — research and append-only merge contract.
- `data/research_batches_level1.json` — 10 exact-ID Level 1 batches.
- `data/candidate_locations.json` — separate technical coordinate overlay; all 77 Candidates have Google Maps-verified coordinates. The 42 historical points are preserved, and 35 newer points were verified on 2026-08-10.
- `data/google_maps_area_catalog.json` — 20 Google Maps-verified city/area search entities. It is a search catalog only: no area is pre-added and no Candidate is pre-assigned.
- `data/google_maps_coordinate_review_current.json` — title, address, prefecture, coordinate, Place ID, query, scope, and automated cross-check evidence for the 35 newer points.
- `data/routes.json` — stable-ID route container, currently intentionally unplanned.
- `data/history/` — former flat 42-record canonical, former schema, and coordinate-review artifacts. Historical only.
- `research_inbox/` — incoming independent research deltas. Applying never deletes an inbox file.
- `research_archive/` — immutable raw/applied research artifacts.

The current structural invariants are 77 inventory entities, 73 Level 1-eligible subjects, 4 aggregate context modules, 12 Japan Challenger/Near-miss modules, and 10 Level 1 batches. Every eligible ID occurs in exactly one batch. `R2-KUS-004` and `R2-KUS-005` remain distinct restaurants.

Coordinates are not part of the research schema and must never be guessed into it. A verified location row records `candidate_id`, latitude/longitude, point scope, verification status, provider, provider Place ID, source URL, and verification timestamp. Concrete venues use their exact entity; transport and regional modules use documented representative origins, hubs, ports, or event centres.

## Level 1 delta workflow

Deep Research output never rewrites the canonical file directly. It produces an independent JSON delta matching `data/candidate_research_schema.md`.

Preview is the default and does not mutate any file:

```powershell
python scripts/level1_delta.py research_inbox/level1_01_natural_outdoor.json
```

The preview reports the batch ID, expected/received/missing/unexpected exact IDs, schema and enum errors, proposed experience/temporal changes, evidence and visual evidence counts, uncertainties, dynamic rechecks, Level 2 attention, and conflicts.

Apply is deliberately separate and requires a clean preview plus the exact confirmation token:

```powershell
python scripts/level1_delta.py research_inbox/level1_01_natural_outdoor.json --apply --confirm APPLY-L1-01
```

Apply copies the original delta to `research_archive/level1_applied/`, leaves the inbox source untouched, and appends a dated overlay to each exact `candidate_id`. It never uses fuzzy matching, changes an ID, deletes a Candidate, erases provenance/evidence/previous assessment, or hides a conflict. Baseline and conflicting findings remain available in the canonical history.

## Web application

The web layer uses `web/data-adapter.js` to convert the nested canonical schema plus the coordinate, region, and batch overlays into display view-models. Unknown values are legal and render as `未研究`, `unknown`, or `L1 pending`.

The map-first planner starts with an empty `我的地区` list. A user searches live Google Maps Japanese city/area predictions, previews a selected Place result with its official identity and coordinates, and explicitly adds it to the trip as a ⭐ marker. The verified 20-area catalog remains a read-only fallback if the live service is unavailable. New areas contain zero Candidates. Candidates are added only through the searchable multi-select picker, remain visible in the complete 77-item library, and can belong to at most one user-created area. Selecting an area zooms the Google map and reveals its type-colored Candidate markers; the area card exposes a one-click Candidate expand/collapse control. Area order, dates, nights, notes, and membership are browser-local preferences and never rewrite research data.

Live place selection also requests the preferred Google viewport, address structure, place types, and operating status so differently sized cities, regions, and attractions open at an appropriate map scale. Candidate details fetch current Google place information only when the detail drawer is opened, including rating volume, opening hours, official website and phone, photos, accessibility, parking, restroom, and reservation signals when available. Selected areas expose an on-demand Nearby Search panel for attractions, food, parks, museums, onsen/spa, lodging, transit, and parking; these results are exploration references and never create or assign canonical Candidates.

The `交通路线` workspace is a separate two-place journey planner rather than an automatic driving summary. Origins and destinations can come from live Google search, a user-created area, or any geocoded Candidate. Public-transport searches use NAVITIME Route(totalnavi) through the RapidAPI Basic plan first, with Google Routes retained as a no-result or network fallback; walking, cycling, and driving continue to use Google. Transit searches support departure/arrival time, railway or airport-bus filtering, fewer transfers, and less walking. Result cards expose available line, operator, boarding/alighting stops, departure/arrival time, intermediate-stop count, walking time, transfers, fare, and route shape. Earlier/later controls re-run the schedule 30 minutes either side of the selected Japan-local time.

Google and user-authored custom results can be saved browser-locally, highlighted on the map, reopened, recalculated, switched, renamed, annotated with actual cost, or deleted. NAVITIME's RapidAPI terms prohibit caching or saving returned data, so NAVITIME results remain in memory for the current view only and the save controls are replaced by an explicit manual custom-route action. Custom routes cover sightseeing buses, seasonal shuttles, ferries, charters, and other services absent from automated data. They store operator/line, type, departure and arrival, fare, frequency, intermediate-stop text, and notes; their map connector is deliberately dashed because it is a planning link rather than a claimed road geometry. These preferences do not rank Candidates, reorder areas, optimize routes, or mutate the canonical `data/routes.json`.

Like Google Maps place sheets, every selected itinerary area, geocoded Candidate, Candidate detail, and live Google place preview exposes **To here** and **Start here** actions. Either action opens the route planner with the selected place already filled as the destination or origin and focuses the remaining search field. Candidate library cards also expose a one-tap route shortcut.

The compact comparison cards and route geometry share the map view. Opening provider-derived stop-by-stop details temporarily hides the map; closing the details restores it. Saved Google route snapshots expire locally after 30 days; user-authored custom routes do not expire; NAVITIME responses are never persisted.

The NAVITIME RapidAPI Basic plan provides 500 hard-limited requests per month and must be connected with the user's own key in the route screen. The key is saved only in that browser and is never committed or injected into the public repository. The marketplace plan covers rail, air, walking connections, and airport shuttle buses, but NAVITIME documents local buses, highway buses, and ferries as unavailable through API marketplaces; those remain custom routes. Places API (New) and Routes API remain enabled for Google place search and non-transit/fallback routes.

GitHub Pages injects the referrer-restricted browser key from the `GOOGLE_MAPS_API_KEY` repository secret at deploy time. The key is not committed to the repository. Live autocomplete uses a fresh billing session token and requests only the Place fields needed to add an area.

The detail view includes Identity, 30-second preview, actual activity steps, Sep 5–18 reality, Temporal Experience Profile, practical constraints, disappointment risks, visual evidence, evidence/provenance, and research gaps. Filters cover normalized category, region, L1 status, L1 batch, trip-window fit, dynamic recheck, visual evidence, and uncertainty. Historical scores are labelled historical and are not ranking logic.

Run locally from the repository root:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/web/`.

## Validation

```powershell
python scripts/build_candidate_locations.py
python scripts/build_google_maps_area_catalog.py
python scripts/validate_data.py --external-master ..\data\hokkaido_places_master.json
python scripts/test_project.py
```

`scripts/validate_data.py` checks the current counts, nine legal categories, roles, status rules, exact-once batch coverage, distinct Kushiro restaurants, location overlay integrity, the unassigned Google Maps area-search catalog, and stable route references. The optional external-master argument confirms that the migration mirror still equals the authoritative external input. GitHub Actions runs structural validation, project tests, JSON parsing, and JavaScript syntax checks on pushes and pull requests.

## Non-goals for Phase A

This phase does not rank Candidates, optimize a route, conduct new travel research, or invent missing facts. Browser-local city/area and Candidate itinerary selections are planning preferences only; the canonical route schedule remains intentionally empty and available for later work through stable `candidate_id` references.
