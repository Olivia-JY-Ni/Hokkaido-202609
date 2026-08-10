# Repository rules

1. Treat the external `../data/hokkaido_places_master.json` as the authoritative Phase A migration input. The exact repository mirror `data/hokkaido_places_master.json` is the only current application canonical.
2. Never recreate `data/places_master.json`, introduce `master_v2`, or maintain a competing current master.
3. Preserve all 77 Candidates and stable `candidate_id` values. Never remove a Candidate because of a verdict, route exclusion, closure, date mismatch, or uncertainty.
4. Preserve the current invariants: 73 Level 1 subjects, 4 aggregate context modules, 12 Challenger/Near-miss modules, 10 batches, and exact-once eligible-ID coverage.
5. Keep `R2-KUS-004` and `R2-KUS-005` distinct. Possible duplicates require a documented human decision.
6. Keep coordinates in `data/candidate_locations.json`, never inside the research canonical. Do not guess unresolved coordinates.
7. Match research deltas by exact `candidate_id` only. No fuzzy matching, name matching, silent ID remapping, or implicit Candidate creation.
8. Preview and validate every delta before apply. Apply requires explicit confirmation and uses append-only dated overlays.
9. Never delete or overwrite baseline provenance, original records, evidence, previous assessments, or conflicting findings. Retain both sides of a conflict with provenance.
10. Keep `research_inbox/`, `research_archive/`, and canonical data separate. Inbox inputs are not deleted; archives are immutable.
11. Unknown values are valid. Use `null`, `[]`, or `unknown`; do not fabricate content to fill a UI or schema field.
12. `normalized_category` is restricted to the nine values declared in the canonical enum and research contract.
13. The web app must read nested data through `web/data-adapter.js` and remain tolerant of incomplete Level 1 research.
14. Historical scores may be shown only as historical context. Do not add ranking, itinerary selection, or route optimization in Phase A.
15. Routes and future itinerary references must use stable `candidate_id` values.
16. Run `python scripts/validate_data.py` and `python scripts/test_project.py` after structural changes.
17. Treat `data/google_maps_area_catalog.json` as a search catalog, not itinerary state or a research canonical. It must never contain default Candidate membership.
18. The browser-local planner must start with no areas and no Candidate assignments. `全部 Candidates` remains a complete 77-Candidate library; user-created area membership must not mutate repository data.
