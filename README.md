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

The map-first planner starts with an empty `我的地区` list. A user searches the verified Google Maps city/area catalog, previews a result, and explicitly adds it to the trip as a ⭐ marker. New areas contain zero Candidates. Candidates are added only through the searchable multi-select picker, remain visible in the complete 77-item library, and can belong to at most one user-created area. Selecting an area zooms the map and reveals its type-colored Candidate markers; the area card exposes a one-click Candidate expand/collapse control. Area order, dates, nights, notes, and membership are browser-local preferences and never rewrite research data.

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
