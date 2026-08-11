#!/usr/bin/env python3
"""Dependency-free project tests used locally and in GitHub Actions."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

import level1_delta
import validate_data


ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def empty_update(candidate_id: str) -> dict:
    return {
        "candidate_id": candidate_id,
        "research_level": "level_1",
        "researched_at": "2026-08-10",
        "experience_update": {
            "experience_summary": None,
            "what_you_actually_do": [],
            "why_people_love_it": None,
            "common_disappointments": None,
            "sep_2026_experience": None,
            "trip_window_fit": "uncertain",
            "realistic_duration": None,
            "weather_dependency": None,
            "language_dependency": None,
            "physical_load": None,
            "luggage_friction": None,
        },
        "temporal_profile_update": {
            "ideal_seasonal_window": None,
            "seasonal_progression_summary": None,
            "trip_window_position": {
                "position": "unknown",
                "preferred_dates_within_trip": [],
                "preferred_trip_segment": "unknown",
                "why_these_dates_are_better": None,
                "date_sensitivity": "unknown",
                "penalty_if_done_earlier": None,
                "penalty_if_done_later": None,
                "worth_reordering_route_for_timing": None,
                "timing_evidence_strength": "unknown",
                "year_to_year_variability": "unknown",
            },
            "time_constraint_type": "unknown",
            "hard_date_constraints": [],
            "operating_period": [],
            "closure_days": [],
            "fixed_event_dates": [],
            "transport_date_constraints": [],
            "recommended_time_of_day": None,
            "recommended_visit_time": None,
            "why_this_time_is_better": None,
            "penalty_if_visited_at_other_time": None,
            "early_start_required": "unknown",
            "early_start_reason": None,
        },
        "visual_evidence_update": {
            "assets": [],
            "what_should_be_visible_during_2026_09_05_18": None,
            "what_is_unlikely_to_be_visible": None,
            "season_mismatch_note": None,
            "perspective_warning": None,
        },
        "source_packs_update": {
            "official_links": [],
            "travel_review_links": [],
            "social_links": [],
            "video_links": [],
        },
        "uncertainties": [],
        "dynamic_recheck_items": [],
        "level_2_attention": [],
    }


def main() -> int:
    failures: list[str] = []
    validation_errors = validate_data.validate()
    failures.extend(validation_errors)

    master_path = ROOT / "data" / "hokkaido_places_master.json"
    master = json.loads(master_path.read_text(encoding="utf-8"))
    batches = json.loads((ROOT / "data" / "research_batches_level1.json").read_text(encoding="utf-8"))
    first_batch = batches["batches"][0]
    valid_delta = {
        "research_metadata": {
            "batch_id": first_batch["batch_id"],
            "research_level": "level_1",
            "schema_version": batches["schema_version"],
            "researched_at": "2026-08-10",
            "travel_window": {"start": "2026-09-05", "end": "2026-09-18"},
        },
        "candidate_updates": [empty_update(cid) for cid in first_batch["candidate_ids"]],
        "batch_findings": {
            "high_temporal_sensitivity": [],
            "visual_misrepresentation_risks": [],
            "insufficient_evidence": [],
            "recommended_level_2_attention": [],
        },
    }
    before = digest(master_path)
    report = level1_delta.validate_delta(valid_delta, master, batches)
    after = digest(master_path)
    if report["errors"]:
        failures.append(f"valid Level 1 template rejected: {report['errors']}")
    if before != after:
        failures.append("delta preview validation mutated the canonical file")

    invalid_delta = copy.deepcopy(valid_delta)
    invalid_delta["candidate_updates"][0]["candidate_id"] = "FUZZY-NOT-ALLOWED"
    invalid_report = level1_delta.validate_delta(invalid_delta, master, batches)
    if not invalid_report["missing_ids"] or not invalid_report["unexpected_ids"] or not invalid_report["errors"]:
        failures.append("exact-ID validation did not reject a missing/unexpected candidate")

    app_text = (ROOT / "web" / "app.js").read_text(encoding="utf-8")
    styles_text = (ROOT / "web" / "styles.css").read_text(encoding="utf-8")
    adapter_text = (ROOT / "web" / "data-adapter.js").read_text(encoding="utf-8")
    index_text = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    loader_text = (ROOT / "web" / "google-maps-loader.js").read_text(encoding="utf-8")
    pages_text = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
    if "hokkaido_places_master.json" not in app_text:
        failures.append("web app does not consume the current canonical filename")
    if "places_master.json" in app_text.replace("hokkaido_places_master.json", ""):
        failures.append("web app still references the legacy canonical filename")
    if "buildCandidateViewModels" not in adapter_text:
        failures.append("nested-schema adapter is missing")
    if "google_maps_area_catalog.json" not in app_text or 'view: "areas"' not in app_text:
        failures.append("empty user-created area planner is not the default entry")
    if "candidate_regions.json" in app_text or "baseRegionByCandidate" in app_text:
        failures.append("web app still loads preset areas or automatic Candidate assignments")
    if "area-map-marker" not in index_text + app_text or "⭐" not in app_text:
        failures.append("star-only itinerary area marker is missing")
    if "data-toggle-area-candidates" not in app_text or "aria-expanded" not in app_text:
        failures.append("quick Candidate expand/collapse control is missing from area cards")
    if "data-open-picker" not in app_text or "pickerSelection" not in app_text or "areaForCandidate" not in app_text:
        failures.append("manual searchable batch Candidate assignment is missing")
    if 'data-view="areas"' not in index_text or 'data-view="candidates"' not in index_text:
        failures.append("area and all-Candidate planner views are not both available")
    if "COLORS[item.category]" not in app_text or "fitBounds" not in app_text or "map.setView" not in app_text:
        failures.append("typed Candidate map colors or selected-area zoom behavior is missing")
    if "selectedCandidateId" not in app_text or "focusCandidate" not in app_text or "focusMapAt" not in app_text:
        failures.append("candidate list/map selection state is missing")
    if "map.flyTo" not in app_text or "map.setZoom(zoom)" not in app_text or "dataset.focusZoom" not in app_text:
        failures.append("candidate clicks do not provide deterministic map zoom feedback")
    if "candidate-group" not in app_text or "candidateRegion" not in app_text or "北海道以外的备选" not in app_text:
        failures.append("the complete Candidate library is not grouped into user-facing regions")
    if "data-quick-add-candidate" not in app_text or "data-assign-candidate" not in app_text or "assignCandidateToArea" not in app_text:
        failures.append("candidate details do not offer a direct add-to-area workflow")
    if "data-open-candidate-detail" not in app_text or "showDetails = false" not in app_text:
        failures.append("candidate selection is not separated from the explicit detail action")
    if "item.status" in app_text or "item.location?.scope" in app_text:
        failures.append("internal research or coordinate status leaked into the user-facing Candidate detail")
    if "在 Google Maps 打开" in index_text + app_text or "google_maps_url" in app_text:
        failures.append("deferred Google Maps external-open feature was added")
    if "AutocompleteSuggestion.fetchAutocompleteSuggestions" not in app_text or "AutocompleteSessionToken" not in app_text:
        failures.append("live Google Maps area autocomplete with billing sessions is missing")
    autocomplete_request = app_text.split("AutocompleteSuggestion.fetchAutocompleteSuggestions", 1)[-1].split("});", 1)[0]
    if 'includedPrimaryTypes:' in autocomplete_request or 'includedRegionCodes:' in autocomplete_request:
        failures.append("live Google Maps search still filters out valid places or countries")
    if "radius: 850000" in app_text:
        failures.append("Places autocomplete uses a circle radius beyond Google's 50 km limit")
    core_place_fields = ('"viewport"', '"types"', '"businessStatus"', '"addressComponents"')
    if 'await place.fetchFields({ fields: ["id","displayName","formattedAddress","location","viewport","primaryType","types","businessStatus","addressComponents"] })' not in app_text or any(field not in app_text for field in core_place_fields):
        failures.append("selected live area does not fetch identity, coordinates, viewport, type, status, and address structure")
    if "Place.searchNearby" not in app_text or "includedPrimaryTypes" not in app_text or "data-nearby-type" not in app_text:
        failures.append("on-demand Google Nearby Search exploration is missing")
    route_requirements = (
        "Route.computeRoutes", "computeAlternativeRoutes", 'travelMode === "TRANSIT"',
        "transitPreference", "allowedTransitModes", "FEWER_TRANSFERS", "LESS_WALKING",
        "departureTime", "arrivalTime", "transitDetails", "transitFare", "headwayMillis",
        "savedRoutes", "selectRouteOption", "activateSavedRoute", "routeDetailsOpen",
        "routes.googleapis.com/directions/v2:computeRoutes", "computeTransitRoutesREST", "GEO_JSON_LINESTRING",
        "DirectionsService", "computeTransitDirectionsLegacy", "provideRouteAlternatives",
    )
    if any(requirement not in app_text + index_text for requirement in route_requirements):
        failures.append("two-place multimodal route search, comparison, schedules, or saved-map routes are incomplete")
    navitime_requirements = (
        "NAVITIME_HOST", "computeNavitimeTransitRoutes", "serializeNavitimeRouteOption", "navitime-route-totalnavi.p.rapidapi.com",
        "/route_transit", "X-RapidAPI-Key", "reference_fare", "railway_calling_at", "navitimeConnection",
        "navitimeSaveNotice", "recordNavitimeAsCustom", 'option.provider === "navitime"', "免费额度 500 次",
        "navitimeQuotaUsage", "navitimeQuotaRemaining", "navitimeQuotaBar", "updateNavitimeQuota",
        "x-rate-limit-rapid-free-plans-hard-limit-remaining", "x-ratelimit-requests-remaining",
    )
    if any(requirement not in app_text + index_text + styles_text for requirement in navitime_requirements):
        failures.append("NAVITIME Basic transit search, connection UI, attribution, or non-persistent result handling is incomplete")
    if "YOUR_API_KEY" in app_text + index_text or "x-rapidapi-key': '" in app_text.lower():
        failures.append("a NAVITIME RapidAPI key placeholder or literal was committed to the public frontend")
    custom_route_requirements = ("addCustomRouteOption", "openCustomRouteEditor", "编辑自定义路线", "customRouteName", "customRouteCost", "customStops", "custom: true", "dashed: Boolean")
    if any(requirement not in app_text + index_text for requirement in custom_route_requirements):
        failures.append("custom transport routes for unlisted buses, ferries, or shuttles are incomplete")
    if "loadCandidateGoogleDetails" not in app_text or "regularOpeningHours" not in app_text or "userRatingCount" not in app_text or "accessibilityOptions" not in app_text:
        failures.append("on-demand Google Candidate details are missing")
    route_ui = ("tripRouteSummary", "routesView", "routeOriginSearch", "routeDestinationSearch", "routeModeTabs", "routeResults", "savedRoutesList", "customRoutePanel")
    if any(element not in index_text for element in route_ui) or "nearbySheet" not in index_text:
        failures.append("route planner, saved route, custom route, or nearby exploration UI is missing")
    direct_route_requirements = ("launchRoutePlanner", "data-plan-route-to-candidate", "data-plan-route-from-candidate", "data-plan-route-to-area", "data-plan-route-from-area", "data-plan-route-to-preview", "data-plan-route-from-preview", "route-quick-actions")
    if any(requirement not in app_text + index_text + styles_text for requirement in direct_route_requirements):
        failures.append("selected places cannot directly open route planning as origin or destination")
    if 'mapProvider = "google"' not in app_text or 'importLibrary("maps")' not in app_text:
        failures.append("Google Places results are not paired with a Google map")
    if "initLeafletMap" not in app_text or "无法正确加载 Google 地图" not in app_text:
        failures.append("the planner does not recover to its verified catalog map when Google billing is unavailable")
    if "google-maps-config.js" not in index_text or "google-maps-loader.js" not in index_text:
        failures.append("Google Maps runtime configuration is not loaded by the web app")
    if "GOOGLE_MAPS_API_KEY" not in pages_text or "secrets.GOOGLE_MAPS_API_KEY" not in pages_text:
        failures.append("Pages deployment does not inject the restricted browser key")
    if "AIza" in app_text + loader_text + index_text + pages_text:
        failures.append("a Google Maps browser key was committed directly to source")
    deferred_transfer_hooks = ("exportTrip", "importTrip", "data-export-trip", "data-import-trip")
    if any(hook in app_text for hook in deferred_transfer_hooks):
        failures.append("deferred trip data import/export feature was added")
    if (ROOT / "data" / "places_master.json").exists():
        failures.append("legacy places_master.json remains as a competing current canonical")
    if not (ROOT / "data" / "history" / "places_master_legacy_42.json").exists():
        failures.append("legacy 42-record source was not preserved as history")

    if failures:
        print("Project tests failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Project tests passed: structural QA, exact-ID delta preview, non-mutation, web adapter, and legacy preservation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
