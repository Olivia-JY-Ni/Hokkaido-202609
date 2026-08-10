(function (global) {
  "use strict";

  function unknown(value) {
    return value === null || value === undefined || value === "" || value === "unknown" ||
      (Array.isArray(value) && value.length === 0);
  }

  function mergeKnown(base, update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) return base;
    const result = { ...(base || {}) };
    Object.entries(update).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = mergeKnown(result[key], value);
      } else if (!unknown(value)) {
        result[key] = value;
      }
    });
    return result;
  }

  function dedupeLinks(groups) {
    const seen = new Set();
    return groups.flatMap(value => Array.isArray(value) ? value : []).filter(link => {
      const key = link?.url || JSON.stringify(link);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function latestLevel1Overlay(candidate) {
    return [...(candidate.research_overlays || [])]
      .filter(overlay => overlay.overlay_type === "level_1_research_delta")
      .sort((a, b) => String(a.applied_at || a.researched_at).localeCompare(String(b.applied_at || b.researched_at)))
      .at(-1) || null;
  }

  function originalRecord(candidate) {
    return (candidate.original_records || []).map(item => item?.record).find(Boolean) || {};
  }

  function buildCandidateViewModels(master, locations, batches) {
    const locationById = new Map((locations.locations || []).map(item => [item.candidate_id, item]));
    const batchById = new Map();
    (batches.batches || []).forEach(batch => {
      (batch.candidate_ids || []).forEach(candidateId => batchById.set(candidateId, batch));
    });

    return (master.candidates || []).map(candidate => {
      const overlay = latestLevel1Overlay(candidate);
      const update = overlay?.record || {};
      const experience = mergeKnown(candidate.experience, update.experience_update);
      const temporal = mergeKnown(candidate.temporal_profile, update.temporal_profile_update);
      const visual = mergeKnown(candidate.visual_evidence, update.visual_evidence_update);
      visual.assets = [
        ...(candidate.visual_evidence?.assets || []),
        ...(update.visual_evidence_update?.assets || []),
      ];
      const sourcePackNames = ["official_links", "travel_review_links", "social_links", "video_links", "unclassified_links"];
      const source_packs = {};
      sourcePackNames.forEach(name => {
        source_packs[name] = dedupeLinks([
          candidate.source_packs?.[name],
          update.source_packs_update?.[name],
        ]);
      });
      const location = locationById.get(candidate.candidate_id) || { verification_status: "unresolved" };
      const batch = batchById.get(candidate.candidate_id) || null;
      const original = originalRecord(candidate);
      const uncertainties = update.uncertainties || [];
      const dynamicRechecks = update.dynamic_recheck_items || [];
      const level2Attention = update.level_2_attention || [];
      return {
        id: candidate.candidate_id,
        candidate,
        name: candidate.name_zh || candidate.name_ja || candidate.name_en || candidate.candidate_id,
        names: { ja: candidate.name_ja, en: candidate.name_en, zh: candidate.name_zh },
        category: candidate.normalized_category,
        originalCategory: candidate.original_category,
        subcategory: candidate.subcategory,
        region: candidate.region,
        municipality: candidate.municipality,
        country: candidate.country,
        role: candidate.research_subject_role,
        eligible: candidate.level_1_eligible,
        status: candidate.research_status,
        batchId: batch?.batch_id || null,
        experience,
        temporal,
        visual,
        sourcePacks: source_packs,
        provenance: candidate.provenance || [],
        originalRecords: candidate.original_records || [],
        historicalAssessment: candidate.previous_research_assessment,
        relationships: candidate.relationships || {},
        location,
        original,
        uncertainties,
        dynamicRechecks,
        level2Attention,
        conflicts: overlay?.conflicts || [],
        latestOverlay: overlay,
        dynamicRecheckRequired: candidate.dynamic_recheck_required || dynamicRechecks.length > 0,
        hasVisualEvidence: visual.assets.length > 0,
        hasUncertainty: uncertainties.length > 0,
      };
    });
  }

  global.ResearchDataAdapter = { buildCandidateViewModels, unknown };
})(window);
