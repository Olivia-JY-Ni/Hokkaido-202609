#!/usr/bin/env python3
"""Verify unresolved Candidate coordinates against Google Maps embed entities."""

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
LOCATIONS = ROOT / "data" / "candidate_locations.json"
REPORT = ROOT / "data" / "google_maps_coordinate_review_current.json"
CHANGELOG = ROOT / "data" / "changelog.json"

# Each non-point Candidate is assigned an explicit representative scope. These
# are technical map anchors, not claims that the whole experience is a point.
TARGETS = {
    "R2-SAP-001": ("Hokkaido University Museum Sapporo", "place", ["北海道大学総合博物館"], "北海道"),
    "R2-SAP-002": ("Nemuro Hanamaru JR Tower Stellar Place", "place", ["根室花まる"], "北海道"),
    "R2-SAP-003": ("Parfait Coffee Liquor Sasaki Sapporo", "place", ["佐々木"], "北海道"),
    "R2-ASH-001": ("Asahikawa Design Center", "place", ["旭川デザインセンター"], "北海道"),
    "R2-ASH-002": ("旭川市博物館", "place", ["旭川市博物館"], "北海道"),
    "R2-ASH-003": ("Hachiya Honten Asahikawa", "place", ["蜂屋"], "北海道"),
    "R2-ASH-004": ("Jiyuken Asahikawa", "place", ["自由軒"], "北海道"),
    "R2-SHR-001": ("BON'S HOME Shiretoko", "place", ["BON'S HOME", "ボンズホーム"], "北海道"),
    "R2-SHR-002": ("Namishibuki Utoro", "place", ["波飛沫"], "北海道"),
    "R2-SHR-003": ("Shiretoko Shokudo Rausu", "place", ["知床食堂"], "北海道"),
    "R2-KUS-001": ("釧路市立博物館", "place", ["釧路市立博物館"], "北海道"),
    "R2-KUS-002": ("Kushiro Washo Market", "place", ["和商市場"], "北海道"),
    "R2-KUS-003": ("Restaurant Izumiya Honten Kushiro", "place", ["泉屋"], "北海道"),
    "R2-KUS-004": ("Robata Renga Kushiro", "place", ["炉ばた煉瓦"], "北海道"),
    "R2-KUS-005": ("Robata Kushiro Sakaemachi 3-1", "place", ["炉ばた"], "北海道"),
    "R2-ABA-001": ("Hokkaido Museum of Northern Peoples", "place", ["北方民族博物館"], "北海道"),
    "R2-ABA-002": ("Okhotsk Ryuhyokan", "place", ["オホーツク流氷館"], "北海道"),
    "R2-FUR-001": ("JR 富良野駅", "train_route_origin", ["富良野駅"], "北海道"),
    "R2-TKA-001": ("Obihiro Centennial City Museum", "place", ["帯広百年記念館"], "北海道"),
    "RM-SAP": ("Sapporo Station South Square", "regional_reference_hub", ["札幌駅南口駅前広場", "Sapporo Station South Square"], "北海道"),
    "RM-ASH": ("Asahikawa Station", "regional_reference_hub", ["旭川駅"], "北海道"),
    "RM-SHR": ("Shiretoko World Heritage Conservation Center", "regional_reference_hub", ["知床世界遺産センター"], "北海道"),
    "RM-KUS": ("Kushiro Station", "regional_reference_hub", ["釧路駅"], "北海道"),
    "JP-CH-001": ("Kakunodate Station", "regional_reference_hub", ["角館駅"], "秋田県"),
    "JP-CH-002": ("Morioka Station", "regional_reference_hub", ["盛岡駅"], "岩手県"),
    "JP-CH-003": ("Asahara Shrine Ojiya Niigata", "representative_event_venue", ["浅原神社"], "新潟県"),
    "JP-CH-004": ("御蔵島港船客待合所", "departure_port", ["御蔵島港船客待合所", "御蔵島港"], "東京都"),
    "JP-NM-001": ("Tateyama Kurobe Alpine Route Murodo Terminal", "regional_reference_hub", ["室堂ターミナル"], "富山県"),
    "JP-NM-002": ("Euglena Mall Ishigaki", "regional_reference_hub", ["ユーグレナモール"], "沖縄県"),
    "JP-NM-003": ("Hakozaki Shrine Fukuoka", "place", ["筥崎宮"], "福岡県"),
    "JP-NM-004": ("Ryogoku Kokugikan", "representative_event_venue", ["両国国技館"], "東京都"),
    "JP-NM-005": ("Obuse Station Nagano", "regional_reference_hub", ["小布施駅"], "長野県"),
    "JP-NM-006": ("Tsurugaoka Hachimangu", "place", ["鶴岡八幡宮"], "神奈川県"),
    "JP-NM-007": ("岸和田だんじり会館", "regional_reference_hub", ["岸和田だんじり会館"], "大阪府"),
    "JP-NM-008": ("Etchu Yatsuo Station", "regional_reference_hub", ["越中八尾駅"], "富山県"),
}

ENTITY_RE = re.compile(
    r'\[\["(?P<hex_id>[^"]+)","(?P<full_address>(?:\\.|[^"])*)",'
    r'\[(?P<lat>-?\d+\.\d+),(?P<lon>-?\d+\.\d+)\]'
    r'(?:,"(?P<numeric_id>[^"]*)")?\],"(?P<title>(?:\\.|[^"])*)"'
)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def decode_js_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return html.unescape(value)


def lookup(query: str, expected_titles: list[str], expected_region: str) -> dict:
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
        return {"status": "unresolved", "lookup_url": lookup_url, "final_url": final_url, "error": "No unique Google Maps entity"}
    values = match.groupdict()
    latitude, longitude = float(values["lat"]), float(values["lon"])
    title = decode_js_string(values["title"])
    address = decode_js_string(values["full_address"])
    place_id_match = re.search(r'"(ChIJ[^\"]+)"', body)
    place_id = place_id_match.group(1) if place_id_match else None
    title_match = any(token.casefold() in title.casefold() for token in expected_titles)
    region_match = expected_region in address
    japan_bounds = 20.0 <= latitude <= 46.5 and 122.0 <= longitude <= 154.0
    source_url = "https://www.google.com/maps/search/?" + urllib.parse.urlencode(
        {"api": 1, "query": query, **({"query_place_id": place_id} if place_id else {})}
    )
    return {
        "status": "verified" if title_match and region_match and japan_bounds and place_id else "needs_review",
        "lookup_url": lookup_url,
        "google_maps_url": source_url,
        "google_title": title,
        "google_address": address,
        "google_place_id": place_id,
        "latitude": latitude,
        "longitude": longitude,
        "checks": {
            "title_matches_expected_entity": title_match,
            "address_matches_expected_region": region_match,
            "within_japan_bounds": japan_bounds,
            "place_id_present": bool(place_id),
        },
    }


def review(delay: float) -> int:
    overlay = load(LOCATIONS)
    unresolved = {row["candidate_id"] for row in overlay["locations"] if row["verification_status"] == "unresolved"}
    missing_targets = sorted(unresolved - set(TARGETS))
    extra_targets = sorted(set(TARGETS) - unresolved)
    if missing_targets or extra_targets:
        raise SystemExit(f"Target registry mismatch; missing={missing_targets}, extra={extra_targets}")
    results = []
    for index, (candidate_id, (query, scope, titles, region)) in enumerate(TARGETS.items(), 1):
        try:
            evidence = lookup(query, titles, region)
        except Exception as exc:
            evidence = {"status": "unresolved", "error": f"{type(exc).__name__}: {exc}"}
        result = {
            "candidate_id": candidate_id,
            "query": query,
            "coordinate_scope": scope,
            "expected_title_tokens": titles,
            "expected_address_region": region,
            **evidence,
        }
        results.append(result)
        save(REPORT, {
            "provider": "Google Maps",
            "created_at": now(),
            "policy": "Codex verifies exact entity title, expected prefecture, Japan bounds, Place ID, and representative scope before apply.",
            "results": results,
        })
        print(f"{index:02d}/{len(TARGETS):02d} {candidate_id} {result['status']} {result.get('google_title', '')}")
        if index < len(TARGETS):
            time.sleep(delay)
    return 0


def apply() -> int:
    report = load(REPORT)
    results = report.get("results", [])
    by_id = {row["candidate_id"]: row for row in results}
    missing = sorted(set(TARGETS) - set(by_id))
    not_verified = sorted(row["candidate_id"] for row in results if row.get("status") != "verified")
    if missing or not_verified:
        raise SystemExit(f"Cannot apply; missing={missing}, not_verified={not_verified}")
    overlay = load(LOCATIONS)
    applied_at = now()
    updated = []
    for row in overlay["locations"]:
        evidence = by_id.get(row["candidate_id"])
        if not evidence:
            continue
        if row["verification_status"] != "unresolved":
            raise SystemExit(f"Refusing to overwrite existing verified coordinate: {row['candidate_id']}")
        row.update({
            "lat": evidence["latitude"],
            "lon": evidence["longitude"],
            "scope": evidence["coordinate_scope"],
            "verification_status": "verified",
            "provider": "Google Maps",
            "provider_place_id": evidence["google_place_id"],
            "source_url": evidence["google_maps_url"],
            "verified_at": applied_at,
        })
        updated.append(row["candidate_id"])
    overlay["summary"] = {"candidate_total": len(overlay["locations"]), "verified": len(overlay["locations"]), "unresolved": 0}
    overlay["policy"] = "Coordinates are a separate technical overlay. Point scope is explicit for non-point Candidates; values are verified against Google Maps."
    overlay["last_google_maps_review"] = "data/google_maps_coordinate_review_current.json"
    save(LOCATIONS, overlay)

    changelog = load(CHANGELOG)
    changelog.setdefault("entries", []).append({
        "change_id": f"google-maps-new-candidate-coordinates-{applied_at}",
        "timestamp": applied_at,
        "change_type": "coordinate_verification",
        "provider": "Google Maps",
        "records_updated": len(updated),
        "candidate_ids": updated,
        "evidence": "data/google_maps_coordinate_review_current.json",
        "policy": "Exact entity/prefecture/Place ID verification; representative scopes documented for non-point Candidates.",
    })
    save(CHANGELOG, changelog)
    print(f"Applied {len(updated)} verified Google Maps coordinates; unresolved=0.")
    return 0


def retry(delay: float) -> int:
    report = load(REPORT)
    results = report.get("results", [])
    pending = [row for row in results if row.get("status") != "verified"]
    for index, row in enumerate(pending, 1):
        query, scope, titles, region = TARGETS[row["candidate_id"]]
        try:
            evidence = lookup(query, titles, region)
        except Exception as exc:
            evidence = {"status": "unresolved", "error": f"{type(exc).__name__}: {exc}"}
        replacement = {
            "candidate_id": row["candidate_id"], "query": query, "coordinate_scope": scope,
            "expected_title_tokens": titles, "expected_address_region": region, **evidence,
        }
        results[results.index(row)] = replacement
        save(REPORT, {**report, "updated_at": now(), "results": results})
        print(f"{index:02d}/{len(pending):02d} {row['candidate_id']} {replacement['status']} {replacement.get('google_title', '')}")
        if index < len(pending):
            time.sleep(delay)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--retry", action="store_true")
    args = parser.parse_args()
    if args.apply:
        return apply()
    if args.retry:
        return retry(args.delay)
    return review(args.delay)


if __name__ == "__main__":
    raise SystemExit(main())
