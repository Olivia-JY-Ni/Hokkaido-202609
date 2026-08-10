const state = { candidates: [], routes: null, filtered: [], selectedCategories: new Set(), view: "all" };
const $ = id => document.getElementById(id);
const CATEGORY_LABELS = {
  natural_outdoor: "自然与户外",
  animal_marine: "动物与海洋",
  event_festival: "活动与节庆",
  food_market_drink: "餐饮、市集与酒饮",
  dessert_cafe_bakery: "甜品、咖啡与烘焙",
  lodging_onsen: "住宿与温泉",
  architecture_museum_shop_workshop: "建筑、博物馆、商店与工坊",
  special_transport: "特别交通",
  regional_challenger_module: "区域 Challenger 模块",
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
function validCoordinates(item) {
  const { lat, lon, verification_status: status } = item.location || {};
  return status === "verified" && typeof lat === "number" && typeof lon === "number" &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
function fillSelect(select, values, label = value => value) {
  [...new Set(values.filter(value => !unknown(value)))].sort((a, b) => String(a).localeCompare(String(b), "zh-Hans"))
    .forEach(value => {
      const option = document.createElement("option");
      option.value = value; option.textContent = label(value); select.appendChild(option);
    });
}
function labelCategory(value) { return CATEGORY_LABELS[value] || value || "unknown"; }
function displayList(items, emptyText = "未研究") {
  if (!Array.isArray(items) || !items.length) return `<p class="unknown-value">${esc(emptyText)}</p>`;
  return `<ul class="research-list">${items.map(item => `<li>${esc(shown(item))}</li>`).join("")}</ul>`;
}
function dl(rows) {
  return `<dl>${rows.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(shown(value))}</dd>`).join("")}</dl>`;
}
function infoSection(title, content, id) {
  return `<section class="detail-section"${id ? ` id="${esc(id)}"` : ""}><h3>${esc(title)}</h3>${content}</section>`;
}
function linkList(links) {
  if (!links.length) return '<p class="unknown-value">尚无已记录证据链接</p>';
  return `<div class="source-list">${links.map(link => {
    const url = link.url || link.source_page_url || link.asset_url;
    const label = link.source_name || link.source_platform || url || "未命名来源";
    return url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
  }).join("")}</div>`;
}

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
  fillSelect(els.region, state.candidates.map(item => item.region));
  fillSelect(els.l1Status, state.candidates.map(item => item.status));
  fillSelect(els.l1Batch, state.candidates.map(item => item.batchId));
  fillSelect(els.tripWindowFit, state.candidates.map(item => item.experience.trip_window_fit));
  $("typeChips").innerHTML = Object.keys(CATEGORY_LABELS).map(category =>
    `<button class="chip" data-category="${esc(category)}">${esc(CATEGORY_LABELS[category])}</button>`).join("");
  $("typeChips").addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    const category = button.dataset.category;
    state.selectedCategories.has(category) ? state.selectedCategories.delete(category) : state.selectedCategories.add(category);
    button.classList.toggle("active", state.selectedCategories.has(category));
    applyFilters();
  });
  Object.values(els).forEach(element => element.addEventListener(element.type === "search" ? "input" : "change", applyFilters));
  $("resetFilters").addEventListener("click", () => {
    Object.values(els).forEach(element => { element.type === "checkbox" ? element.checked = false : element.value = ""; });
    state.selectedCategories.clear();
    document.querySelectorAll(".chip.active").forEach(chip => chip.classList.remove("active"));
    applyFilters();
  });
}

function matches(item) {
  const haystack = [item.id, item.name, item.names.ja, item.names.en, item.region, item.municipality,
    item.category, item.originalCategory, item.subcategory, item.experience.experience_summary].join(" ").toLowerCase();
  const query = els.search.value.trim().toLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (els.category.value && item.category !== els.category.value) return false;
  if (els.region.value && item.region !== els.region.value) return false;
  if (els.l1Status.value && item.status !== els.l1Status.value) return false;
  if (els.l1Batch.value && item.batchId !== els.l1Batch.value) return false;
  if (els.tripWindowFit.value && item.experience.trip_window_fit !== els.tripWindowFit.value) return false;
  if (els.dynamicRecheck.checked && !item.dynamicRecheckRequired) return false;
  if (els.visualEvidence.checked && !item.hasVisualEvidence) return false;
  if (els.uncertainty.checked && !item.hasUncertainty) return false;
  if (state.selectedCategories.size && !state.selectedCategories.has(item.category)) return false;
  return true;
}
function applyFilters() {
  state.filtered = state.candidates.filter(matches);
  renderList(); renderMarkers(); updateCounts();
}

function renderList() {
  $("railCount").textContent = `${state.filtered.length} / ${state.candidates.length}`;
  if (!state.filtered.length) {
    $("candidateList").innerHTML = '<div class="empty-list">没有符合当前条件的候选。</div>';
    return;
  }
  $("candidateList").innerHTML = state.filtered.map(item => `
    <button class="candidate-card" data-id="${esc(item.id)}">
      <span class="card-meta"><span>${esc(item.region || "unknown")}</span><span>·</span><span>${esc(labelCategory(item.category))}</span><span class="status">${esc(item.status || "L1 pending")}</span></span>
      <h3>${esc(item.name)}</h3>
      <p class="names">${esc(item.names.ja || "")} ${item.names.en ? `· ${esc(item.names.en)}` : ""}</p>
      <p class="score-line"><span>FIT <strong>${esc(shown(item.experience.trip_window_fit, "unknown"))}</strong></span><span>BATCH <strong>${esc(item.batchId || "—")}</strong></span><span>MAP <strong>${item.location.verification_status === "verified" ? "verified" : "unresolved"}</strong></span></p>
    </button>`).join("");
  $("candidateList").querySelectorAll("[data-id]").forEach(button => button.addEventListener("click", () => openDetail(button.dataset.id)));
}

function renderMarkers() {
  const located = state.filtered.filter(validCoordinates);
  if (markerLayer) {
    markerLayer.clearLayers();
    located.forEach(item => {
      const marker = L.circleMarker([item.location.lat, item.location.lon], {
        radius: 8, color: "#fff", weight: 2, fillColor: COLORS[item.category] || "#707774", fillOpacity: .95,
      });
      marker.bindTooltip(esc(item.name)); marker.on("click", () => openDetail(item.id)); marker.addTo(markerLayer);
    });
    if (located.length) map.fitBounds(L.latLngBounds(located.map(item => [item.location.lat, item.location.lon])).pad(.15), { maxZoom: 11 });
  }
  const notice = $("mapNotice");
  if (!located.length) {
    notice.hidden = false;
    notice.textContent = `当前 ${state.filtered.length} 条候选没有可显示的已核验坐标；未解析坐标不会被猜测。`;
  } else notice.hidden = true;
}
function updateCounts() {
  $("visibleCount").textContent = state.filtered.length;
  $("markerCount").textContent = state.filtered.filter(validCoordinates).length;
}

function renderVisualEvidence(item) {
  const visual = item.visual;
  const assets = visual.assets || [];
  const assetContent = assets.length ? `<div class="gallery">${assets.map(asset => {
    const url = asset.asset_url || asset.source_page_url;
    const media = asset.asset_url && asset.asset_type === "image"
      ? `<img src="${esc(asset.asset_url)}" alt="${esc(asset.caption || item.name)}" loading="lazy">`
      : '<div class="photo-placeholder"><span>VISUAL SOURCE</span><p>查看来源页</p></div>';
    return `<figure>${url ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${media}</a>` : media}<figcaption>${esc(shown(asset.what_this_image_is_showing || asset.caption))}</figcaption></figure>`;
  }).join("")}</div>` : '<div class="photo-placeholder"><span>VISUAL EVIDENCE</span><p>尚无已研究视觉证据</p></div>';
  return `${assetContent}${dl([
    ["旅行窗口应看到", visual.what_should_be_visible_during_2026_09_05_18],
    ["不太可能看到", visual.what_is_unlikely_to_be_visible],
    ["季节错配说明", visual.season_mismatch_note],
    ["视角警告", visual.perspective_warning],
  ])}`;
}

function renderEvidence(item) {
  const links = Object.values(item.sourcePacks).flat();
  const provenance = item.provenance.map(row => `${row.source_file} · ${row.source_section} · ${row.data_role}`);
  return `${linkList(links)}${dl([
    ["Provenance", provenance],
    ["Latest L1 overlay", item.latestOverlay ? `${item.latestOverlay.batch_id} · ${item.latestOverlay.researched_at}` : "L1 pending"],
    ["历史评估（不参与当前排名）", item.historicalAssessment],
  ])}`;
}

function renderGaps(item) {
  const gapRows = [
    ...item.uncertainties.map(value => ({ type: "不确定项", value })),
    ...item.dynamicRechecks.map(value => ({ type: "动态复核", value })),
    ...item.level2Attention.map(value => ({ type: "L2 attention", value })),
    ...item.conflicts.map(value => ({ type: "保留冲突", value })),
  ];
  if (!gapRows.length) return '<p class="unknown-value">尚未记录明确研究缺口；这不代表事实已经完备。</p>';
  return `<ul class="research-list">${gapRows.map(row => `<li><strong>${esc(row.type)}</strong><br>${esc(shown(row.value))}</li>`).join("")}</ul>`;
}

function openDetail(id) {
  const item = state.candidates.find(candidate => candidate.id === id);
  if (!item) return;
  const temporal = item.temporal;
  const position = temporal.trip_window_position || {};
  $("detailContent").innerHTML = `
    <header class="detail-hero"><p class="eyebrow">${esc(item.id)}</p><h2>${esc(item.name)}</h2><p class="alt-names">${esc(item.names.ja || "")}<br>${esc(item.names.en || "")}</p></header>
    <div class="detail-body">
      <div class="detail-tags"><span class="detail-tag">${esc(labelCategory(item.category))}</span><span class="detail-tag">${esc(item.region || "unknown")}</span><span class="detail-tag">${esc(item.status || "L1 pending")}</span><span class="detail-tag">${esc(item.batchId || "inventory only")}</span></div>
      ${infoSection("Identity", dl([
        ["Candidate ID", item.id], ["Entity type", item.candidate.entity_type], ["Research subject role", item.role],
        ["Original category", item.originalCategory], ["Subcategory", item.subcategory], ["Municipality", item.municipality],
        ["Coordinate", item.location.verification_status], ["Coordinate scope", item.location.scope],
      ]))}
      ${infoSection("30 秒预览", dl([
        ["Experience summary", item.experience.experience_summary], ["Why people love it", item.experience.why_people_love_it],
        ["Trip-window fit", item.experience.trip_window_fit],
      ]))}
      ${infoSection("实际会做什么", displayList(item.experience.what_you_actually_do, "尚未完成 L1 行为步骤研究"))}
      ${infoSection("9/5–9/18 实际体验", dl([
        ["Sep 2026 experience", item.experience.sep_2026_experience], ["Trip-window position", position.position],
        ["Preferred segment", position.preferred_trip_segment], ["Why these dates", position.why_these_dates_are_better],
      ]))}
      ${infoSection("Temporal Experience Profile", dl([
        ["Ideal seasonal window", temporal.ideal_seasonal_window], ["Seasonal progression", temporal.seasonal_progression_summary],
        ["Preferred dates", position.preferred_dates_within_trip], ["Date sensitivity", position.date_sensitivity],
        ["Time constraint type", temporal.time_constraint_type], ["Hard date constraints", temporal.hard_date_constraints],
        ["Operating period", temporal.operating_period], ["Closure days", temporal.closure_days],
        ["Recommended time", temporal.recommended_visit_time || temporal.recommended_time_of_day],
        ["Early start", temporal.early_start_required],
      ]))}
      ${infoSection("Practical", dl([
        ["Realistic duration", item.experience.realistic_duration], ["Weather dependency", item.experience.weather_dependency],
        ["Language dependency", item.experience.language_dependency], ["Physical load", item.experience.physical_load],
        ["Luggage friction", item.experience.luggage_friction], ["Address（历史原始记录）", item.original.address],
        ["Public transport（历史原始记录）", item.original.main_public_transport_access],
      ]))}
      ${infoSection("可能失望之处", `<p>${esc(shown(item.experience.common_disappointments))}</p>`)}
      ${infoSection("Visual evidence", renderVisualEvidence(item))}
      ${infoSection("Evidence & provenance", renderEvidence(item))}
      ${infoSection("研究缺口", renderGaps(item))}
    </div>`;
  $("detailDialog").showModal();
}

function setupViews() {
  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
    tab.classList.add("active"); state.view = tab.dataset.view;
    if (state.view === "regions" && map && state.filtered.some(validCoordinates)) {
      map.fitBounds(L.latLngBounds(state.filtered.filter(validCoordinates).map(item => [item.location.lat, item.location.lon])).pad(.2));
    }
  }));
  const days = state.routes?.trip?.days || [];
  $("routeTabs").innerHTML = days.map(day => `<button class="tab" data-view="day-${esc(day.day_number)}">Day ${esc(day.day_number)}</button>`).join("");
}
function renderLegend() {
  $("legend").innerHTML = Object.keys(CATEGORY_LABELS).map(category =>
    `<div class="legend-row"><span class="legend-dot" style="background:${COLORS[category]}"></span>${esc(CATEGORY_LABELS[category])}</div>`).join("");
}

async function boot() {
  try {
    const paths = [
      "../data/hokkaido_places_master.json", "../data/candidate_locations.json",
      "../data/research_batches_level1.json", "../data/routes.json",
    ];
    const responses = await Promise.all(paths.map(path => fetch(path)));
    if (responses.some(response => !response.ok)) throw new Error("一个或多个数据文件无法读取");
    const [master, locations, batches, routes] = await Promise.all(responses.map(response => response.json()));
    state.routes = routes;
    state.candidates = window.ResearchDataAdapter.buildCandidateViewModels(master, locations, batches);
    initMap(); setupFilters(); setupViews(); renderLegend(); applyFilters();
  } catch (error) {
    $("candidateList").innerHTML = `<div class="empty-list"><strong>无法载入数据</strong><p>${esc(error.message)}</p><p>请从项目根目录启动本地服务器，不要直接双击 HTML。</p></div>`;
  }
}

$("closeDetail").addEventListener("click", () => $("detailDialog").close());
$("detailDialog").addEventListener("click", event => { if (event.target === $("detailDialog")) $("detailDialog").close(); });
boot();
