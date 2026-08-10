#!/usr/bin/env python3
"""Build the default city/area grouping overlay for the front end."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MASTER_PATH = ROOT / "data" / "hokkaido_places_master.json"
LOCATIONS_PATH = ROOT / "data" / "candidate_locations.json"
OUTPUT_PATH = ROOT / "data" / "candidate_regions.json"

GROUPS = {
    "札幌": ("hokkaido-sapporo", "札幌 / 定山溪", "Japan"),
    "札幌周边": ("hokkaido-sapporo", "札幌 / 定山溪", "Japan"),
    "千岁": ("hokkaido-chitose", "千岁", "Japan"),
    "带广": ("hokkaido-tokachi", "十胜 / 带广 / 佐幌", "Japan"),
    "十胜": ("hokkaido-tokachi", "十胜 / 带广 / 佐幌", "Japan"),
    "十胜/带广": ("hokkaido-tokachi", "十胜 / 带广 / 佐幌", "Japan"),
    "十胜川": ("hokkaido-tokachi", "十胜 / 带广 / 佐幌", "Japan"),
    "佐幌": ("hokkaido-tokachi", "十胜 / 带广 / 佐幌", "Japan"),
    "大雪山": ("hokkaido-asahikawa-daisetsuzan", "旭川 / 大雪山", "Japan"),
    "旭川": ("hokkaido-asahikawa-daisetsuzan", "旭川 / 大雪山", "Japan"),
    "旭川 / 大雪山": ("hokkaido-asahikawa-daisetsuzan", "旭川 / 大雪山", "Japan"),
    "美瑛": ("hokkaido-furano-biei", "富良野 / 美瑛", "Japan"),
    "美瑛/富良野": ("hokkaido-furano-biei", "富良野 / 美瑛", "Japan"),
    "中富良野": ("hokkaido-furano-biei", "富良野 / 美瑛", "Japan"),
    "知床": ("hokkaido-shiretoko-utoro", "知床 / 宇登吕", "Japan"),
    "知床・ウトロ": ("hokkaido-shiretoko-utoro", "知床 / 宇登吕", "Japan"),
    "宇登吕": ("hokkaido-shiretoko-utoro", "知床 / 宇登吕", "Japan"),
    "罗臼": ("hokkaido-rausu", "罗臼", "Japan"),
    "羅臼": ("hokkaido-rausu", "罗臼", "Japan"),
    "钏路": ("hokkaido-kushiro-east", "钏路 / 道东", "Japan"),
    "钏路 / 道东": ("hokkaido-kushiro-east", "钏路 / 道东", "Japan"),
    "道东": ("hokkaido-kushiro-east", "钏路 / 道东", "Japan"),
    "阿寒湖": ("hokkaido-akan-mashu", "阿寒 / 摩周", "Japan"),
    "阿寒/摩周": ("hokkaido-akan-mashu", "阿寒 / 摩周", "Japan"),
    "洞爷湖": ("hokkaido-toyako", "洞爷湖", "Japan"),
    "登别": ("hokkaido-noboribetsu", "登别", "Japan"),
    "小樽": ("hokkaido-otaru", "小樽", "Japan"),
    "网走": ("hokkaido-abashiri", "网走 / 能取湖", "Japan"),
    "远轻": ("hokkaido-engaru", "远轻", "Japan"),
    "秋田・角馆": ("japan-kakunodate", "秋田 / 角馆", "Japan"),
    "岩手・花卷—盛冈": ("japan-morioka-hanamaki", "岩手 / 花卷 / 盛冈", "Japan"),
    "新潟・片贝": ("japan-katakai", "新潟 / 片贝", "Japan"),
    "御藏岛": ("japan-mikurajima", "御藏岛", "Japan"),
    "立山黑部・室堂 + 富山": ("japan-murodo-toyama", "立山黑部 / 室堂 / 富山", "Japan"),
    "石垣岛": ("japan-ishigaki", "石垣岛", "Japan"),
    "福冈・筥崎宫": ("japan-fukuoka-hakozaki", "福冈 / 筥崎宫", "Japan"),
    "东京・两国": ("japan-tokyo-ryogoku", "东京 / 两国", "Japan"),
    "长野・小布施": ("japan-obuse", "长野 / 小布施", "Japan"),
    "镰仓・鹤冈八幡宫": ("japan-kamakura", "镰仓 / 鹤冈八幡宫", "Japan"),
    "大阪・岸和田": ("japan-kishiwada", "大阪 / 岸和田", "Japan"),
    "富山八尾": ("japan-toyama-yatsuo", "富山 / 八尾", "Japan"),
}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    master = load(MASTER_PATH)
    locations = load(LOCATIONS_PATH)
    location_by_id = {row["candidate_id"]: row for row in locations["locations"]}
    grouped: dict[str, dict] = {}
    source_regions: dict[str, set[str]] = defaultdict(set)
    for candidate in master["candidates"]:
        source_region = candidate.get("region")
        if source_region not in GROUPS:
            raise SystemExit(f"No city/area mapping for {candidate['candidate_id']}: {source_region!r}")
        region_id, name, country = GROUPS[source_region]
        grouped.setdefault(region_id, {
            "region_id": region_id,
            "name_zh": name,
            "country": country,
            "entity_type": "city_or_area",
            "candidate_ids": [],
        })["candidate_ids"].append(candidate["candidate_id"])
        source_regions[region_id].add(source_region)

    regions = []
    for region_id, region in grouped.items():
        points = [location_by_id[cid] for cid in region["candidate_ids"] if location_by_id[cid]["verification_status"] == "verified"]
        region["center_lat"] = round(sum(point["lat"] for point in points) / len(points), 7)
        region["center_lon"] = round(sum(point["lon"] for point in points) / len(points), 7)
        region["coordinate_method"] = "centroid_of_verified_candidate_points"
        region["source_region_labels"] = sorted(source_regions[region_id])
        regions.append(region)
    regions.sort(key=lambda row: (not row["region_id"].startswith("hokkaido-"), row["name_zh"]))

    assigned = [cid for region in regions for cid in region["candidate_ids"]]
    payload = {
        "schema_version": "1.0.0",
        "generated_from": ["data/hokkaido_places_master.json", "data/candidate_locations.json"],
        "policy": "City/area entities are a UI grouping overlay, not Candidates. Browser-side manual assignment overrides never rewrite the research canonical.",
        "summary": {"region_total": len(regions), "assigned_candidate_total": len(assigned), "unassigned_candidate_total": len(master["candidates"]) - len(assigned)},
        "regions": regions,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(regions)} city/area groups; assigned={len(assigned)}, unassigned={len(master['candidates']) - len(assigned)}")


if __name__ == "__main__":
    main()
