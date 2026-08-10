#!/usr/bin/env python3
"""Structural QA for the Phase A Candidate Experience framework."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "hokkaido_places_master.json"
BATCH_PATH = ROOT / "data" / "research_batches_level1.json"
LOCATION_PATH = ROOT / "data" / "candidate_locations.json"
LOCATION_REVIEW_PATH = ROOT / "data" / "google_maps_coordinate_review_current.json"
LEGACY_MASTER_PATH = ROOT / "data" / "history" / "places_master_legacy_42.json"
REGIONS_PATH = ROOT / "data" / "candidate_regions.json"
ROUTES_PATH = ROOT / "data" / "routes.json"

EXPECTED_TOTAL = 77
EXPECTED_ELIGIBLE = 73
EXPECTED_AGGREGATES = 4
EXPECTED_CHALLENGERS = 12
EXPECTED_BATCHES = 10
EXPECTED_VERIFIED_COORDINATES = 77
EXPECTED_AGGREGATE_IDS = {"RM-SAP", "RM-ASH", "RM-SHR", "RM-KUS"}
DISTINCT_KUSHIRO_PAIR = {"R2-KUS-004", "R2-KUS-005"}
LEGAL_CATEGORIES = {
    "natural_outdoor",
    "animal_marine",
    "event_festival",
    "food_market_drink",
    "dessert_cafe_bakery",
    "lodging_onsen",
    "architecture_museum_shop_workshop",
    "special_transport",
    "regional_challenger_module",
}


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Cannot read valid JSON at {path}: {exc}") from exc


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(external_master: Path | None = None) -> list[str]:
    errors: list[str] = []
    master = load_json(MASTER_PATH)
    batches = load_json(BATCH_PATH)
    locations = load_json(LOCATION_PATH)
    location_review = load_json(LOCATION_REVIEW_PATH)
    legacy_master = load_json(LEGACY_MASTER_PATH)
    regions = load_json(REGIONS_PATH)
    routes = load_json(ROUTES_PATH)
    candidates = master.get("candidates", [])

    ids = [row.get("candidate_id") for row in candidates]
    id_set = set(ids)
    if len(candidates) != EXPECTED_TOTAL:
        errors.append(f"candidate total: expected {EXPECTED_TOTAL}, got {len(candidates)}")
    if None in id_set or len(id_set) != len(ids):
        errors.append("candidate_id values must be present and globally unique")
    if master.get("inventory_summary", {}).get("candidate_total") != len(candidates):
        errors.append("inventory_summary.candidate_total does not match candidates")

    registry = set(master.get("level_2_strategy_registry", {}))
    declared_categories = set(master.get("enums", {}).get("normalized_category", []))
    if declared_categories != LEGAL_CATEGORIES or registry != LEGAL_CATEGORIES:
        errors.append("the enum and Level 2 registry must contain exactly the nine legal categories")

    eligible_ids: list[str] = []
    aggregate_ids: set[str] = set()
    challenger_ids: set[str] = set()
    for row in candidates:
        cid = row.get("candidate_id", "<missing>")
        category = row.get("normalized_category")
        if category not in LEGAL_CATEGORIES:
            errors.append(f"{cid}: illegal normalized_category {category!r}")
        if row.get("level_2_strategy", {}).get("strategy_id") != category:
            errors.append(f"{cid}: level_2 strategy must equal normalized_category")
        if not isinstance(row.get("provenance"), list) or not row.get("provenance"):
            errors.append(f"{cid}: provenance must be preserved")
        if not isinstance(row.get("original_records"), list) or not row.get("original_records"):
            errors.append(f"{cid}: original_records must be preserved")
        role = row.get("research_subject_role")
        eligible = row.get("level_1_eligible") is True
        if eligible:
            eligible_ids.append(cid)
            if row.get("research_level") != "level_1":
                errors.append(f"{cid}: eligible subject must use research_level=level_1")
        if role == "aggregate_context_module":
            aggregate_ids.add(cid)
            if eligible or row.get("research_status") != "inventory_only":
                errors.append(f"{cid}: aggregate module cannot be Level 1 eligible")
        if role == "challenger_module":
            challenger_ids.add(cid)
            if not eligible:
                errors.append(f"{cid}: challenger module must be Level 1 eligible")

    if len(eligible_ids) != EXPECTED_ELIGIBLE:
        errors.append(f"Level 1 eligible: expected {EXPECTED_ELIGIBLE}, got {len(eligible_ids)}")
    if aggregate_ids != EXPECTED_AGGREGATE_IDS or len(aggregate_ids) != EXPECTED_AGGREGATES:
        errors.append(f"aggregate module IDs differ: {sorted(aggregate_ids)}")
    if len(challenger_ids) != EXPECTED_CHALLENGERS:
        errors.append(f"challenger/near-miss modules: expected {EXPECTED_CHALLENGERS}, got {len(challenger_ids)}")

    if not DISTINCT_KUSHIRO_PAIR.issubset(id_set):
        errors.append("R2-KUS-004 and R2-KUS-005 must both exist")
    else:
        pair = [next(row for row in candidates if row["candidate_id"] == cid) for cid in DISTINCT_KUSHIRO_PAIR]
        if len({row.get("name_ja") for row in pair}) != 2:
            errors.append("R2-KUS-004 and R2-KUS-005 must remain distinct restaurants")
        for row in pair:
            relations = row.get("relationships", {})
            if relations.get("possible_duplicate") is not False:
                errors.append(f"{row['candidate_id']}: confirmed distinct pair marked as possible duplicate")

    batch_rows = batches.get("batches", [])
    if len(batch_rows) != EXPECTED_BATCHES:
        errors.append(f"L1 batch count: expected {EXPECTED_BATCHES}, got {len(batch_rows)}")
    batch_ids = [row.get("batch_id") for row in batch_rows]
    if len(set(batch_ids)) != len(batch_ids):
        errors.append("batch_id values must be unique")
    assigned = [cid for row in batch_rows for cid in row.get("candidate_ids", [])]
    duplicates = sorted(cid for cid, count in Counter(assigned).items() if count > 1)
    if duplicates:
        errors.append(f"eligible candidates assigned more than once: {duplicates}")
    missing = sorted(set(eligible_ids) - set(assigned))
    unexpected = sorted(set(assigned) - set(eligible_ids))
    if missing or unexpected or len(assigned) != EXPECTED_ELIGIBLE:
        errors.append(f"batch coverage mismatch; missing={missing}, unexpected={unexpected}")
    for row in batch_rows:
        actual_categories = {
            next((candidate.get("normalized_category") for candidate in candidates if candidate["candidate_id"] == cid), None)
            for cid in row.get("candidate_ids", [])
        }
        if len(actual_categories) != 1 or set(row.get("normalized_categories", [])) != actual_categories:
            errors.append(f"{row.get('batch_id')}: batch must be category-pure and correctly labelled")

    location_rows = locations.get("locations", [])
    location_ids = [row.get("candidate_id") for row in location_rows]
    if len(location_rows) != EXPECTED_TOTAL or set(location_ids) != id_set or len(set(location_ids)) != len(location_ids):
        errors.append("location overlay must contain exactly one row for every canonical candidate")
    verified_count = 0
    required_location_keys = {
        "candidate_id", "lat", "lon", "scope", "verification_status", "provider",
        "provider_place_id", "source_url", "verified_at",
    }
    for row in location_rows:
        cid = row.get("candidate_id", "<missing>")
        if not required_location_keys.issubset(row):
            errors.append(f"{cid}: location row is missing required fields")
        status = row.get("verification_status")
        if status == "verified":
            verified_count += 1
            if not isinstance(row.get("lat"), (int, float)) or not -90 <= row["lat"] <= 90:
                errors.append(f"{cid}: invalid verified latitude")
            if not isinstance(row.get("lon"), (int, float)) or not -180 <= row["lon"] <= 180:
                errors.append(f"{cid}: invalid verified longitude")
            for key in ("scope", "provider", "provider_place_id", "source_url", "verified_at"):
                if not row.get(key):
                    errors.append(f"{cid}: verified coordinate missing {key}")
        elif status == "unresolved":
            if any(row.get(key) is not None for key in ("lat", "lon", "provider_place_id")):
                errors.append(f"{cid}: unresolved coordinate must stay null")
        else:
            errors.append(f"{cid}: illegal verification_status {status!r}")
    if verified_count != EXPECTED_VERIFIED_COORDINATES:
        errors.append(
            f"verified coordinates: expected {EXPECTED_VERIFIED_COORDINATES}, got {verified_count}"
        )

    review_rows = location_review.get("results", [])
    legacy_ids = {row["unique_id"] for row in legacy_master.get("records", [])}
    expected_review_ids = id_set - legacy_ids
    review_by_id = {row.get("candidate_id"): row for row in review_rows}
    if len(review_rows) != 35 or set(review_by_id) != expected_review_ids:
        errors.append("current Google Maps review must cover exactly the 35 post-legacy Candidates")
    overlay_by_id = {row["candidate_id"]: row for row in location_rows}
    for cid, evidence in review_by_id.items():
        if evidence.get("status") != "verified" or not all(evidence.get("checks", {}).values()):
            errors.append(f"{cid}: Google Maps title/region/bounds/Place ID checks are not all verified")
            continue
        location = overlay_by_id.get(cid, {})
        comparisons = {
            "lat": evidence.get("latitude"), "lon": evidence.get("longitude"),
            "scope": evidence.get("coordinate_scope"),
            "provider_place_id": evidence.get("google_place_id"),
            "source_url": evidence.get("google_maps_url"),
        }
        for key, value in comparisons.items():
            if location.get(key) != value:
                errors.append(f"{cid}: location overlay {key} differs from current Google Maps evidence")

    region_rows = regions.get("regions", [])
    region_ids = [row.get("region_id") for row in region_rows]
    if len(region_rows) != 26 or len(set(region_ids)) != len(region_ids) or None in region_ids:
        errors.append("city/area overlay must contain 26 unique region_id values")
    region_assignments = [cid for row in region_rows for cid in row.get("candidate_ids", [])]
    assignment_duplicates = sorted(cid for cid, count in Counter(region_assignments).items() if count > 1)
    assignment_missing = sorted(id_set - set(region_assignments))
    assignment_unknown = sorted(set(region_assignments) - id_set)
    if assignment_duplicates or assignment_missing or assignment_unknown:
        errors.append(
            f"default city/area assignments must cover every Candidate exactly once; "
            f"duplicates={assignment_duplicates}, missing={assignment_missing}, unknown={assignment_unknown}"
        )
    for row in region_rows:
        rid = row.get("region_id", "<missing>")
        if row.get("entity_type") != "city_or_area":
            errors.append(f"{rid}: region entity_type must be city_or_area")
        if not row.get("name_zh") or not row.get("candidate_ids"):
            errors.append(f"{rid}: region must have a name and at least one default Candidate")
        if not isinstance(row.get("center_lat"), (int, float)) or not -90 <= row["center_lat"] <= 90:
            errors.append(f"{rid}: invalid derived center latitude")
        if not isinstance(row.get("center_lon"), (int, float)) or not -180 <= row["center_lon"] <= 180:
            errors.append(f"{rid}: invalid derived center longitude")

    for day in routes.get("trip", {}).get("days", []):
        route_refs = list(day.get("place_sequence", []))
        accommodation = day.get("accommodation_place_id")
        if accommodation:
            route_refs.append(accommodation)
        bad_refs = sorted(set(route_refs) - id_set)
        if bad_refs:
            errors.append(f"route day {day.get('day_number')}: unknown candidate IDs {bad_refs}")

    if external_master is not None:
        if not external_master.exists():
            errors.append(f"external authoritative master not found: {external_master}")
        elif sha256(external_master) != sha256(MASTER_PATH):
            errors.append("implementation canonical differs from the external authoritative master")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--external-master",
        type=Path,
        help="Optionally require byte-for-byte equality with the external authoritative master.",
    )
    args = parser.parse_args()
    try:
        errors = validate(args.external_master)
    except ValueError as exc:
        errors = [str(exc)]
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Validation passed: 77 candidates, 73 L1 subjects, 4 aggregates, 12 challenger modules, 10 batches.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
