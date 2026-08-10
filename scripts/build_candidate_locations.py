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
    existing = load_json(OUTPUT_PATH) if OUTPUT_PATH.exists() else {"locations": []}
    existing_by_id = {row["candidate_id"]: row for row in existing.get("locations", [])}

    locations = []
    verified_count = 0
    for candidate in master["candidates"]:
        candidate_id = candidate["candidate_id"]
        old = legacy_by_id.get(candidate_id)
        source = (old or {}).get("coordinate_source") or {}
        legacy_verified = bool(
            old
            and old.get("coordinate_verification_status") == "verified"
            and isinstance(old.get("latitude"), (int, float))
            and isinstance(old.get("longitude"), (int, float))
        )
        current = existing_by_id.get(candidate_id, {})
        current_verified = current.get("verification_status") == "verified"
        verified = legacy_verified or current_verified
        if verified:
            verified_count += 1
        if legacy_verified:
            locations.append({
                "candidate_id": candidate_id,
                "lat": old.get("latitude"), "lon": old.get("longitude"),
                "scope": old.get("coordinate_scope"), "verification_status": "verified",
                "provider": source.get("provider"), "provider_place_id": source.get("google_place_id"),
                "source_url": source.get("source_url"), "verified_at": source.get("verified_at"),
            })
        elif current_verified:
            locations.append({key: current.get(key) for key in (
                "candidate_id", "lat", "lon", "scope", "verification_status", "provider",
                "provider_place_id", "source_url", "verified_at",
            )})
        else:
            locations.append({
                "candidate_id": candidate_id, "lat": None, "lon": None, "scope": None,
                "verification_status": "unresolved", "provider": None, "provider_place_id": None,
                "source_url": None, "verified_at": None,
            })

    payload = {
        "schema_version": "1.0.0",
        "generated_from": {
            "canonical": "data/hokkaido_places_master.json",
            "legacy_coordinate_source": "data/history/places_master_legacy_42.json",
        },
        "policy": existing.get("policy", "Coordinates are a separate technical overlay. Unresolved values are never guessed."),
        "summary": {
            "candidate_total": len(locations),
            "verified": verified_count,
            "unresolved": len(locations) - verified_count,
        },
        "locations": locations,
    }
    if existing.get("last_google_maps_review"):
        payload["last_google_maps_review"] = existing["last_google_maps_review"]
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote data/candidate_locations.json: {len(locations)} candidates, "
        f"{verified_count} verified, {len(locations) - verified_count} unresolved."
    )


if __name__ == "__main__":
    main()
