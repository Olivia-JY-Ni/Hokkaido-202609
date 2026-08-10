#!/usr/bin/env python3
"""Preview and explicitly apply append-only Level 1 research deltas."""

from __future__ import annotations

import argparse
import copy
import json
import os
import shutil
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "hokkaido_places_master.json"
BATCH_PATH = ROOT / "data" / "research_batches_level1.json"
ARCHIVE_DIR = ROOT / "research_archive" / "level1_applied"
TRIP_START = date(2026, 9, 5)
TRIP_END = date(2026, 9, 18)

TOP_KEYS = {"research_metadata", "candidate_updates", "batch_findings"}
METADATA_KEYS = {"batch_id", "research_level", "schema_version", "researched_at", "travel_window"}
UPDATE_KEYS = {
    "candidate_id", "research_level", "researched_at", "experience_update",
    "temporal_profile_update", "visual_evidence_update", "source_packs_update",
    "uncertainties", "dynamic_recheck_items", "level_2_attention",
}
EXPERIENCE_KEYS = {
    "experience_summary", "what_you_actually_do", "why_people_love_it",
    "common_disappointments", "sep_2026_experience", "trip_window_fit",
    "realistic_duration", "weather_dependency", "language_dependency",
    "physical_load", "luggage_friction",
}
TEMPORAL_KEYS = {
    "ideal_seasonal_window", "seasonal_progression_summary", "trip_window_position",
    "time_constraint_type", "hard_date_constraints", "operating_period", "closure_days",
    "fixed_event_dates", "transport_date_constraints", "recommended_time_of_day",
    "recommended_visit_time", "why_this_time_is_better",
    "penalty_if_visited_at_other_time", "early_start_required", "early_start_reason",
}
POSITION_KEYS = {
    "position", "preferred_dates_within_trip", "preferred_trip_segment",
    "why_these_dates_are_better", "date_sensitivity", "penalty_if_done_earlier",
    "penalty_if_done_later", "worth_reordering_route_for_timing",
    "timing_evidence_strength", "year_to_year_variability",
}
VISUAL_KEYS = {
    "assets", "what_should_be_visible_during_2026_09_05_18",
    "what_is_unlikely_to_be_visible", "season_mismatch_note", "perspective_warning",
}
SOURCE_PACK_KEYS = {"official_links", "travel_review_links", "social_links", "video_links"}
BATCH_FINDING_KEYS = {
    "high_temporal_sensitivity", "visual_misrepresentation_risks",
    "insufficient_evidence", "recommended_level_2_attention",
}
PREFERRED_DATE_KEYS = {"start_date", "end_date", "preference_strength", "reason", "evidence_strength"}
LINK_KEYS = {"url", "source_name", "source_type", "publication_or_capture_date", "verified_at", "note"}
ASSET_KEYS = {
    "asset_url", "source_page_url", "source_platform", "source_type", "verified_at",
    "asset_type", "approximate_capture_date", "capture_season", "caption",
    "what_this_image_is_showing", "visual_relevance_to_trip",
    "what_should_be_visible_during_2026_09_05_18", "what_is_unlikely_to_be_visible",
    "season_mismatch_note", "perspective_warning",
}
ARRAY_SCHEMAS = {
    "uncertainties": {"topic", "uncertainty", "evidence_gap", "practical_consequence"},
    "dynamic_recheck_items": {
        "topic", "reason", "recommended_recheck_window", "preferred_source_type", "current_confidence"
    },
    "level_2_attention": {"topic", "reason", "priority"},
    "high_temporal_sensitivity": {"candidate_id", "finding", "evidence_strength"},
    "visual_misrepresentation_risks": {
        "candidate_id", "risk", "affected_visual_or_source", "mitigation"
    },
    "insufficient_evidence": {"candidate_id", "topic", "missing_evidence", "consequence"},
    "recommended_level_2_attention": {"candidate_id", "topic", "reason", "priority"},
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def exact_keys(value: Any, expected: set[str], path: str, errors: list[str]) -> bool:
    if not isinstance(value, dict):
        errors.append(f"{path}: expected object")
        return False
    missing = sorted(expected - set(value))
    extra = sorted(set(value) - expected)
    if missing or extra:
        errors.append(f"{path}: key mismatch; missing={missing}, extra={extra}")
        return False
    return True


def iso_date(value: Any, path: str, errors: list[str], nullable: bool = False) -> date | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str):
        errors.append(f"{path}: expected YYYY-MM-DD")
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        errors.append(f"{path}: invalid ISO date {value!r}")
        return None


def enum(value: Any, legal: set[str], path: str, errors: list[str], nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if value not in legal:
        errors.append(f"{path}: illegal value {value!r}; expected one of {sorted(legal, key=repr)}")


def validate_object_array(value: Any, schema_name: str, path: str, errors: list[str]) -> None:
    if not isinstance(value, list):
        errors.append(f"{path}: expected array")
        return
    expected = ARRAY_SCHEMAS[schema_name]
    for index, item in enumerate(value):
        exact_keys(item, expected, f"{path}[{index}]", errors)
        if schema_name in {"dynamic_recheck_items", "level_2_attention", "high_temporal_sensitivity", "recommended_level_2_attention"}:
            key = "current_confidence" if schema_name == "dynamic_recheck_items" else (
                "evidence_strength" if schema_name == "high_temporal_sensitivity" else "priority"
            )
            enum(item.get(key), {"high", "medium", "low", "unknown"}, f"{path}[{index}].{key}", errors)


def meaningful(value: Any) -> bool:
    return value not in (None, "", "unknown", [], {})


def flatten_meaningful(value: Any, prefix: str = "") -> dict[str, Any]:
    found: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            child_prefix = f"{prefix}.{key}" if prefix else key
            found.update(flatten_meaningful(child, child_prefix))
    elif meaningful(value):
        found[prefix] = value
    return found


def validate_delta(delta: dict[str, Any], master: dict[str, Any], batches: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    exact_keys(delta, TOP_KEYS, "$", errors)
    metadata = delta.get("research_metadata", {})
    exact_keys(metadata, METADATA_KEYS, "research_metadata", errors)
    batch_id = metadata.get("batch_id")
    batch = next((row for row in batches.get("batches", []) if row.get("batch_id") == batch_id), None)
    if batch is None:
        errors.append(f"research_metadata.batch_id: unknown exact batch ID {batch_id!r}")
        expected_ids: list[str] = []
    else:
        expected_ids = batch["candidate_ids"]
    if metadata.get("research_level") != "level_1":
        errors.append("research_metadata.research_level must be level_1")
    if metadata.get("schema_version") != batches.get("schema_version"):
        errors.append("research_metadata.schema_version must match research_batches_level1.json")
    researched_at = iso_date(metadata.get("researched_at"), "research_metadata.researched_at", errors)
    travel_window = metadata.get("travel_window")
    if not exact_keys(travel_window, {"start", "end"}, "research_metadata.travel_window", errors):
        travel_window = {}
    if travel_window.get("start") != "2026-09-05" or travel_window.get("end") != "2026-09-18":
        errors.append("research_metadata.travel_window must be 2026-09-05 through 2026-09-18")

    enums = master.get("enums", {})
    updates = delta.get("candidate_updates")
    if not isinstance(updates, list):
        errors.append("candidate_updates: expected array")
        updates = []
    received_ids = [item.get("candidate_id") for item in updates if isinstance(item, dict)]
    duplicate_ids = sorted({cid for cid in received_ids if received_ids.count(cid) > 1})
    if duplicate_ids:
        errors.append(f"candidate_updates: duplicate exact IDs {duplicate_ids}")
    missing_ids = sorted(set(expected_ids) - set(received_ids))
    unexpected_ids = sorted(set(received_ids) - set(expected_ids), key=str)
    if missing_ids:
        errors.append(f"candidate_updates: missing expected IDs {missing_ids}")
    if unexpected_ids:
        errors.append(f"candidate_updates: unexpected IDs {unexpected_ids}; fuzzy matching is forbidden")

    for index, update in enumerate(updates):
        path = f"candidate_updates[{index}]"
        if not exact_keys(update, UPDATE_KEYS, path, errors):
            if not isinstance(update, dict):
                continue
        if update.get("research_level") != "level_1":
            errors.append(f"{path}.research_level must be level_1")
        update_date = iso_date(update.get("researched_at"), f"{path}.researched_at", errors)
        if researched_at and update_date and researched_at != update_date:
            errors.append(f"{path}.researched_at must equal metadata researched_at")

        experience = update.get("experience_update")
        exact_keys(experience, EXPERIENCE_KEYS, f"{path}.experience_update", errors)
        if isinstance(experience, dict):
            enum(experience.get("trip_window_fit"), set(enums.get("trip_window_fit", [])), f"{path}.experience_update.trip_window_fit", errors)
            if not isinstance(experience.get("what_you_actually_do"), list):
                errors.append(f"{path}.experience_update.what_you_actually_do: expected array")

        temporal = update.get("temporal_profile_update")
        exact_keys(temporal, TEMPORAL_KEYS, f"{path}.temporal_profile_update", errors)
        if isinstance(temporal, dict):
            enum(temporal.get("time_constraint_type"), set(enums.get("time_constraint_type", [])), f"{path}.temporal_profile_update.time_constraint_type", errors)
            enum(temporal.get("early_start_required"), {True, False, "unknown"}, f"{path}.temporal_profile_update.early_start_required", errors)
            for array_key in ("hard_date_constraints", "operating_period", "closure_days", "fixed_event_dates", "transport_date_constraints"):
                if not isinstance(temporal.get(array_key), list):
                    errors.append(f"{path}.temporal_profile_update.{array_key}: expected array")
            position = temporal.get("trip_window_position")
            exact_keys(position, POSITION_KEYS, f"{path}.temporal_profile_update.trip_window_position", errors)
            if isinstance(position, dict):
                enum(position.get("position"), set(enums.get("trip_window_position", [])), f"{path}.temporal_profile_update.trip_window_position.position", errors)
                enum(position.get("preferred_trip_segment"), set(enums.get("preferred_trip_segment", [])), f"{path}.temporal_profile_update.trip_window_position.preferred_trip_segment", errors)
                enum(position.get("date_sensitivity"), set(enums.get("date_sensitivity", [])), f"{path}.temporal_profile_update.trip_window_position.date_sensitivity", errors)
                enum(position.get("timing_evidence_strength"), {"high", "medium", "low", "unknown"}, f"{path}.temporal_profile_update.trip_window_position.timing_evidence_strength", errors)
                enum(position.get("year_to_year_variability"), {"high", "medium", "low", "unknown"}, f"{path}.temporal_profile_update.trip_window_position.year_to_year_variability", errors)
                enum(position.get("worth_reordering_route_for_timing"), {True, False, "unknown", None}, f"{path}.temporal_profile_update.trip_window_position.worth_reordering_route_for_timing", errors)
                preferred_dates = position.get("preferred_dates_within_trip")
                if not isinstance(preferred_dates, list):
                    errors.append(f"{path}.temporal_profile_update.trip_window_position.preferred_dates_within_trip: expected array")
                else:
                    for date_index, item in enumerate(preferred_dates):
                        item_path = f"{path}.temporal_profile_update.trip_window_position.preferred_dates_within_trip[{date_index}]"
                        exact_keys(item, PREFERRED_DATE_KEYS, item_path, errors)
                        start = iso_date(item.get("start_date"), f"{item_path}.start_date", errors)
                        end = iso_date(item.get("end_date"), f"{item_path}.end_date", errors)
                        if start and end and not (TRIP_START <= start <= end <= TRIP_END):
                            errors.append(f"{item_path}: dates must fall inside the trip window")
                        enum(item.get("preference_strength"), {"strongly_preferred", "preferred", "slightly_preferred"}, f"{item_path}.preference_strength", errors)
                        enum(item.get("evidence_strength"), {"high", "medium", "low", "unknown"}, f"{item_path}.evidence_strength", errors)

        visual = update.get("visual_evidence_update")
        exact_keys(visual, VISUAL_KEYS, f"{path}.visual_evidence_update", errors)
        if isinstance(visual, dict):
            assets = visual.get("assets")
            if not isinstance(assets, list):
                errors.append(f"{path}.visual_evidence_update.assets: expected array")
            else:
                for asset_index, asset in enumerate(assets):
                    asset_path = f"{path}.visual_evidence_update.assets[{asset_index}]"
                    exact_keys(asset, ASSET_KEYS, asset_path, errors)
                    enum(asset.get("asset_type"), {"image", "video"}, f"{asset_path}.asset_type", errors)
                    enum(asset.get("source_type"), set(enums.get("visual_source_type", [])), f"{asset_path}.source_type", errors)
                    enum(asset.get("visual_relevance_to_trip"), set(enums.get("visual_relevance_to_trip", [])), f"{asset_path}.visual_relevance_to_trip", errors)
                    iso_date(asset.get("verified_at"), f"{asset_path}.verified_at", errors, nullable=True)
                    if not asset.get("asset_url") and not asset.get("source_page_url"):
                        errors.append(f"{asset_path}: retain source_page_url when asset_url is unavailable")

        source_packs = update.get("source_packs_update")
        exact_keys(source_packs, SOURCE_PACK_KEYS, f"{path}.source_packs_update", errors)
        if isinstance(source_packs, dict):
            for pack_name, links in source_packs.items():
                if not isinstance(links, list):
                    errors.append(f"{path}.source_packs_update.{pack_name}: expected array")
                    continue
                for link_index, link in enumerate(links):
                    link_path = f"{path}.source_packs_update.{pack_name}[{link_index}]"
                    exact_keys(link, LINK_KEYS, link_path, errors)
                    if isinstance(link, dict) and not link.get("url"):
                        errors.append(f"{link_path}.url: required")
                    if isinstance(link, dict):
                        iso_date(link.get("verified_at"), f"{link_path}.verified_at", errors, nullable=True)

        for array_name in ("uncertainties", "dynamic_recheck_items", "level_2_attention"):
            validate_object_array(update.get(array_name), array_name, f"{path}.{array_name}", errors)

    findings = delta.get("batch_findings")
    exact_keys(findings, BATCH_FINDING_KEYS, "batch_findings", errors)
    if isinstance(findings, dict):
        for name in BATCH_FINDING_KEYS:
            validate_object_array(findings.get(name), name, f"batch_findings.{name}", errors)
            for item in findings.get(name) or []:
                if isinstance(item, dict) and item.get("candidate_id") not in expected_ids:
                    errors.append(f"batch_findings.{name}: candidate_id {item.get('candidate_id')!r} is outside {batch_id}")

    canonical_by_id = {row["candidate_id"]: row for row in master.get("candidates", [])}
    conflicts: list[dict[str, Any]] = []
    for update in updates:
        candidate = canonical_by_id.get(update.get("candidate_id"))
        if not candidate:
            continue
        comparisons = {
            "experience": update.get("experience_update", {}),
            "temporal_profile": update.get("temporal_profile_update", {}),
            "visual_evidence": update.get("visual_evidence_update", {}),
        }
        for section, proposed in comparisons.items():
            baseline_flat = flatten_meaningful(candidate.get(section, {}))
            proposed_flat = flatten_meaningful(proposed)
            suffix = "_update"
            for proposed_path, new_value in proposed_flat.items():
                old_value = baseline_flat.get(proposed_path)
                if meaningful(old_value) and old_value != new_value:
                    conflicts.append({
                        "candidate_id": update["candidate_id"],
                        "field": f"{section}.{proposed_path.removesuffix(suffix)}",
                        "old_finding": old_value,
                        "new_finding": new_value,
                        "evidence": update.get("source_packs_update", {}),
                        "researched_at": update.get("researched_at"),
                        "current_interpretation": "Level 1 overlay is newer; baseline remains preserved for review.",
                    })

    return {
        "batch_id": batch_id,
        "expected_ids": expected_ids,
        "received_ids": received_ids,
        "missing_ids": missing_ids,
        "unexpected_ids": unexpected_ids,
        "errors": errors,
        "conflicts": conflicts,
    }


def print_preview(delta: dict[str, Any], report: dict[str, Any]) -> None:
    print("LEVEL 1 DELTA PREVIEW — canonical data has not been modified")
    print(f"Batch: {report['batch_id']}")
    print(f"Expected IDs ({len(report['expected_ids'])}): {', '.join(report['expected_ids']) or '—'}")
    print(f"Received IDs ({len(report['received_ids'])}): {', '.join(map(str, report['received_ids'])) or '—'}")
    print(f"Missing IDs: {', '.join(report['missing_ids']) or 'none'}")
    print(f"Unexpected IDs: {', '.join(map(str, report['unexpected_ids'])) or 'none'}")
    print(f"Schema / enum errors ({len(report['errors'])}):")
    for error in report["errors"]:
        print(f"  - {error}")
    if not report["errors"]:
        print("  none")
    print("Proposed updates:")
    for update in delta.get("candidate_updates", []):
        exp = sorted(flatten_meaningful(update.get("experience_update", {})))
        temporal = sorted(flatten_meaningful(update.get("temporal_profile_update", {})))
        packs = update.get("source_packs_update", {})
        link_count = sum(len(value) for value in packs.values() if isinstance(value, list))
        asset_count = len(update.get("visual_evidence_update", {}).get("assets", []))
        print(
            f"  - {update.get('candidate_id')}: experience={len(exp)}, temporal={len(temporal)}, "
            f"evidence_links={link_count}, visual_assets={asset_count}, "
            f"uncertainties={len(update.get('uncertainties', []))}, "
            f"dynamic_rechecks={len(update.get('dynamic_recheck_items', []))}, "
            f"L2_attention={len(update.get('level_2_attention', []))}"
        )
    print(f"Conflicts retained for review ({len(report['conflicts'])}):")
    for conflict in report["conflicts"]:
        print(f"  - {conflict['candidate_id']} · {conflict['field']}")
    if not report["conflicts"]:
        print("  none")


def apply_delta(delta_path: Path, delta: dict[str, Any], report: dict[str, Any], confirmation: str | None) -> None:
    batch_id = report["batch_id"]
    expected_confirmation = f"APPLY-{batch_id}"
    if report["errors"]:
        raise ValueError("Refusing apply because preview contains schema, enum, or ID errors.")
    if confirmation != expected_confirmation:
        raise ValueError(f"Explicit confirmation required: --confirm {expected_confirmation}")

    master = load_json(MASTER_PATH)
    for candidate in master["candidates"]:
        for overlay in candidate.get("research_overlays", []):
            if overlay.get("overlay_type") == "level_1_research_delta" and overlay.get("batch_id") == batch_id:
                raise ValueError(f"Batch {batch_id} is already applied; duplicate overlays are forbidden.")

    archive_name = f"{batch_id}_{delta['research_metadata']['researched_at']}_{delta_path.name}"
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = ARCHIVE_DIR / archive_name
    if archive_path.exists():
        raise ValueError(f"Immutable archive target already exists: {archive_path}")
    shutil.copy2(delta_path, archive_path)

    updates = {row["candidate_id"]: row for row in delta["candidate_updates"]}
    conflicts_by_id: dict[str, list[dict[str, Any]]] = {}
    for conflict in report["conflicts"]:
        conflicts_by_id.setdefault(conflict["candidate_id"], []).append(conflict)
    applied_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    archive_ref = archive_path.relative_to(ROOT).as_posix()
    for candidate in master["candidates"]:
        update = updates.get(candidate["candidate_id"])
        if not update:
            continue
        candidate.setdefault("research_overlays", []).append(
            {
                "overlay_type": "level_1_research_delta",
                "batch_id": batch_id,
                "research_level": "level_1",
                "researched_at": update["researched_at"],
                "applied_at": applied_at,
                "source_file": archive_ref,
                "merge_action": "append_only_overlay_baseline_preserved",
                "record": copy.deepcopy(update),
                "conflicts": conflicts_by_id.get(candidate["candidate_id"], []),
            }
        )
        candidate["research_status"] = "level_1_complete"
        if update.get("dynamic_recheck_items"):
            candidate["dynamic_recheck_required"] = True
    master.setdefault("changelog", []).append(
        {
            "date": applied_at,
            "action": "apply_level_1_delta",
            "batch_id": batch_id,
            "source_file": archive_ref,
            "candidate_ids": report["received_ids"],
            "merge_rule": "append-only research overlays; baseline and conflicts preserved",
        }
    )

    temp_path = MASTER_PATH.with_suffix(".json.tmp")
    temp_path.write_text(json.dumps(master, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp_path, MASTER_PATH)
    print(f"Applied {batch_id} to append-only overlays; archived {archive_ref}; inbox source preserved.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("delta", type=Path, help="Independent Level 1 delta JSON file")
    parser.add_argument("--apply", action="store_true", help="Apply after a clean preview")
    parser.add_argument("--confirm", help="Required explicit token, for example APPLY-L1-01")
    args = parser.parse_args()
    try:
        delta_path = args.delta.resolve()
        delta = load_json(delta_path)
        master = load_json(MASTER_PATH)
        batches = load_json(BATCH_PATH)
        report = validate_delta(delta, master, batches)
        print_preview(delta, report)
        if args.apply:
            apply_delta(delta_path, delta, report, args.confirm)
        elif args.confirm:
            raise ValueError("--confirm has no effect without --apply")
        return 1 if report["errors"] else 0
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
