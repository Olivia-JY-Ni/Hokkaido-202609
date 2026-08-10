#!/usr/bin/env python3
"""Prepare human-reviewed coordinates for places with missing coordinates.

Search mode writes candidates to data/geocode_review.json and never changes the
master database. Confirmation mode applies one explicitly selected result.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "places_master.json"
REVIEW = ROOT / "data" / "geocode_review.json"
CHANGELOG = ROOT / "data" / "changelog.json"
ENDPOINT = "https://nominatim.openstreetmap.org/search"


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_blank(value) -> bool:
    return value is None or value == ""


def query_for(record: dict) -> str:
    address = str(record.get("address") or "").strip()
    if address:
        return address
    parts = [record.get("name_ja"), record.get("municipality"), record.get("region"), "北海道 日本"]
    return " ".join(str(part).strip() for part in parts if part)


def search(query: str, limit: int) -> list[dict]:
    params = urllib.parse.urlencode({"q": query, "format": "jsonv2", "addressdetails": 1, "limit": limit, "countrycodes": "jp"})
    request = urllib.request.Request(
        f"{ENDPOINT}?{params}",
        headers={"User-Agent": "HokkaidoTripResearchDB/1.0 (personal local research tool)"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = json.load(response)
    return [
        {
            "display_name": item.get("display_name"),
            "latitude": float(item["lat"]),
            "longitude": float(item["lon"]),
            "type": item.get("type"),
            "importance": item.get("importance"),
            "osm_type": item.get("osm_type"),
            "osm_id": item.get("osm_id"),
            "raw_result": item,
        }
        for item in raw
    ]


def create_review(limit: int, max_places: int | None) -> int:
    database = load(MASTER)
    missing = [r for r in database["records"] if is_blank(r.get("latitude")) and is_blank(r.get("longitude"))]
    if max_places is not None:
        missing = missing[:max_places]
    review = {
        "created_at": now(),
        "provider": "OpenStreetMap Nominatim",
        "policy": "Pending human confirmation; no coordinate is written automatically.",
        "items": [],
    }
    for index, record in enumerate(missing):
        query = query_for(record)
        try:
            results = search(query, limit)
            error = None
        except Exception as exc:  # preserve failure instead of inventing a result
            results = []
            error = f"{type(exc).__name__}: {exc}"
        review["items"].append({
            "unique_id": record["unique_id"],
            "name_zh": record.get("name_zh"),
            "query": query,
            "result_count": len(results),
            "ambiguous": len(results) != 1,
            "status": "pending_human_confirmation",
            "error": error,
            "results": results,
        })
        if index + 1 < len(missing):
            time.sleep(1.1)
    save(REVIEW, review)
    print(f"Wrote {len(review['items'])} pending item(s) to {REVIEW}; master was not changed.")
    return 0


def confirm(unique_id: str, candidate_index: int) -> int:
    review = load(REVIEW)
    item = next((x for x in review.get("items", []) if x.get("unique_id") == unique_id), None)
    if not item:
        raise SystemExit(f"No pending review item for {unique_id}")
    results = item.get("results") or []
    if candidate_index < 0 or candidate_index >= len(results):
        raise SystemExit("Candidate index is outside the available result list.")
    chosen = results[candidate_index]
    database = load(MASTER)
    record = next((r for r in database["records"] if r.get("unique_id") == unique_id), None)
    if not record:
        raise SystemExit(f"Place no longer exists: {unique_id}")
    if not is_blank(record.get("latitude")) or not is_blank(record.get("longitude")):
        raise SystemExit("Place already has coordinates; refusing to overwrite them.")
    timestamp = now()
    record["latitude"] = chosen["latitude"]
    record["longitude"] = chosen["longitude"]
    record["coordinate_verification_status"] = "verified"
    record["coordinate_source"] = {
        "provider": review.get("provider"),
        "query": item.get("query"),
        "selected_result": chosen,
        "confirmed_at": timestamp,
    }
    record["updated_at"] = timestamp
    save(MASTER, database)
    changelog = load(CHANGELOG)
    changelog.setdefault("entries", []).append({
        "change_id": f"coordinate-{unique_id}-{timestamp}",
        "timestamp": timestamp,
        "type": "coordinate_human_confirmation",
        "unique_id": unique_id,
        "query": item.get("query"),
        "selected_result": chosen,
    })
    save(CHANGELOG, changelog)
    item["status"] = "confirmed"
    item["confirmed_candidate_index"] = candidate_index
    item["confirmed_at"] = timestamp
    save(REVIEW, review)
    print(f"Confirmed coordinates for {unique_id}.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5, help="Results retained per query")
    parser.add_argument("--max-places", type=int, help="Optional batch size")
    parser.add_argument("--confirm", metavar="UNIQUE_ID")
    parser.add_argument("--candidate-index", type=int)
    args = parser.parse_args()
    if args.confirm:
        if args.candidate_index is None:
            parser.error("--confirm requires --candidate-index")
        return confirm(args.confirm, args.candidate_index)
    return create_review(args.limit, args.max_places)


if __name__ == "__main__":
    sys.exit(main())
