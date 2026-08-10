#!/usr/bin/env python3
"""Create the canonical place database from the first research export.

This migration is intentionally reproducible and never writes to the source file.
Existing research fields are preserved verbatim. New planning fields remain null
unless they are operational metadata (timestamps, provenance, or empty arrays).
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path


NEW_NULL_FIELDS = [
    "experience_quality",
    "fit_to_user",
    "route_shaping_power",
    "season_fit",
    "season_uniqueness",
    "public_transport_friction",
    "luggage_friction",
    "physical_load",
    "weather_risk",
    "evidence_confidence",
    "decision_status",
    "decision_reason",
    "reconsider_if",
    "why_now",
    "why_not_now",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source", default="hokkaido_2026_sep_candidate_master.json"
    )
    parser.add_argument("--output", default="data/places_master.json")
    args = parser.parse_args()

    source = Path(args.source)
    output = Path(args.output)
    if source.resolve() == output.resolve():
        raise SystemExit("Refusing to overwrite the source research file.")

    original = json.loads(source.read_text(encoding="utf-8-sig"))
    records = original.get("records")
    if not isinstance(records, list):
        raise SystemExit("Source must contain a records array.")
    if original.get("record_count") != len(records):
        raise SystemExit("Source record_count does not match records length.")

    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    migrated = []
    for source_record in records:
        record = dict(source_record)
        for field in NEW_NULL_FIELDS:
            record.setdefault(field, None)
        record["photos"] = list(record.get("photos") or [])
        record["photo_sources"] = list(record.get("photo_sources") or [])
        record["latitude"] = None if record.get("latitude") == "" else record.get("latitude")
        record["longitude"] = None if record.get("longitude") == "" else record.get("longitude")
        record["created_at"] = record.get("created_at") or timestamp
        record["updated_at"] = record.get("updated_at") or timestamp
        research_ids = list(record.get("source_research_ids") or [])
        if source.stem not in research_ids:
            research_ids.append(source.stem)
        record["source_research_ids"] = research_ids
        migrated.append(record)

    all_fields = list(original.get("fields") or [])
    for field in NEW_NULL_FIELDS + [
        "photos",
        "photo_sources",
        "created_at",
        "updated_at",
        "source_research_ids",
    ]:
        if field not in all_fields:
            all_fields.append(field)

    canonical = {
        "schema_version": "2.0.0",
        "database_type": "canonical_operational_travel_database",
        "trip": {
            "trip_id": "hokkaido-2026-september",
            "title": "Hokkaido 2026 September Trip",
            "start_date": "2026-09-05",
            "end_date": "2026-09-18",
        },
        "record_count": len(migrated),
        "source_archive": original.get("source_archive"),
        "reconstruction_note": original.get("reconstruction_note"),
        "migration": {
            "source_file": source.name,
            "source_schema_version": original.get("schema_version"),
            "migrated_at": timestamp,
            "policy": "Original fields preserved; new judgment fields initialized without inference.",
        },
        "fields": all_fields,
        "records": migrated,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(canonical, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    changelog_path = output.parent / "changelog.json"
    if changelog_path.exists():
        changelog = json.loads(changelog_path.read_text(encoding="utf-8-sig"))
        entries = changelog.setdefault("entries", [])
        if not any(entry.get("change_id") == "initial-research-import" for entry in entries):
            entries.append(
                {
                    "change_id": "initial-research-import",
                    "timestamp": timestamp,
                    "type": "initial_research_import",
                    "source_file": source.name,
                    "records_added": len(migrated),
                    "records_deleted": 0,
                    "policy": "All source candidates preserved; new judgment fields initialized without inference.",
                }
            )
            changelog_path.write_text(
                json.dumps(changelog, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
    print(f"Migrated {len(migrated)} records to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
