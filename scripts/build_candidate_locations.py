#!/usr/bin/env python3
"""Build the location overlay without modifying the research canonical file."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "hokkaido_places_master.json"
LEGACY_PATH = ROOT / "data" / "history" / "places_master_legacy_42.json"
OUTPUT_PATH = ROOT / "data" / "candidate_locations.json"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    master = load_json(MASTER_PATH)
    legacy = load_json(LEGACY_PATH)
    legacy_by_id = {row["unique_id"]: row for row in legacy["records"]}

    locations = []
    verified_count = 0
    for candidate in master["candidates"]:
        candidate_id = candidate["candidate_id"]
        old = legacy_by_id.get(candidate_id)
        source = (old or {}).get("coordinate_source") or {}
        verified = bool(
            old
            and old.get("coordinate_verification_status") == "verified"
            and isinstance(old.get("latitude"), (int, float))
            and isinstance(old.get("longitude"), (int, float))
        )
        if verified:
            verified_count += 1
        locations.append(
            {
                "candidate_id": candidate_id,
                "lat": old.get("latitude") if verified else None,
                "lon": old.get("longitude") if verified else None,
                "scope": old.get("coordinate_scope") if verified else None,
                "verification_status": "verified" if verified else "unresolved",
                "provider": source.get("provider") if verified else None,
                "provider_place_id": source.get("google_place_id") if verified else None,
                "source_url": source.get("source_url") if verified else None,
                "verified_at": source.get("verified_at") if verified else None,
            }
        )

    payload = {
        "schema_version": "1.0.0",
        "generated_from": {
            "canonical": "data/hokkaido_places_master.json",
            "legacy_coordinate_source": "data/history/places_master_legacy_42.json",
        },
        "policy": "Coordinates are a separate technical overlay. Unresolved values are never guessed.",
        "summary": {
            "candidate_total": len(locations),
            "verified": verified_count,
            "unresolved": len(locations) - verified_count,
        },
        "locations": locations,
    }
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote data/candidate_locations.json: {len(locations)} candidates, "
        f"{verified_count} verified, {len(locations) - verified_count} unresolved."
    )


if __name__ == "__main__":
    main()
