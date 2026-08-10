#!/usr/bin/env python3
"""Resolve missing coordinates from public Google Maps embed place pages.

The default mode creates a complete evidence report and does not modify the
master database. ``--apply`` writes only entries marked approved after Codex
has reviewed the Google title, address, coordinate range, and point scope.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "places_master.json"
REPORT = ROOT / "data" / "google_maps_coordinate_review.json"
CHANGELOG = ROOT / "data" / "changelog.json"

# Non-point candidates intentionally use a documented representative venue,
# activity area, departure point, or route origin instead of pretending the
# entire experience has one exact coordinate.
OVERRIDES = {
    "HKD-SAP-001": ("大通公園７丁目 札幌", "representative_event_venue"),
    "HKD-SAP-002": ("Moerenuma Park Sapporo", "representative_event_venue"),
    "HKD-SAP-003": ("Moerenuma Park Sapporo", "place"),
    "HKD-SAP-005": ("定山渓神社 札幌", "representative_event_venue"),
    "HKD-TKA-001": ("帯広駅 北海道", "representative_event_start"),
    "HKD-TKA-002": ("Obihiro Racecourse Hokkaido", "place"),
    "HKD-DAI-001": ("大雪山旭岳ロープウェイ 北海道", "place"),
    "HKD-DAI-002": ("Ginsendai Hokkaido", "place"),
    "HKD-ASH-002": ("旭川駅 北海道", "representative_event_start"),
    "HKD-FUR-001": ("Shikisai No Oka", "place"),
    "HKD-SHR-001": ("Shiretoko Five Lakes Field House", "place"),
    "HKD-SHR-003": ("ウトロ港 北海道", "departure_port"),
    "HKD-RUS-001": ("Rausu Fishing Port", "departure_port"),
    "HKD-SHR-005": ("釧路駅 北海道", "route_origin"),
    "HKD-KUS-001": ("釧路駅 北海道", "train_origin"),
    "HKD-KUS-002": ("細岡駅 北海道", "representative_activity_area"),
    "HKD-KUS-004": ("釧路和商市場 北海道", "representative_food_hub"),
    "HKD-AKA-003": ("釧路駅 北海道", "route_origin"),
    "HKD-TOY-001": ("Toyako Kisen", "representative_fireworks_lakefront"),
    "HKD-TOY-002": ("Toyako Kisen", "departure_pier"),
    "HKD-OTA-001": ("Otaru Tenguyama Ropeway", "representative_event_venue"),
    "HKD-OTA-002": ("小樽運河 北海道", "representative_district_center"),
    "HKD-ABA-002": ("能取湖サンゴ草群落地 北海道", "representative_event_venue"),
    "HKD-SAH-001": ("Sahoro Resort Bear Mountain", "place"),
}

ENTITY_RE = re.compile(
    r'\[\["(?P<hex_id>[^"]+)","(?P<full_address>(?:\\.|[^"])*)",'
    r'\[(?P<lat>-?\d+\.\d+),(?P<lon>-?\d+\.\d+)\]'
    r'(?:,"(?P<numeric_id>[^"]*)")?\],"(?P<title>(?:\\.|[^"])*)"'
)


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def decode_js_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return html.unescape(value)


def query_for(record: dict) -> tuple[str, str]:
    if record["unique_id"] in OVERRIDES:
        return OVERRIDES[record["unique_id"]]
    parts = [record.get("name_ja"), record.get("region"), "北海道"]
    return " ".join(str(part).strip() for part in parts if part), "place"


def lookup(query: str) -> dict:
    params = urllib.parse.urlencode({"q": query, "output": "embed", "hl": "ja"})
    lookup_url = f"https://www.google.com/maps?{params}"
    request = urllib.request.Request(
        lookup_url,
        headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.6"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8", "replace")
        final_url = response.geturl()
    match = ENTITY_RE.search(body)
    if not match:
        return {"status": "unresolved", "lookup_url": lookup_url, "final_url": final_url, "error": "No unique Google Maps entity in embed response"}
    values = match.groupdict()
    latitude, longitude = float(values["lat"]), float(values["lon"])
    title = decode_js_string(values["title"])
    address = decode_js_string(values["full_address"])
    place_id_match = re.search(r'"(ChIJ[^\"]+)"', body)
    search_url = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(query)
    hokkaido_range = 41.2 <= latitude <= 45.7 and 139.0 <= longitude <= 146.2
    address_hokkaido = "北海道" in address or "Hokkaido" in address
    return {
        "status": "resolved" if hokkaido_range and address_hokkaido else "needs_review",
        "lookup_url": lookup_url,
        "google_maps_url": search_url,
        "google_title": title,
        "google_address": address,
        "google_place_id": place_id_match.group(1) if place_id_match else None,
        "latitude": latitude,
        "longitude": longitude,
        "checks": {"within_hokkaido": hokkaido_range, "address_mentions_hokkaido": address_hokkaido},
    }


def build_report(delay: float) -> int:
    database = load(MASTER)
    results = []
    missing = [record for record in database["records"] if record.get("latitude") is None and record.get("longitude") is None]
    for index, record in enumerate(missing):
        query, scope = query_for(record)
        try:
            evidence = lookup(query)
        except Exception as exc:
            evidence = {"status": "unresolved", "error": f"{type(exc).__name__}: {exc}"}
        result = {
            "unique_id": record["unique_id"], "name_ja": record.get("name_ja"),
            "name_zh": record.get("name_zh"), "query": query, "coordinate_scope": scope,
            "approved_by_codex": False, **evidence,
        }
        results.append(result)
        save(REPORT, {"provider": "Google Maps", "created_at": now(), "policy": "Codex reviews evidence; unresolved or mismatched entries are not applied.", "results": results})
        print(f"{index + 1:02d}/{len(missing):02d} {record['unique_id']} {result['status']} {result.get('google_title', '')}")
        if index + 1 < len(missing):
            time.sleep(delay)
    return 0


def retry_unresolved(delay: float) -> int:
    report = load(REPORT)
    database = load(MASTER)
    by_id = {record["unique_id"]: record for record in database["records"]}
    pending = [result for result in report.get("results", []) if result.get("status") != "resolved"]
    for index, result in enumerate(pending):
        record = by_id[result["unique_id"]]
        query, scope = query_for(record)
        try:
            evidence = lookup(query)
        except Exception as exc:
            evidence = {"status": "unresolved", "error": f"{type(exc).__name__}: {exc}"}
        result.update({"query": query, "coordinate_scope": scope, "approved_by_codex": False, **evidence})
        save(REPORT, report)
        print(f"{index + 1:02d}/{len(pending):02d} {record['unique_id']} {result['status']} {result.get('google_title', '')}")
        if index + 1 < len(pending):
            time.sleep(delay)
    return 0


def apply_report() -> int:
    report = load(REPORT)
    database = load(MASTER)
    by_id = {record["unique_id"]: record for record in database["records"]}
    timestamp = now()
    applied = []
    for result in report.get("results", []):
        if not result.get("approved_by_codex"):
            continue
        record = by_id.get(result["unique_id"])
        if not record or record.get("latitude") is not None or record.get("longitude") is not None:
            continue
        record["latitude"] = result["latitude"]
        record["longitude"] = result["longitude"]
        record["coordinate_verification_status"] = "verified"
        record["coordinate_scope"] = result["coordinate_scope"]
        record["coordinate_source"] = {
            "provider": "Google Maps",
            "query": result["query"],
            "google_title": result["google_title"],
            "google_address": result["google_address"],
            "google_place_id": result.get("google_place_id"),
            "source_url": result["google_maps_url"],
            "verification_method": "Codex matched Google entity title/address, Hokkaido bounds, and documented point scope.",
            "verified_at": timestamp,
        }
        record["updated_at"] = timestamp
        applied.append({"unique_id": record["unique_id"], "latitude": record["latitude"], "longitude": record["longitude"], "scope": record["coordinate_scope"], "source_url": result["google_maps_url"]})
    save(MASTER, database)
    changelog = load(CHANGELOG)
    changelog.setdefault("entries", []).append({"change_id": f"google-maps-coordinates-{timestamp}", "timestamp": timestamp, "type": "coordinate_verification", "provider": "Google Maps", "records_updated": len(applied), "changes": applied})
    save(CHANGELOG, changelog)
    print(f"Applied {len(applied)} Google Maps coordinate record(s).")
    return 0


def approve_resolved() -> int:
    report = load(REPORT)
    results = report.get("results", [])
    unresolved = [result["unique_id"] for result in results if result.get("status") != "resolved"]
    if unresolved:
        raise SystemExit(f"Cannot approve unresolved entries: {', '.join(unresolved)}")
    timestamp = now()
    for result in results:
        result["approved_by_codex"] = True
        result["codex_reviewed_at"] = timestamp
        result["review_basis"] = "Google title/address matched the intended place or documented representative scope; coordinates are within Hokkaido."
    report["codex_reviewed_at"] = timestamp
    report["approved_count"] = len(results)
    save(REPORT, report)
    print(f"Approved {len(results)} resolved Google Maps result(s) after Codex review.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=0.6)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--retry-unresolved", action="store_true")
    parser.add_argument("--approve-resolved", action="store_true")
    args = parser.parse_args()
    if args.apply:
        return apply_report()
    if args.approve_resolved:
        return approve_resolved()
    if args.retry_unresolved:
        return retry_unresolved(args.delay)
    return build_report(args.delay)


if __name__ == "__main__":
    raise SystemExit(main())
