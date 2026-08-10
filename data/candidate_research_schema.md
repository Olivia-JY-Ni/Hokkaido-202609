# Candidate Experience Research Schema

## 1. Purpose and merge contract

This schema maintains an unfiltered, append-oriented Candidate Experience Inventory for 2026-09-05 through 2026-09-18. It does not rank or select an itinerary.

- Round 1: preserve every baseline record and stable ID.
- Round 2: append `new_candidates` and independent `regional_modules`; attach `candidate_updates` under `research_overlays` without replacing baseline fields.
- Challenger Scan: append both `challengers` and `near_misses`. Historical verdicts are stored only under `previous_research_assessment`.
- Possible duplicates are never silently merged.
- Missing evidence is represented by `null`, `[]`, or `unknown`; never infer a fact merely to fill a field.

## 2. Candidate object

### Identity

| Field | Type | Nullable | Definition |
|---|---:|:---:|---|
| candidate_id | string | no | Unique source-preserving ID. |
| stable_id_status | enum | no | `stable_baseline_id` or `reconstructed_provisional_id`. |
| name_ja / name_en / name_zh | string | yes | Known names. Generated module labels are explicitly marked in provenance. |
| entity_type | enum | no | place, natural_experience, animal_experience, event, restaurant, dessert_cafe, lodging, onsen, museum, architecture, shop, workshop, special_transport, regional_module. |
| normalized_category | enum | no | High-level automatic Level 2 strategy key. |
| research_subject_role | enum | no | `atomic_candidate`, `challenger_module`, or `aggregate_context_module`; distinguishes an inventory entity from a Level 1 subject. |
| level_1_eligible | boolean | no | Whether the entity must occur exactly once in Level 1 batches. |
| original_category / subcategory | string | yes | Source fields retained; never overwritten by normalization. |
| region / municipality / country | string | yes | Geography as supplied. No guessed coordinates are added. |
| discovery_round / discovery_source | string or number | no | Origin of discovery. |
| provenance | array<object> | no | One row per contributing source section, including role and reconstruction status. |
| previous_research_assessment | object | yes | Historical assessment/verdict only; not current deletion or rank logic. |

Legal `normalized_category` values are fixed to the following nine values:

- `natural_outdoor`
- `animal_marine`
- `event_festival`
- `food_market_drink`
- `dessert_cafe_bakery`
- `lodging_onsen`
- `architecture_museum_shop_workshop`
- `special_transport`
- `regional_challenger_module`

A research batch must not invent a tenth category. Any category change requires a formal schema version change and migration review.

### Experience

`experience` contains: `experience_summary`, `what_you_actually_do`, `why_people_love_it`, `common_disappointments`, `sep_2026_experience`, `trip_window_fit`, `realistic_duration`, `weather_dependency`, `language_dependency`, `physical_load`, and `luggage_friction`. Unknowns remain explicit.

`trip_window_fit` is an overall judgment of whether 2026-09-05 through 2026-09-18 is a good time to experience the Candidate. It is distinct from `trip_window_position`, which describes where the trip window sits relative to the Candidate's seasonal peak or progression.

Legal `trip_window_fit` values:

- `excellent`
- `good`
- `acceptable`
- `weak`
- `outside_window`
- `uncertain`

The inventory migration default is `uncertain`. Existing research text must not be promoted into a stronger value without Level 1 verification.

### Source packs

`source_packs` separates `official_links`, `travel_review_links`, `social_links`, `video_links`, and optional `unclassified_links`. Every link record supports:

- `url`
- `source_name`
- `source_type`
- `publication_or_capture_date`
- `verified_at`
- `note`

A URL from a legacy undifferentiated source string is marked `source_reference_unclassified` under `unclassified_links`; it is not promoted to official or review evidence without verification.

## 3. Visual evidence

`visual_evidence.assets` is an array. Each future asset supports:

- `asset_url`, `source_page_url`, `source_platform`
- `verified_at`, `source_type`
- `asset_type`: image or video
- `approximate_capture_date`, `capture_season`
- `caption`, `what_this_image_is_showing`
- `visual_relevance_to_trip`: exact_trip_window, same_season_other_year, near_season, illustrative_only, misleading_without_annotation
- `what_should_be_visible_during_2026_09_05_18`
- `what_is_unlikely_to_be_visible`
- `season_mismatch_note`
- `perspective_warning`

Legal visual `source_type` values are `official`, `tourism_board`, `operator`, `recent_visitor_review`, `social`, `video_platform`, `other`, and `unknown`.

`exact_trip_window` is reserved only for content actually captured during **2026-09-05 through 2026-09-18**. Because research normally occurs before the trip, this value should ordinarily not appear in pre-trip research. A photo or video captured during the same September period in another year, including 2025-09-10, must use `same_season_other_year`; neighboring dates or seasons use `near_season`.

The final four fields also exist at candidate level for a concise visual expectation. Long-lens animal scale inflation, aerial-only perspectives, winter snow, peak foliage outside the trip window, and other mismatches must be annotated rather than silently presented as representative. This inventory intentionally leaves asset arrays empty pending later visual research.

## 4. Temporal Experience Profile

`temporal_profile` supports four layers:

1. Seasonal position: `ideal_seasonal_window`, `seasonal_progression_summary`.
2. Trip-window position: nested `trip_window_position` with `position`, preferred dates/segment, timing reason, date sensitivity, earlier/later penalties, route-reordering value, evidence strength, and year-to-year variability.
3. Availability / hard constraints: `time_constraint_type`, `hard_date_constraints`, `operating_period`, `closure_days`, `fixed_event_dates`, `transport_date_constraints`.
4. Time of day: `recommended_time_of_day`, `recommended_visit_time`, reason, alternative-time penalty, and early-start requirement/reason.

Enums:

- position: before_peak, approaching_peak, near_peak, peak_window, after_peak, stable_throughout_window, highly_variable, outside_best_window, unknown
- preferred_trip_segment: early_trip, middle_trip, late_trip, no_material_difference, unknown
- date_sensitivity: very_high, high, medium, low, negligible, unknown
- timing_evidence_strength and year_to_year_variability: high, medium, low, unknown
- boolean-like unresolved fields may use `unknown` until verified

`preferred_dates_within_trip` is an array of structured objects, never an array of free-text date recommendations. Each item must use:

```json
{
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "preference_strength": "preferred",
  "reason": null,
  "evidence_strength": "unknown"
}
```

- `start_date` and `end_date` must fall within 2026-09-05 through 2026-09-18; a single-day preference uses the same value for both.
- `preference_strength`: `strongly_preferred`, `preferred`, or `slightly_preferred`.
- `reason`: concise timing rationale, or `null` when not yet researched.
- `evidence_strength`: `high`, `medium`, `low`, or `unknown`.
- If the whole trip window is materially equivalent, keep the array empty and set `preferred_trip_segment = no_material_difference`.
- Do not manufacture day-level precision to populate this array.

Legacy timing text is preserved verbatim in `raw_source_time_text`. It is copied into hard-constraint arrays only when the available source clearly establishes a hard availability/operating constraint. Ambiguous historical text stays `unknown` or `informational_only`; it is never guessed into a stricter enum.

## 5. Research state and Level 2 routing

- `research_subject_role`: `atomic_candidate`, `challenger_module`, or `aggregate_context_module`.
- `level_1_eligible`: true for atomic Candidates and Japan challenger/near-miss modules; false for RM-SAP, RM-ASH, RM-SHR, and RM-KUS.
- `research_level`: eligible subjects use `level_1`; aggregate context modules remain at `inventory`.
- `research_status`: inventory_only, level_1_pending, level_1_complete, level_2_pending, level_2_complete, level_3_candidate, dynamic_recheck_required.
- `dynamic_recheck_required`: separate boolean for facts likely to change while the primary status remains level_1_pending.
- `level_2_strategy.strategy_id`: equals normalized_category.
- `level_2_strategy.focus_areas`: copied from the registry in the master file.

## 6. Provenance and raw preservation

Each candidate has:

- `provenance`: source file, source section, source record ID, data role, reconstruction status, and notes.
- `original_records`: verbatim structured source records.
- `research_overlays`: Round 2 updates, stored independently of baseline fields.

The top-level `source_context` keeps source-level reconstruction notes and the Round 2 merge guard. Reports may clarify ambiguities but cannot overwrite structured source records.

## 7. Relationships and duplicates

`relationships` supports `possible_duplicate`, `possible_duplicate_candidate_ids`, `related_candidate_ids`, and `aggregate_module_ids`. Aggregate modules may overlap their component Candidates by design; this is not a duplicate.

## 8. Future merge rule

1. Match by exact candidate_id only.
2. If the ID exists, append a dated overlay/provenance record; do not erase the earlier source record.
3. If a reconstructed ID is remapped after the original file is recovered, create an explicit ID-remap record and retain the old ID as an alias.
4. If the ID is new, append the Candidate with discovery provenance.
5. Never delete a Candidate because of a verdict, route exclusion, date mismatch, closure, or outside-window status; update assessment/status instead.
6. Never merge possible duplicates without a documented human decision.
7. Dynamic operational facts must be rechecked with a new verified_at timestamp rather than silently editing old evidence.


## 9. Formal `time_constraint_type` enum

`time_constraint_type` describes only Candidate availability or operability: hard event dates, opening/operating periods, weekday rules, or equivalent hard constraints. It must not encode that scenery is prettier later, autumn color is stronger on a date, another nearby Candidate creates a convenient opportunity, or a time is merely recommended. Those belong in seasonal progression, preferred dates/segment, timing reasons and penalties, recommended visit time, or related-Candidate timing opportunities.

| Enum | Definition |
|---|---|
| `fixed_datetime` | One or more exact date-and-time occurrences. |
| `fixed_dates` | One or more exact dates; the time may vary or remain unverified. |
| `limited_date_range` | Available only inside a bounded date range. |
| `seasonal_window` | Availability itself is limited to a recurring season; not merely a better-looking season. |
| `operating_period` | A published operating/open period controls availability. |
| `weekday_specific` | Available only on specified weekdays. |
| `weekend_only` | Available only on weekends/holidays. |
| `flexible` | No material hard date/operating restriction is presently known. |
| `informational_only` | Existing timing text is recommendation/seasonal context, not an availability constraint. |
| `unknown` | Current historical text cannot be reliably classified before Level 1 verification. |

## 10. Inventory entity vs. Level 1 subject

- RM-SAP, RM-ASH, RM-SHR, and RM-KUS are retained as `aggregate_context_module`, with `level_1_eligible = false`, `research_level = inventory`, and `research_status = inventory_only`.
- JP-CH-* and JP-NM-* are `challenger_module` with `level_1_eligible = true`.
- Other records are `atomic_candidate` with `level_1_eligible = true`.
- Level 1 batches cover only eligible subjects, exactly once, and should remain category-pure even when that produces batches smaller than 8.

## 11. Provisional timing flag

The current count of high/very-high date sensitivity is a provisional pre-research flag. Level 1 or Level 2 may raise or lower it, change preferred dates, or reclassify hard versus recommended timing.

## 12. Human duplicate resolution

On 2026-08-10, R2-KUS-004 (炉ばた煉瓦, `robata`, Tabelog `/1001169/`) and R2-KUS-005 (炉ばた, `historic_robata`, Tabelog `/1000010/`) were confirmed as distinct restaurants. Both remain; both have `possible_duplicate = false`; their mutual ID arrays are empty; the pair is absent from `possible_duplicate_reviews`; the decision is retained in the top-level `changelog`.

# Level 1 / Level 2 Research Delta Output Contract

## 1. Purpose and write boundary

Deep Research must never directly rewrite `hokkaido_places_master.json`.

Every Level 1 or Level 2 research batch must produce an independent delta JSON file. A later Work step merges that delta into the canonical master by exact `candidate_id`. Research output and canonical merge are separate operations.

This section formally fixes the Level 1 delta shape. Level 2 must follow the same independent-delta and append-only merge discipline; any later Level 2-specific payload extension must be versioned and documented before use.

## 2. Fixed Level 1 batch result structure

The top-level Level 1 batch result must use exactly this structure:

```json
{
  "research_metadata": {
    "batch_id": "L1-01",
    "research_level": "level_1",
    "schema_version": "1.1.0",
    "researched_at": "YYYY-MM-DD",
    "travel_window": {
      "start": "2026-09-05",
      "end": "2026-09-18"
    }
  },
  "candidate_updates": [],
  "batch_findings": {
    "high_temporal_sensitivity": [],
    "visual_misrepresentation_risks": [],
    "insufficient_evidence": [],
    "recommended_level_2_attention": []
  }
}
```

Each `candidate_updates` item must use exactly this structure:

```json
{
  "candidate_id": "...",
  "research_level": "level_1",
  "researched_at": "YYYY-MM-DD",

  "experience_update": {
    "experience_summary": null,
    "what_you_actually_do": [],
    "why_people_love_it": null,
    "common_disappointments": null,
    "sep_2026_experience": null,
    "trip_window_fit": "uncertain",
    "realistic_duration": null,
    "weather_dependency": null,
    "language_dependency": null,
    "physical_load": null,
    "luggage_friction": null
  },

  "temporal_profile_update": {
    "ideal_seasonal_window": null,
    "seasonal_progression_summary": null,

    "trip_window_position": {
      "position": "unknown",
      "preferred_dates_within_trip": [],
      "preferred_trip_segment": "unknown",
      "why_these_dates_are_better": null,
      "date_sensitivity": "unknown",
      "penalty_if_done_earlier": null,
      "penalty_if_done_later": null,
      "worth_reordering_route_for_timing": null,
      "timing_evidence_strength": "unknown",
      "year_to_year_variability": "unknown"
    },

    "time_constraint_type": "unknown",
    "hard_date_constraints": [],
    "operating_period": [],
    "closure_days": [],
    "fixed_event_dates": [],
    "transport_date_constraints": [],

    "recommended_time_of_day": null,
    "recommended_visit_time": null,
    "why_this_time_is_better": null,
    "penalty_if_visited_at_other_time": null,
    "early_start_required": "unknown",
    "early_start_reason": null
  },

  "visual_evidence_update": {
    "assets": [],
    "what_should_be_visible_during_2026_09_05_18": null,
    "what_is_unlikely_to_be_visible": null,
    "season_mismatch_note": null,
    "perspective_warning": null
  },

  "source_packs_update": {
    "official_links": [],
    "travel_review_links": [],
    "social_links": [],
    "video_links": []
  },

  "uncertainties": [],
  "dynamic_recheck_items": [],
  "level_2_attention": []
}
```

Unknown values must remain `null`, `[]`, or `"unknown"` as defined above. Research must not guess merely to populate a field.

## 3. Formal array item schemas

All arrays below may be empty. When populated, every item must use the stated object keys so that batches remain mergeable and comparable.

### `batch_findings.high_temporal_sensitivity[]`

```json
{
  "candidate_id": "...",
  "finding": null,
  "evidence_strength": "unknown"
}
```

### `batch_findings.visual_misrepresentation_risks[]`

```json
{
  "candidate_id": "...",
  "risk": null,
  "affected_visual_or_source": null,
  "mitigation": null
}
```

### `batch_findings.insufficient_evidence[]`

```json
{
  "candidate_id": "...",
  "topic": null,
  "missing_evidence": null,
  "consequence": null
}
```

### `batch_findings.recommended_level_2_attention[]`

```json
{
  "candidate_id": "...",
  "topic": null,
  "reason": null,
  "priority": "unknown"
}
```

### `candidate_updates[].uncertainties[]`

```json
{
  "topic": null,
  "uncertainty": null,
  "evidence_gap": null,
  "practical_consequence": null
}
```

### `candidate_updates[].dynamic_recheck_items[]`

```json
{
  "topic": null,
  "reason": null,
  "recommended_recheck_window": null,
  "preferred_source_type": "unknown",
  "current_confidence": "unknown"
}
```

### `candidate_updates[].level_2_attention[]`

```json
{
  "topic": null,
  "reason": null,
  "priority": "unknown"
}
```

For these item schemas, `evidence_strength`, `current_confidence`, and `priority` use `high`, `medium`, `low`, or `unknown` unless a later versioned schema explicitly defines a different scale. `preferred_source_type` uses the visual/source type registry where applicable and may remain `unknown`.

### `visual_evidence_update.assets[]`

```json
{
  "asset_url": null,
  "source_page_url": null,
  "source_platform": null,
  "source_type": "unknown",
  "verified_at": null,
  "asset_type": "image",
  "approximate_capture_date": null,
  "capture_season": null,
  "caption": null,
  "what_this_image_is_showing": null,
  "visual_relevance_to_trip": "illustrative_only",
  "what_should_be_visible_during_2026_09_05_18": null,
  "what_is_unlikely_to_be_visible": null,
  "season_mismatch_note": null,
  "perspective_warning": null
}
```

`asset_type` is `image` or `video`. `source_type` and `visual_relevance_to_trip` must use the formal enums defined above. `verified_at` is an ISO date (`YYYY-MM-DD`) or `null`.

## 4. Merge rule

A research delta may only:

- append evidence;
- fill previously unknown research fields;
- add a dated research overlay; or
- revise a previous research interpretation with provenance.

A research delta must not:

- delete original records;
- delete historical evidence;
- delete a Candidate;
- silently overwrite `previous_research_assessment`;
- change `candidate_id`;
- directly modify baseline provenance; or
- directly rewrite the canonical master.

If new evidence conflicts with older evidence, the merge must retain both sides and record:

- `old_finding`
- `new_finding`
- `evidence`
- `researched_at`
- `current_interpretation`

The changed interpretation is a dated overlay, not a destructive replacement of the older finding.

## 5. Visual URL rule

For image and video evidence, `source_page_url` is more important than a direct media URL.

If a direct image/video URL is unstable, cannot be obtained reliably, or may expire:

- `asset_url` may be `null`;
- `source_page_url` must be retained; and
- `what_this_image_is_showing` must state specifically what a reviewer should look for on that page.

Researchers must never guess a media URL merely to populate `asset_url`.
