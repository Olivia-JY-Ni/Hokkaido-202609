#!/usr/bin/env python3
"""Build the browser-searchable city/area catalog from verified Google Maps entities."""

from __future__ import annotations

import json
import time
from datetime import datetime
from pathlib import Path

from geocode_candidate_locations_google import lookup


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "google_maps_area_catalog.json"

TARGETS = [
    ("札幌", "札幌市 北海道", ["札幌"], "北海道"),
    ("小樽", "小樽市 北海道", ["小樽"], "北海道"),
    ("千岁", "千歳市 北海道", ["千歳"], "北海道"),
    ("苫小牧", "苫小牧市 北海道", ["苫小牧"], "北海道"),
    ("登别", "登別市 北海道", ["登別"], "北海道"),
    ("洞爷湖", "洞爺湖町 北海道", ["洞爺湖"], "北海道"),
    ("函馆", "函館市 北海道", ["函館"], "北海道"),
    ("旭川", "旭川市 北海道", ["旭川"], "北海道"),
    ("美瑛", "美瑛町 北海道", ["美瑛"], "北海道"),
    ("富良野", "富良野市 北海道", ["富良野"], "北海道"),
    ("带广", "帯広市 北海道", ["帯広"], "北海道"),
    ("新得 / 佐幌", "新得町 北海道", ["新得"], "北海道"),
    ("钏路", "釧路市 北海道", ["釧路"], "北海道"),
    ("阿寒湖", "阿寒湖 北海道", ["阿寒湖"], "北海道"),
    ("弟子屈 / 摩周", "弟子屈町 北海道", ["弟子屈"], "北海道"),
    ("网走", "網走市 北海道", ["網走"], "北海道"),
    ("斜里 / 知床", "斜里町 北海道", ["斜里"], "北海道"),
    ("罗臼", "羅臼町 北海道", ["羅臼"], "北海道"),
    ("远轻", "遠軽町 北海道", ["遠軽"], "北海道"),
    ("北见", "北見市 北海道", ["北見"], "北海道"),
]


def main() -> int:
    places = []
    for index, (name_zh, query, title_tokens, expected_region) in enumerate(TARGETS, 1):
        result = lookup(query, title_tokens, expected_region)
        if result.get("status") != "verified":
            raise SystemExit(f"Google Maps verification failed for {query}: {result}")
        places.append({
            "place_id": result["google_place_id"],
            "name_zh": name_zh,
            "google_title": result["google_title"],
            "formatted_address": result["google_address"],
            "lat": result["latitude"],
            "lon": result["longitude"],
            "place_type": "city_or_area",
            "provider": "Google Maps",
            "verified_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "search_terms": sorted({name_zh, query, result["google_title"]}),
        })
        print(f"{index:02d}/{len(TARGETS):02d} verified")
        time.sleep(0.35)
    payload = {
        "schema_version": "1.0.0",
        "provider": "Google Maps",
        "policy": "Search catalog only. No place is in the itinerary and no Candidate is assigned by default.",
        "places": places,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(places)} verified Google Maps city/area entities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
