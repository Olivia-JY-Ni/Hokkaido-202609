#!/usr/bin/env python3
"""Stage and apply non-destructive Deep Research imports.

Default mode creates a reviewable preview. Applying requires the preview file
and verifies both source and master hashes before changing the canonical data.
Possible duplicates are never merged automatically.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "data" / "places_master.json"
CHANGELOG = ROOT / "data" / "changelog.json"
INBOX = ROOT / "research_inbox"
ARCHIVE = ROOT / "research_archive"
PREVIEW = ROOT / "data" / "import_preview.json"
JUDGMENT_FIELDS = {
    "experience_quality", "fit_to_user", "route_shaping_power", "season_fit",
    "season_uniqueness", "public_transport_friction", "luggage_friction",
    "physical_load", "weather_risk", "evidence_confidence", "decision_status",
    "decision_reason", "reconsider_if", "why_now", "why_not_now",
}


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def records_from(value: Any, source: Path) -> list[dict]:
    records = value.get("records") if isinstance(value, dict) else value
    if not isinstance(records, list) or not all(isinstance(item, dict) for item in records):
        raise ValueError(f"{source.name}: expected an array of record objects")
    return records


def normalized_name(record: dict) -> str:
    text = " ".join(str(record.get(k) or "") for k in ("name_zh", "name_ja", "name_en", "region"))
    text = unicodedata.normalize("NFKC", text).casefold()
    return re.sub(r"[^\w]+", "", text)


def stable_id(record: dict) -> str:
    identity = "|".join(str(record.get(k) or "") for k in ("name_ja", "name_en", "name_zh", "region", "municipality"))
    return "HKD-NEW-" + hashlib.sha1(identity.encode("utf-8")).hexdigest()[:10].upper()


def possible_duplicate(record: dict, existing: list[dict]) -> dict | None:
    needle = normalized_name(record)
    if not needle:
        return None
    best: tuple[float, dict | None] = (0.0, None)
    for candidate in existing:
        score = SequenceMatcher(None, needle, normalized_name(candidate)).ratio()
        if score > best[0]:
            best = (score, candidate)
    if best[0] >= 0.82 and best[1] is not None:
        return {"unique_id": best[1].get("unique_id"), "similarity": round(best[0], 3)}
    return None


def field_changes(old: dict, incoming: dict) -> list[dict]:
    changes = []
    for field, new_value in incoming.items():
        if field in {"unique_id", "created_at", "updated_at", "source_research_ids"}:
            continue
        old_value = old.get(field)
        if new_value != old_value:
            changes.append({
                "field": field,
                "old": old_value,
                "new": new_value,
                "requires_judgment_review": field in JUDGMENT_FIELDS,
            })
    return changes


def build_preview() -> int:
    master = load(MASTER)
    existing = master["records"]
    by_id = {record["unique_id"]: record for record in existing}
    files = sorted(path for path in INBOX.glob("*.json") if path.name != PREVIEW.name)
    if not files:
        print("No JSON research files found in research_inbox/.")
        return 0

    preview: dict[str, Any] = {
        "preview_version": "1.0.0",
        "created_at": now(),
        "master_sha256": digest(MASTER),
        "sources": [],
        "summary": {"new": 0, "existing": 0, "possible_duplicate": 0, "unchanged": 0},
        "actions": [],
    }
    for source in files:
        value = load(source)
        records = records_from(value, source)
        preview["sources"].append({"file": source.name, "sha256": digest(source), "record_count": len(records)})
        for incoming_original in records:
            incoming = dict(incoming_original)
            uid = str(incoming.get("unique_id") or "").strip()
            if uid and uid in by_id:
                changes = field_changes(by_id[uid], incoming)
                kind = "existing" if changes else "unchanged"
                preview["summary"][kind] += 1
                preview["actions"].append({"kind": kind, "source": source.name, "unique_id": uid, "changes": changes})
                continue
            duplicate = possible_duplicate(incoming, existing)
            if duplicate:
                preview["summary"]["possible_duplicate"] += 1
                preview["actions"].append({
                    "kind": "possible_duplicate", "source": source.name,
                    "incoming_unique_id": uid or None, "possible_match": duplicate,
                    "record": incoming,
                })
                continue
            uid = uid or stable_id(incoming)
            incoming["unique_id"] = uid
            preview["summary"]["new"] += 1
            preview["actions"].append({"kind": "new", "source": source.name, "unique_id": uid, "record": incoming})
    save(PREVIEW, preview)
    print(json.dumps(preview["summary"], ensure_ascii=False))
    print(f"Preview written to {PREVIEW}")
    print("Review it, then run with --apply data/import_preview.json.")
    return 0


def canonicalize_new(record: dict, source_stem: str, timestamp: str) -> dict:
    result = dict(record)
    for field in JUDGMENT_FIELDS:
        result.setdefault(field, None)
    result.setdefault("photos", [])
    result.setdefault("photo_sources", [])
    result.setdefault("latitude", None)
    result.setdefault("longitude", None)
    result.setdefault("coordinate_verification_status", "unverified")
    result["created_at"] = result.get("created_at") or timestamp
    result["updated_at"] = timestamp
    ids = list(result.get("source_research_ids") or [])
    if source_stem not in ids:
        ids.append(source_stem)
    result["source_research_ids"] = ids
    return result


def apply_preview(path: Path) -> int:
    preview = load(path)
    if digest(MASTER) != preview.get("master_sha256"):
        raise SystemExit("Master changed after preview; create a fresh preview.")
    for source_info in preview.get("sources", []):
        source = INBOX / source_info["file"]
        if not source.exists() or digest(source) != source_info.get("sha256"):
            raise SystemExit(f"Source changed after preview: {source_info['file']}")

    master = load(MASTER)
    by_id = {record["unique_id"]: record for record in master["records"]}
    timestamp = now()
    applied = []
    for action in preview.get("actions", []):
        kind = action.get("kind")
        if kind == "new":
            record = canonicalize_new(action["record"], Path(action["source"]).stem, timestamp)
            if record["unique_id"] in by_id:
                raise SystemExit(f"ID collision while applying: {record['unique_id']}")
            master["records"].append(record)
            by_id[record["unique_id"]] = record
            applied.append({"kind": "added", "unique_id": record["unique_id"], "source": action["source"]})
        elif kind == "existing":
            record = by_id[action["unique_id"]]
            changes_applied = []
            for change in action.get("changes", []):
                record[change["field"]] = change["new"]
                changes_applied.append(change)
            source_id = Path(action["source"]).stem
            ids = list(record.get("source_research_ids") or [])
            if source_id not in ids:
                ids.append(source_id)
            record["source_research_ids"] = ids
            record["updated_at"] = timestamp
            applied.append({"kind": "updated", "unique_id": action["unique_id"], "source": action["source"], "changes": changes_applied})
        # unchanged and possible_duplicate are intentionally not merged.

    master["record_count"] = len(master["records"])
    save(MASTER, master)
    changelog = load(CHANGELOG)
    changelog.setdefault("entries", []).append({
        "change_id": "import-" + timestamp.replace(":", "").replace("+", "_"),
        "timestamp": timestamp,
        "type": "research_merge",
        "preview_file": str(path.relative_to(ROOT)),
        "summary": preview.get("summary"),
        "changes": applied,
        "not_merged_possible_duplicates": [a for a in preview.get("actions", []) if a.get("kind") == "possible_duplicate"],
    })
    save(CHANGELOG, changelog)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    for source_info in preview.get("sources", []):
        source = INBOX / source_info["file"]
        archive_name = f"{timestamp[:10]}__{source.name}"
        destination = ARCHIVE / archive_name
        if destination.exists() and digest(destination) != digest(source):
            raise SystemExit(f"Archive filename collision: {destination.name}")
        if not destination.exists():
            shutil.copy2(source, destination)
    print(f"Applied {len(applied)} add/update action(s); possible duplicates were not merged.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", type=Path, help="Explicitly apply a reviewed preview file")
    args = parser.parse_args()
    return apply_preview(args.apply.resolve()) if args.apply else build_preview()


if __name__ == "__main__":
    sys.exit(main())
