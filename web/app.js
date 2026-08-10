const STORAGE_KEY = "hokkaido-region-view-v1";
const state = {
  candidates: [], regions: [], routes: null, filtered: [], visibleRegions: [],
  selectedCategories: new Set(), view: "regions", assignmentOverrides: {},
  itineraryRegions: new Set(), itineraryCandidates: new Set(), dialog: null,
};
const $ = id => document.getElementById(id);
const CATEGORY_LABELS = {
  natural_outdoor: "自然与户外", animal_marine: "动物与海洋", event_festival: "活动与节庆",
  food_market_drink: "餐饮、市集与酒饮", dessert_cafe_bakery: "甜品、咖啡与烘焙",
  lodging_onsen: "住宿与温泉", architecture_museum_shop_workshop: "建筑、博物馆、商店与工坊",
  special_transport: "特别交通", regional_challenger_module: "区域 Challenger 模块",
};
const COLORS = {
  natural_outdoor: "#39785f", animal_marine: "#4d6697", event_festival: "#c29131",
  food_market_drink: "#bf5d3c", dessert_cafe_bakery: "#c6758e", lodging_onsen: "#8b5c86",
  architecture_museum_shop_workshop: "#697b82", special_transport: "#387b8c",
  regional_challenger_module: "#896e4d",
};
const FILTER_IDS = ["search", "category", "region", "l1Status", "l1Batch", "tripWindowFit", "dynamicRecheck", "visualEvidence", "uncertainty"];
const els = FILTER_IDS.reduce((result, id) => ({ ...result, [id]: $(id) }), {});
const unknown = value => window.ResearchDataAdapter.unknown(value);

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));
}
function shown(value, fallback = "未研究") {
  if (unknown(value)) return fallback;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.map(item => typeof item === "object" ? JSON.stringify(item, null, 2) : item).join("；");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
function labelCategory(value) { return CATEGORY_LABELS[value] || value || "unknown"; }
function validCoordinates(item) {
  const { lat, lon, verification_status: status } = item.location || {};
  return status === "verified" && typeof lat === "number" && typeof lon === "number" && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
function fillSelect(select, values, label = value => value) {
  [...new Set(values.filter(value => !unknown(value)))].sort((a, b) => String(a).localeCompare(String(b), "zh-Hans"))
    .forEach(value => {
      const option = document.createElement("option"); option.value = value; option.textContent = label(value); select.appendChild(option);
    });
}
function displayList(items, emptyText = "未研究") {
  if (!Array.isArray(items) || !items.length) return `<p class="unknown-value">${esc(emptyText)}</p>`;
  return `<ul class="research-list">${items.map(item => `<li>${esc(shown(item))}</li>`).join("")}</ul>`;
}
function dl(rows) { return `<dl>${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(shown(value))}</dd>`).join("")}</dl>`; }
function infoSection(title, content) { return `<section class="detail-section"><h3>${esc(title)}</h3>${content}</section>`; }
function linkList(links) {
  if (!links.length) return '<p class="unknown-value">尚无已记录证据链接</p>';
  return `<div class="source-list">${links.map(link => {
    const url = link.url || link.source_page_url || link.asset_url;
    const label = link.source_name || link.source_platform || url || "未命名来源";
    return url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
  }).join("")}</div>`;
}

function loadUserState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.assignmentOverrides = saved.assignmentOverrides && typeof saved.assignmentOverrides === "object" ? saved.assignmentOverrides : {};
    state.itineraryRegions = new Set(Array.isArray(saved.itineraryRegions) ? saved.itineraryRegions : []);
    state.itineraryCandidates = new Set(Array.isArray(saved.itineraryCandidates) ? saved.itineraryCandidates : []);
  } catch (_) {
    state.assignmentOverrides = {}; state.itineraryRegions = new Set(); state.itineraryCandidates = new Set();
  }
}
function saveUserState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    assignmentOverrides: state.assignmentOverrides,
    itineraryRegions: [...state.itineraryRegions],
    itineraryCandidates: [...state.itineraryCandidates],
  }));
}
function baseRegionByCandidate() {
  const result = new Map();
  state.regions.forEach(region => region.candidate_ids.forEach(candidateId => result.set(candidateId, region.region_id)));
  return result;
}
function regionIdForCandidate(candidateId) {
  if (Object.prototype.hasOwnProperty.call(state.assignmentOverrides, candidateId)) return state.assignmentOverrides[candidateId];
  return baseRegionByCandidate().get(candidateId) || null;
}
function candidatesForRegion(regionId) { return state.candidates.filter(candidate => regionIdForCandidate(candidate.id) === regionId); }
function regionById(regionId) { return state.regions.find(region => region.region_id === regionId); }
function regionNameForCandidate(candidateId) { return regionById(regionIdForCandidate(candidateId))?.name_zh || "未归属"; }

let map, markerLayer;
function initMap() {
  if (!window.L) {
    $("map").innerHTML = '<div class="empty-list">地图组件未载入。候选列表与筛选仍可使用；请检查网络后刷新。</div>';
    return;
  }
  map = L.map("map", { zoomControl: true }).setView([43.45, 142.7], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function setupFilters() {
  fillSelect(els.category, state.candidates.map(item => item.category), labelCategory);
  fillSelect(els.region, state.regions.map(item => item.name_zh));
  fillSelect(els.l1Status, state.candidates.map(item => item.status));
  fillSelect(els.l1Batch, state.candidates.map(item => item.batchId));
  fillSelect(els.tripWindowFit, state.candidates.map(item => item.experience.trip_window_fit));
  $("typeChips").innerHTML = Object.keys(CATEGORY_LABELS).map(category =>
    `<button class="chip" data-category="${esc(category)}">${esc(CATEGORY_LABELS[category])}</button>`).join("");
  $("typeChips").addEventListener("click", event => {
    const button = event.target.closest("[data-category]"); if (!button) return;
    const category = button.dataset.category;
    state.selectedCategories.has(category) ? state.selectedCategories.delete(category) : state.selectedCategories.add(category);
    button.classList.toggle("active", state.selectedCategories.has(category)); applyFilters();
  });
  Object.values(els).forEach(element => element.addEventListener(element.type === "search" ? "input" : "change", applyFilters));
  $("resetFilters").addEventListener("click", () => {
    Object.values(els).forEach(element => { element.type === "checkbox" ? element.checked = false : element.value = ""; });
    state.selectedCategories.clear(); document.querySelectorAll(".chip.active").forEach(chip => chip.classList.remove("active")); applyFilters();
  });
}

function candidateMatchesNonSearch(item) {
  if (els.category.value && item.category !== els.category.value) return false;
  if (els.region.value && regionNameForCandidate(item.id) !== els.region.value) return false;
  if (els.l1Status.value && item.status !== els.l1Status.value) return false;
  if (els.l1Batch.value && item.batchId !== els.l1Batch.value) return false;
  if (els.tripWindowFit.value && item.experience.trip_window_fit !== els.tripWindowFit.value) return false;
  if (els.dynamicRecheck.checked && !item.dynamicRecheckRequired) return false;
  if (els.visualEvidence.checked && !item.hasVisualEvidence) return false;
  if (els.uncertainty.checked && !item.hasUncertainty) return false;
  if (state.selectedCategories.size && !state.selectedCategories.has(item.category)) return false;
  return true;
}
function candidateSearchMatches(item, query) {
  if (!query) return true;
  return [item.id, item.name, item.names.ja, item.names.en, item.region, item.municipality, item.category,
    item.originalCategory, item.subcategory, item.experience.experience_summary].join(" ").toLowerCase().includes(query);
}
function applyFilters() {
  const query = els.search.value.trim().toLowerCase();
  state.filtered = state.candidates.filter(item => candidateMatchesNonSearch(item) && candidateSearchMatches(item, query));
  state.visibleRegions = state.regions.map(region => {
    const regionQueryMatch = query && [region.name_zh, region.region_id, ...(region.source_region_labels || [])].join(" ").toLowerCase().includes(query);
    const candidates = candidatesForRegion(region.region_id).filter(item => candidateMatchesNonSearch(item) && (regionQueryMatch || candidateSearchMatches(item, query)));
    return { ...region, candidates };
  }).filter(region => region.candidates.length > 0);
  renderList(); renderMarkers(); updateCounts(); renderLegend();
}

function candidateCard(item) {
  return `<button class="candidate-card" data-candidate-id="${esc(item.id)}">
    <span class="card-meta"><span>${esc(item.region || "unknown")}</span><span>·</span><span>${esc(labelCategory(item.category))}</span><span class="status">${esc(item.status || "L1 pending")}</span></span>
    <h3>${esc(item.name)}</h3><p class="names">${esc(item.names.ja || "")} ${item.names.en ? `· ${esc(item.names.en)}` : ""}</p>
    <p class="score-line"><span>FIT <strong>${esc(shown(item.experience.trip_window_fit, "unknown"))}</strong></span><span>BATCH <strong>${esc(item.batchId || "—")}</strong></span><span>TRIP <strong>${state.itineraryCandidates.has(item.id) ? "已加入" : "—"}</strong></span></p>
  </button>`;
}
function regionCard(region) {
  const selected = state.itineraryRegions.has(region.region_id);
  const allCandidates = candidatesForRegion(region.region_id);
  const allInTrip = allCandidates.length > 0 && allCandidates.every(item => state.itineraryCandidates.has(item.id));
  const categories = [...new Set(region.candidates.map(item => labelCategory(item.category)))];
  return `<article class="region-card" data-region-card="${esc(region.region_id)}">
    <button class="region-card-main" data-open-region="${esc(region.region_id)}">
      <span class="card-meta"><span>市 / 地区</span><span>·</span><span>${region.candidates.length} Candidates</span><span class="status">${selected ? "⭐ 行程中" : "未加入"}</span></span>
      <h3>${esc(region.name_zh)}</h3>
      <p class="region-categories">${categories.map(category => `<span>${esc(category)}</span>`).join("")}</p>
    </button>
    <div class="region-card-actions">
      <button class="secondary-button" data-toggle-region="${esc(region.region_id)}">${selected ? "取消 ⭐" : "加入行程 ⭐"}</button>
      <button class="text-button" data-batch-region="${esc(region.region_id)}">${allInTrip ? "移出全部 Candidates" : `批量加入 ${allCandidates.length} Candidates`}</button>
    </div>
  </article>`;
}
function renderList() {
  const railHeading = document.querySelector(".rail-heading h2");
  if (state.view === "regions") {
    railHeading.textContent = "市 / 地区";
    $("railCount").textContent = `${state.visibleRegions.length} 地区 · ${state.visibleRegions.reduce((sum, region) => sum + region.candidates.length, 0)} Candidates`;
    $("candidateList").innerHTML = state.visibleRegions.length ? state.visibleRegions.map(regionCard).join("") : '<div class="empty-list">没有符合当前筛选的市/地区。</div>';
  } else {
    railHeading.textContent = "全部 Candidates";
    $("railCount").textContent = `${state.filtered.length} / ${state.candidates.length}`;
    $("candidateList").innerHTML = state.filtered.length ? state.filtered.map(candidateCard).join("") : '<div class="empty-list">没有符合当前筛选的 Candidate。</div>';
  }
}

function regionIcon(region) {
  const selected = state.itineraryRegions.has(region.region_id);
  return L.divIcon({
    className: `region-map-marker${selected ? " selected" : ""}`,
    html: selected ? '<span aria-label="已加入行程">⭐</span>' : `<span>${candidatesForRegion(region.region_id).length}</span>`,
    iconSize: selected ? [34, 34] : [30, 30], iconAnchor: selected ? [17, 17] : [15, 15],
  });
}
function renderMarkers() {
  if (!markerLayer) return;
  markerLayer.clearLayers();
  const points = [];
  if (state.view === "regions") {
    state.visibleRegions.forEach(region => {
      const marker = L.marker([region.center_lat, region.center_lon], { icon: regionIcon(region), zIndexOffset: state.itineraryRegions.has(region.region_id) ? 1000 : 0 });
      marker.bindTooltip(`${esc(region.name_zh)} · ${region.candidates.length} Candidates`); marker.on("click", () => openRegion(region.region_id)); marker.addTo(markerLayer);
      points.push([region.center_lat, region.center_lon]);
    });
  } else {
    state.filtered.filter(validCoordinates).forEach(item => {
      const marker = L.circleMarker([item.location.lat, item.location.lon], { radius: 8, color: "#fff", weight: 2, fillColor: COLORS[item.category] || "#707774", fillOpacity: .95 });
      marker.bindTooltip(esc(item.name)); marker.on("click", () => openCandidate(item.id)); marker.addTo(markerLayer); points.push([item.location.lat, item.location.lon]);
    });
  }
  if (points.length) map.fitBounds(L.latLngBounds(points).pad(.15), { maxZoom: 10 });
  const notice = $("mapNotice"); notice.hidden = points.length > 0;
  if (!points.length) notice.textContent = state.view === "regions" ? "当前筛选没有市/地区。" : "当前筛选没有 Candidate。";
}
function updateCounts() {
  const visibleCandidates = state.view === "regions" ? state.visibleRegions.reduce((sum, region) => sum + region.candidates.length, 0) : state.filtered.length;
  $("visibleCount").textContent = visibleCandidates;
  $("markerCount").textContent = state.view === "regions" ? state.visibleRegions.length : state.filtered.filter(validCoordinates).length;
  $("itineraryCount").textContent = state.itineraryRegions.size;
}

function toggleRegionItinerary(regionId) {
  state.itineraryRegions.has(regionId) ? state.itineraryRegions.delete(regionId) : state.itineraryRegions.add(regionId);
  saveUserState(); applyFilters(); if (state.dialog?.type === "region" && state.dialog.id === regionId) openRegion(regionId, false);
}
function toggleRegionCandidates(regionId) {
  const candidates = candidatesForRegion(regionId);
  const allInTrip = candidates.length && candidates.every(item => state.itineraryCandidates.has(item.id));
  candidates.forEach(item => allInTrip ? state.itineraryCandidates.delete(item.id) : state.itineraryCandidates.add(item.id));
  saveUserState(); applyFilters(); if (state.dialog?.type === "region" && state.dialog.id === regionId) openRegion(regionId, false);
}
function toggleCandidateItinerary(candidateId) {
  state.itineraryCandidates.has(candidateId) ? state.itineraryCandidates.delete(candidateId) : state.itineraryCandidates.add(candidateId);
  saveUserState(); applyFilters(); if (state.dialog?.type === "candidate" && state.dialog.id === candidateId) openCandidate(candidateId, false);
}
function assignCandidates(candidateIds, regionId) {
  candidateIds.forEach(candidateId => { state.assignmentOverrides[candidateId] = regionId || null; });
  saveUserState(); applyFilters();
}

function renderCandidateRows(items, regionId) {
  return `<div class="region-candidate-list">${items.map(item => `<div class="region-candidate-row">
    <button class="candidate-row-main" data-open-candidate="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${esc(labelCategory(item.category))} · ${esc(item.status)}</span></button>
    <span class="candidate-trip-state">${state.itineraryCandidates.has(item.id) ? "已加入行程" : ""}</span>
    <button class="text-button" data-unassign-candidate="${esc(item.id)}" data-from-region="${esc(regionId)}">解除归属</button>
  </div>`).join("")}</div>`;
}
function openRegion(regionId, show = true) {
  const region = regionById(regionId); if (!region) return;
  const candidates = candidatesForRegion(regionId);
  const selected = state.itineraryRegions.has(regionId);
  const allInTrip = candidates.length && candidates.every(item => state.itineraryCandidates.has(item.id));
  const otherCandidates = state.candidates.filter(item => regionIdForCandidate(item.id) !== regionId);
  $("detailContent").innerHTML = `
    <header class="detail-hero"><p class="eyebrow">CITY / AREA · ${esc(region.region_id)}</p><h2>${esc(region.name_zh)}</h2><p class="alt-names">市/地区是独立前台实体，不是 Candidate</p></header>
    <div class="detail-body">
      <div class="detail-tags"><span class="detail-tag">市 / 地区</span><span class="detail-tag">${candidates.length} Candidates</span><span class="detail-tag">${selected ? "⭐ 行程中" : "未加入行程"}</span></div>
      <div class="region-detail-actions">
        <button class="primary-button" data-toggle-region="${esc(regionId)}">${selected ? "取消行程星标" : "加入行程并显示 ⭐"}</button>
        <button class="secondary-button" data-batch-region="${esc(regionId)}">${allInTrip ? "把全部 Candidates 移出行程" : "把全部 Candidates 加入行程"}</button>
      </div>
      ${infoSection("下属 Candidates", renderCandidateRows(candidates, regionId))}
      ${infoSection("批量调整 Candidate 归属", `<p class="assignment-help">可多选其他 Candidates；保存后它们会从原地区移动到“${esc(region.name_zh)}”。</p>
        <select id="regionCandidateAssignment" class="assignment-select" multiple size="8" aria-label="选择要移入此地区的 Candidates">
          ${otherCandidates.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · 当前：${esc(regionNameForCandidate(item.id))}</option>`).join("")}
        </select>
        <button class="secondary-button assignment-save" data-assign-to-region="${esc(regionId)}">把所选 Candidates 批量移入此地区</button>`)}
      ${infoSection("地区地图点", dl([["中心点", `${region.center_lat}, ${region.center_lon}`], ["计算方式", region.coordinate_method], ["原始地区标签", region.source_region_labels]]))}
    </div>`;
  state.dialog = { type: "region", id: regionId };
  if (show) $("detailDialog").showModal();
}

function renderVisualEvidence(item) {
  const visual = item.visual; const assets = visual.assets || [];
  const content = assets.length ? `<div class="gallery">${assets.map(asset => {
    const url = asset.asset_url || asset.source_page_url;
    const media = asset.asset_url && asset.asset_type === "image" ? `<img src="${esc(asset.asset_url)}" alt="${esc(asset.caption || item.name)}" loading="lazy">` : '<div class="photo-placeholder"><span>VISUAL SOURCE</span><p>查看来源页</p></div>';
    return `<figure>${url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${media}</a>` : media}<figcaption>${esc(shown(asset.what_this_image_is_showing || asset.caption))}</figcaption></figure>`;
  }).join("")}</div>` : '<div class="photo-placeholder"><span>VISUAL EVIDENCE</span><p>尚无已研究视觉证据</p></div>';
  return `${content}${dl([["旅行窗口应看到", visual.what_should_be_visible_during_2026_09_05_18], ["不太可能看到", visual.what_is_unlikely_to_be_visible], ["季节错配说明", visual.season_mismatch_note], ["视角警告", visual.perspective_warning]])}`;
}
function renderEvidence(item) {
  const links = Object.values(item.sourcePacks).flat();
  return `${linkList(links)}${dl([["Provenance", item.provenance.map(row => `${row.source_file} · ${row.source_section} · ${row.data_role}`)], ["Latest L1 overlay", item.latestOverlay ? `${item.latestOverlay.batch_id} · ${item.latestOverlay.researched_at}` : "L1 pending"], ["历史评估（不参与当前排名）", item.historicalAssessment]])}`;
}
function renderGaps(item) {
  const rows = [...item.uncertainties.map(value => ({ type: "不确定项", value })), ...item.dynamicRechecks.map(value => ({ type: "动态复核", value })), ...item.level2Attention.map(value => ({ type: "L2 attention", value })), ...item.conflicts.map(value => ({ type: "保留冲突", value }))];
  return rows.length ? `<ul class="research-list">${rows.map(row => `<li><strong>${esc(row.type)}</strong><br>${esc(shown(row.value))}</li>`).join("")}</ul>` : '<p class="unknown-value">尚未记录明确研究缺口；这不代表事实已经完备。</p>';
}
function openCandidate(id, show = true) {
  const item = state.candidates.find(candidate => candidate.id === id); if (!item) return;
  const temporal = item.temporal; const position = temporal.trip_window_position || {};
  const currentRegionId = regionIdForCandidate(item.id) || "";
  $("detailContent").innerHTML = `
    <header class="detail-hero"><p class="eyebrow">${esc(item.id)}</p><h2>${esc(item.name)}</h2><p class="alt-names">${esc(item.names.ja || "")}<br>${esc(item.names.en || "")}</p></header>
    <div class="detail-body">
      <div class="detail-tags"><span class="detail-tag">${esc(labelCategory(item.category))}</span><span class="detail-tag">${esc(item.region || "unknown")}</span><span class="detail-tag">${esc(regionNameForCandidate(item.id))}</span><span class="detail-tag">${state.itineraryCandidates.has(item.id) ? "已加入行程" : "未加入行程"}</span></div>
      ${infoSection("市 / 地区归属", `<div class="candidate-assignment-controls"><select id="candidateRegionSelect" aria-label="Candidate 市/地区归属"><option value="">未归属</option>${state.regions.map(region => `<option value="${esc(region.region_id)}"${region.region_id === currentRegionId ? " selected" : ""}>${esc(region.name_zh)}</option>`).join("")}</select><button class="secondary-button" data-save-candidate-region="${esc(item.id)}">保存归属</button><button class="text-button" data-toggle-candidate-trip="${esc(item.id)}">${state.itineraryCandidates.has(item.id) ? "移出行程" : "加入行程"}</button></div>`)}
      ${infoSection("Identity", dl([["Candidate ID", item.id], ["Entity type", item.candidate.entity_type], ["Research subject role", item.role], ["Original category", item.originalCategory], ["Subcategory", item.subcategory], ["Municipality", item.municipality], ["Coordinate", item.location.verification_status], ["Coordinate scope", item.location.scope]]))}
      ${infoSection("30 秒预览", dl([["Experience summary", item.experience.experience_summary], ["Why people love it", item.experience.why_people_love_it], ["Trip-window fit", item.experience.trip_window_fit]]))}
      ${infoSection("实际会做什么", displayList(item.experience.what_you_actually_do, "尚未完成 L1 行为步骤研究"))}
      ${infoSection("9/5–9/18 实际体验", dl([["Sep 2026 experience", item.experience.sep_2026_experience], ["Trip-window position", position.position], ["Preferred segment", position.preferred_trip_segment], ["Why these dates", position.why_these_dates_are_better]]))}
      ${infoSection("Temporal Experience Profile", dl([["Ideal seasonal window", temporal.ideal_seasonal_window], ["Seasonal progression", temporal.seasonal_progression_summary], ["Preferred dates", position.preferred_dates_within_trip], ["Date sensitivity", position.date_sensitivity], ["Time constraint type", temporal.time_constraint_type], ["Hard date constraints", temporal.hard_date_constraints], ["Operating period", temporal.operating_period], ["Closure days", temporal.closure_days], ["Recommended time", temporal.recommended_visit_time || temporal.recommended_time_of_day], ["Early start", temporal.early_start_required]]))}
      ${infoSection("Practical", dl([["Realistic duration", item.experience.realistic_duration], ["Weather dependency", item.experience.weather_dependency], ["Language dependency", item.experience.language_dependency], ["Physical load", item.experience.physical_load], ["Luggage friction", item.experience.luggage_friction], ["Address（历史原始记录）", item.original.address], ["Public transport（历史原始记录）", item.original.main_public_transport_access]]))}
      ${infoSection("可能失望之处", `<p>${esc(shown(item.experience.common_disappointments))}</p>`)}
      ${infoSection("Visual evidence", renderVisualEvidence(item))}
      ${infoSection("Evidence & provenance", renderEvidence(item))}
      ${infoSection("研究缺口", renderGaps(item))}
    </div>`;
  state.dialog = { type: "candidate", id: item.id };
  if (show) $("detailDialog").showModal();
}

function setupInteractions() {
  $("candidateList").addEventListener("click", event => {
    const openRegionButton = event.target.closest("[data-open-region]"); if (openRegionButton) return openRegion(openRegionButton.dataset.openRegion);
    const openCandidateButton = event.target.closest("[data-candidate-id]"); if (openCandidateButton) return openCandidate(openCandidateButton.dataset.candidateId);
    const toggleRegionButton = event.target.closest("[data-toggle-region]"); if (toggleRegionButton) return toggleRegionItinerary(toggleRegionButton.dataset.toggleRegion);
    const batchButton = event.target.closest("[data-batch-region]"); if (batchButton) return toggleRegionCandidates(batchButton.dataset.batchRegion);
  });
  $("detailContent").addEventListener("click", event => {
    const openCandidateButton = event.target.closest("[data-open-candidate]"); if (openCandidateButton) return openCandidate(openCandidateButton.dataset.openCandidate, false);
    const toggleRegionButton = event.target.closest("[data-toggle-region]"); if (toggleRegionButton) return toggleRegionItinerary(toggleRegionButton.dataset.toggleRegion);
    const batchButton = event.target.closest("[data-batch-region]"); if (batchButton) return toggleRegionCandidates(batchButton.dataset.batchRegion);
    const unassignButton = event.target.closest("[data-unassign-candidate]"); if (unassignButton) { const regionId = unassignButton.dataset.fromRegion; assignCandidates([unassignButton.dataset.unassignCandidate], null); return openRegion(regionId, false); }
    const assignButton = event.target.closest("[data-assign-to-region]"); if (assignButton) { const select = $("regionCandidateAssignment"); const ids = [...select.selectedOptions].map(option => option.value); if (ids.length) assignCandidates(ids, assignButton.dataset.assignToRegion); return openRegion(assignButton.dataset.assignToRegion, false); }
    const saveCandidateButton = event.target.closest("[data-save-candidate-region]"); if (saveCandidateButton) { assignCandidates([saveCandidateButton.dataset.saveCandidateRegion], $("candidateRegionSelect").value || null); return openCandidate(saveCandidateButton.dataset.saveCandidateRegion, false); }
    const toggleCandidateButton = event.target.closest("[data-toggle-candidate-trip]"); if (toggleCandidateButton) return toggleCandidateItinerary(toggleCandidateButton.dataset.toggleCandidateTrip);
  });
}

function setupViews() {
  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => item.classList.remove("active")); tab.classList.add("active"); state.view = tab.dataset.view; applyFilters();
  }));
  const days = state.routes?.trip?.days || [];
  $("routeTabs").innerHTML = days.map(day => `<button class="tab" data-view="day-${esc(day.day_number)}">Day ${esc(day.day_number)}</button>`).join("");
}
function renderLegend() {
  if (state.view === "regions") {
    $("legend").innerHTML = '<div class="legend-row"><span class="legend-star">⭐</span>已加入行程</div><div class="legend-row"><span class="legend-count">9</span>数字为下属 Candidate 数</div>';
  } else {
    $("legend").innerHTML = Object.keys(CATEGORY_LABELS).map(category => `<div class="legend-row"><span class="legend-dot" style="background:${COLORS[category]}"></span>${esc(CATEGORY_LABELS[category])}</div>`).join("");
  }
}

async function boot() {
  try {
    const paths = ["../data/hokkaido_places_master.json", "../data/candidate_locations.json", "../data/research_batches_level1.json", "../data/candidate_regions.json", "../data/routes.json"];
    const responses = await Promise.all(paths.map(path => fetch(path)));
    if (responses.some(response => !response.ok)) throw new Error("一个或多个数据文件无法读取");
    const [master, locations, batches, regions, routes] = await Promise.all(responses.map(response => response.json()));
    state.routes = routes; state.regions = regions.regions || [];
    state.candidates = window.ResearchDataAdapter.buildCandidateViewModels(master, locations, batches);
    loadUserState(); initMap(); setupFilters(); setupViews(); setupInteractions(); applyFilters();
  } catch (error) {
    $("candidateList").innerHTML = `<div class="empty-list"><strong>无法载入数据</strong><p>${esc(error.message)}</p><p>请从项目根目录启动本地服务器，不要直接双击 HTML。</p></div>`;
  }
}

$("closeDetail").addEventListener("click", () => { $("detailDialog").close(); state.dialog = null; });
$("detailDialog").addEventListener("click", event => { if (event.target === $("detailDialog")) { $("detailDialog").close(); state.dialog = null; } });
boot();
