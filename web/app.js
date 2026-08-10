const STORAGE_KEY = "hokkaido-trip-planner-v2";
const state = {
  candidates: [], catalog: [], areas: [], view: "areas", selectedAreaId: null,
  expandedAreas: new Set(), showAreas: true, showCandidates: false,
  candidateQuery: "", candidateCategory: "", candidateUnassignedOnly: false,
  searchPreview: null, pickerAreaId: null, pickerSelection: new Set(), draggedAreaId: null,
  livePredictions: [], placesReady: false, searchSessionToken: null, searchRequestId: 0,
};
const $ = id => document.getElementById(id);
const CATEGORY_LABELS = {
  natural_outdoor: "自然与户外", animal_marine: "动物与海洋", event_festival: "活动与节庆",
  food_market_drink: "餐饮、市集与酒饮", dessert_cafe_bakery: "甜品、咖啡与烘焙",
  lodging_onsen: "住宿与温泉", architecture_museum_shop_workshop: "建筑、博物馆、商店与工坊",
  special_transport: "特别交通", regional_challenger_module: "区域 Challenger 模块",
};
const COLORS = {
  natural_outdoor: "#3f8a67", animal_marine: "#4b70ad", event_festival: "#d39b32",
  food_market_drink: "#cf6647", dessert_cafe_bakery: "#cf7893", lodging_onsen: "#8c65a0",
  architecture_museum_shop_workshop: "#687d86", special_transport: "#33849b",
  regional_challenger_module: "#8a7151",
};
const unknown = value => window.ResearchDataAdapter.unknown(value);

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}
function shown(value, fallback = "未研究") {
  if (unknown(value)) return fallback;
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) return value.map(item => typeof item === "object" ? JSON.stringify(item) : item).join("；");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function labelCategory(value) { return CATEGORY_LABELS[value] || value || "unknown"; }
function validCoordinates(item) {
  const { lat, lon, verification_status: status } = item.location || {};
  return status === "verified" && Number.isFinite(lat) && Number.isFinite(lon);
}
function areaById(id) { return state.areas.find(area => area.id === id); }
function candidateById(id) { return state.candidates.find(candidate => candidate.id === id); }
function areaForCandidate(id) { return state.areas.find(area => area.candidateIds.includes(id)) || null; }
function candidatesForArea(id) { const area = areaById(id); return area ? area.candidateIds.map(candidateById).filter(Boolean) : []; }
function searchCandidateText(item) {
  return [item.id, item.name, item.names?.ja, item.names?.en, item.region, item.municipality, item.experience?.experience_summary]
    .filter(Boolean).join(" ").toLowerCase();
}
function loadUserState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.areas = Array.isArray(saved.areas) ? saved.areas.filter(area => area && area.id && Number.isFinite(area.lat) && Number.isFinite(area.lon)).map(area => ({
      id: area.id, placeId: area.placeId || area.id, name: area.name || "未命名地区", address: area.address || "",
      lat: area.lat, lon: area.lon, startDate: area.startDate || "", endDate: area.endDate || "",
      nights: area.nights || "", note: area.note || "", candidateIds: Array.isArray(area.candidateIds) ? [...new Set(area.candidateIds)] : [],
    })) : [];
    state.selectedAreaId = state.areas.some(area => area.id === saved.selectedAreaId) ? saved.selectedAreaId : null;
  } catch (_) { state.areas = []; state.selectedAreaId = null; }
}
function saveUserState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ areas: state.areas, selectedAreaId: state.selectedAreaId }));
}
function fillCategorySelect(select) {
  Object.entries(CATEGORY_LABELS).forEach(([value, label]) => {
    const option = document.createElement("option"); option.value = value; option.textContent = label; select.appendChild(option);
  });
}

let map, mapProvider = "leaflet", areaLayer, candidateLayer, routeLayer, previewLayer, searchTimer;
const areaMarkers = new Map();
const candidateMarkers = new Map();
async function initMap() {
  const googleMaps = await (window.googleMapsReady || Promise.resolve(null));
  if (googleMaps) {
    const { Map: GoogleMap } = await google.maps.importLibrary("maps");
    mapProvider = "google";
    map = new GoogleMap($("map"), {
      center: { lat: 43.35, lng: 142.15 }, zoom: 6,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      clickableIcons: false, gestureHandling: "greedy",
    });
    areaLayer = []; candidateLayer = []; routeLayer = []; previewLayer = [];
    try {
      await google.maps.importLibrary("places");
      state.placesReady = true;
    } catch (_) {
      state.placesReady = false;
    }
    return;
  }

  mapProvider = "leaflet";
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([43.35, 142.15], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: "© OpenStreetMap",
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map); areaLayer = L.layerGroup().addTo(map);
  candidateLayer = L.layerGroup().addTo(map); previewLayer = L.layerGroup().addTo(map);
}
function clearMapLayer(layer) {
  if (mapProvider === "google") {
    layer.forEach(item => item.setMap(null));
    layer.length = 0;
  } else {
    layer.clearLayers();
  }
}
function areaIcon(selected = false, muted = false) {
  return L.divIcon({ className: `area-map-marker${selected ? " is-selected" : ""}${muted ? " is-muted" : ""}`, html: '<span aria-label="行程地区">⭐</span>', iconSize: selected ? [38,38] : [32,32], iconAnchor: selected ? [19,32] : [16,27] });
}
function googleAreaIcon(selected = false, muted = false) {
  return {
    icon: {
      path: google.maps.SymbolPath.CIRCLE, scale: selected ? 19 : 16,
      fillColor: selected ? "#ffefd0" : "#e8f2ee", fillOpacity: muted ? .55 : 1,
      strokeColor: "#ffffff", strokeWeight: 2,
    },
    label: { text: "⭐", fontSize: selected ? "21px" : "18px" },
    opacity: muted ? .48 : 1,
  };
}
function renderLegend(items) {
  const categories = [...new Set(items.map(item => item.category))];
  $("mapLegend").innerHTML = categories.map(category => `<div class="legend-item"><span class="type-dot" style="background:${COLORS[category]}"></span>${esc(labelCategory(category))}</div>`).join("");
  $("mapLegend").hidden = !categories.length;
}
function mapCandidates() {
  if (!state.showCandidates) return [];
  if (state.selectedAreaId) return candidatesForArea(state.selectedAreaId).filter(validCoordinates);
  if (state.view === "candidates") return filteredCandidates().filter(validCoordinates);
  return state.candidates.filter(validCoordinates);
}
function renderMap({ fit = false } = {}) {
  clearMapLayer(areaLayer); clearMapLayer(candidateLayer); clearMapLayer(routeLayer); clearMapLayer(previewLayer);
  areaMarkers.clear(); candidateMarkers.clear();
  const selected = areaById(state.selectedAreaId);
  const points = [];
  if (state.showAreas) {
    state.areas.forEach(area => {
      const isSelected = area.id === state.selectedAreaId;
      let marker;
      if (mapProvider === "google") {
        marker = new google.maps.Marker({
          position: { lat: area.lat, lng: area.lon }, map, title: area.name,
          zIndex: isSelected ? 1000 : 500, ...googleAreaIcon(isSelected, Boolean(selected && !isSelected)),
        });
        marker.addListener("click", () => selectArea(area.id)); areaLayer.push(marker);
      } else {
        marker = L.marker([area.lat, area.lon], { icon: areaIcon(isSelected, Boolean(selected && !isSelected)), zIndexOffset: isSelected ? 1000 : 500 });
        marker.bindTooltip(area.name, { direction: "top", offset: [0,-23] });
        marker.on("click", () => selectArea(area.id)); marker.addTo(areaLayer);
      }
      areaMarkers.set(area.id, marker);
      if (!selected || isSelected) points.push({ lat: area.lat, lng: area.lon });
    });
    if (!selected && state.areas.length > 1) {
      if (mapProvider === "google") {
        const route = new google.maps.Polyline({ path: state.areas.map(area => ({ lat: area.lat, lng: area.lon })), map, strokeColor: "#346c58", strokeWeight: 3, strokeOpacity: .55 });
        routeLayer.push(route);
      } else {
        L.polyline(state.areas.map(area => [area.lat, area.lon]), { color: "#346c58", weight: 3, opacity: .55, dashArray: "7 8" }).addTo(routeLayer);
      }
    }
  }
  const visibleCandidates = mapCandidates();
  visibleCandidates.forEach(item => {
    const color = COLORS[item.category] || "#687d86";
    let marker;
    if (mapProvider === "google") {
      marker = new google.maps.Marker({
        position: { lat: item.location.lat, lng: item.location.lon }, map, title: item.name,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: color, fillOpacity: .96, strokeColor: "#fff", strokeWeight: 2 },
      });
      marker.addListener("click", () => openCandidate(item.id)); candidateLayer.push(marker);
    } else {
      marker = L.circleMarker([item.location.lat, item.location.lon], { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: .96, className: "candidate-map-marker" });
      marker.bindTooltip(item.name, { direction: "top" }); marker.on("click", () => openCandidate(item.id));
      marker.addTo(candidateLayer);
    }
    candidateMarkers.set(item.id, marker); points.push({ lat: item.location.lat, lng: item.location.lon });
  });
  renderLegend(visibleCandidates);
  if (fit) {
    if (mapProvider === "google") {
      if (selected && visibleCandidates.length === 0) { map.setCenter({ lat: selected.lat, lng: selected.lon }); map.setZoom(10); }
      else if (points.length === 1) { map.setCenter(points[0]); map.setZoom(selected ? 11 : 8); }
      else if (points.length > 1) {
        const bounds = new google.maps.LatLngBounds(); points.forEach(point => bounds.extend(point)); map.fitBounds(bounds, 72);
        google.maps.event.addListenerOnce(map, "idle", () => { const maxZoom = selected ? 12 : 9; if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
      } else { map.setCenter({ lat: 43.35, lng: 142.15 }); map.setZoom(6); }
    } else {
      const leafletPoints = points.map(point => [point.lat, point.lng]);
      if (selected && visibleCandidates.length === 0) map.setView([selected.lat, selected.lon], 10, { animate: true });
      else if (points.length === 1) map.setView(leafletPoints[0], selected ? 11 : 8, { animate: true });
      else if (points.length > 1) map.fitBounds(L.latLngBounds(leafletPoints).pad(.18), { maxZoom: selected ? 12 : 9, animate: true });
      else map.setView([43.35, 142.15], 6, { animate: true });
    }
  }
  renderMapFocusCard();
}
function renderMapFocusCard() {
  const area = areaById(state.selectedAreaId);
  if (!area) { $("mapFocusCard").hidden = true; return; }
  $("mapFocusCard").innerHTML = `<div class="preview-top"><div class="preview-symbol">⭐</div><div class="preview-copy"><p class="preview-meta">SELECTED AREA</p><h3>${esc(area.name)}</h3><p>${esc(area.address)}</p></div></div><div class="focus-row"><span>${area.candidateIds.length} Candidates · ${esc(area.startDate || "未定日期")}</span><button data-clear-area-focus>查看整个行程</button></div>`;
  $("mapFocusCard").hidden = false;
}

function renderCounts() {
  const assigned = new Set(state.areas.flatMap(area => area.candidateIds));
  $("areaCount").textContent = state.areas.length; $("areaRailCount").textContent = state.areas.length;
  $("assignedCount").textContent = assigned.size; $("candidateRailCount").textContent = filteredCandidates().length;
}
function areaCandidateRows(area) {
  const items = candidatesForArea(area.id);
  if (!items.length) return '<div class="area-empty-candidates">这个地区还没有 Candidate</div>';
  return items.map(item => `<div class="area-candidate-row"><span class="type-dot" style="background:${COLORS[item.category]}"></span><button data-open-candidate="${esc(item.id)}">${esc(item.name)}</button><button class="remove-mini" data-remove-candidate="${esc(item.id)}" data-area-id="${esc(area.id)}" aria-label="从地区移除">×</button></div>`).join("");
}
function renderAreaCard(area) {
  const selected = area.id === state.selectedAreaId; const expanded = state.expandedAreas.has(area.id);
  const dateLabel = area.startDate ? `${area.startDate}${area.endDate ? ` — ${area.endDate}` : ""}` : "日期未定";
  return `<article class="area-card${selected ? " selected" : ""}" data-area-card="${esc(area.id)}" draggable="true">
    <div class="area-summary"><button class="drag-handle" aria-label="拖动调整顺序">⋮⋮</button><button class="area-main" data-select-area="${esc(area.id)}"><h3>${esc(area.name)}</h3><p>${esc(area.address)}</p></button><button class="area-star" data-select-area="${esc(area.id)}" aria-label="在地图查看">⭐</button></div>
    <div class="area-quick-meta"><span>${esc(dateLabel)}</span>${area.nights ? `<span>${esc(area.nights)} 晚</span>` : ""}<span>${area.candidateIds.length} Candidates</span></div>
    <div class="area-actions"><button class="candidate-toggle" data-toggle-area-candidates="${esc(area.id)}" aria-expanded="${expanded}"><span>查看 Candidates</span><span>${area.candidateIds.length}</span><span class="chevron">⌄</span></button><button class="icon-menu-button" data-toggle-area-editor="${esc(area.id)}" aria-label="编辑地区">•••</button></div>
    ${expanded ? `<div class="area-expanded"><div class="area-candidates">${areaCandidateRows(area)}</div><button class="add-candidates-button" data-open-picker="${esc(area.id)}">＋ 添加 Candidates</button></div>` : ""}
    ${selected && area.editing ? `<div class="area-editor"><label>地区名称<input data-area-field="name" data-area-id="${esc(area.id)}" value="${esc(area.name)}"></label><label>停留晚数<input type="number" min="0" data-area-field="nights" data-area-id="${esc(area.id)}" value="${esc(area.nights)}"></label><label>开始日期<input type="date" data-area-field="startDate" data-area-id="${esc(area.id)}" value="${esc(area.startDate)}"></label><label>结束日期<input type="date" data-area-field="endDate" data-area-id="${esc(area.id)}" value="${esc(area.endDate)}"></label><label class="wide">备注<textarea data-area-field="note" data-area-id="${esc(area.id)}">${esc(area.note)}</textarea></label><button class="delete-area" data-delete-area="${esc(area.id)}">移除这个地区</button></div>` : ""}
  </article>`;
}
function renderAreas() {
  $("areaList").innerHTML = state.areas.length ? state.areas.map(renderAreaCard).join("") : '<div class="empty-state"><div class="empty-icon">⭐</div><h3>行程还没有地区</h3><p>在地图上方搜索市或地区，确认后加入行程。</p></div>';
}
function filteredCandidates() {
  const query = state.candidateQuery.trim().toLowerCase();
  return state.candidates.filter(item => (!query || searchCandidateText(item).includes(query)) && (!state.candidateCategory || item.category === state.candidateCategory) && (!state.candidateUnassignedOnly || !areaForCandidate(item.id)));
}
function candidateCard(item) {
  const area = areaForCandidate(item.id);
  return `<button class="candidate-card" data-open-candidate="${esc(item.id)}"><span class="type-dot" style="background:${COLORS[item.category]}"></span><div><h3>${esc(item.name)}</h3><p>${esc(labelCategory(item.category))} · ${esc(item.id)}</p><span class="area-label${area ? "" : " unassigned-label"}">${area ? esc(area.name) : "未归属"}</span></div></button>`;
}
function renderCandidates() { const items = filteredCandidates(); $("candidateList").innerHTML = items.length ? items.map(candidateCard).join("") : '<div class="empty-state"><h3>没有符合筛选的 Candidate</h3></div>'; }
function renderAll({ fitMap = false } = {}) { renderCounts(); renderAreas(); renderCandidates(); renderMap({ fit: fitMap }); updateLayerButtons(); }

function selectArea(id) {
  if (!areaById(id)) return; state.selectedAreaId = id; state.showAreas = true; state.showCandidates = true;
  saveUserState(); renderAll({ fitMap: true });
}
function clearAreaFocus() { state.selectedAreaId = null; state.showCandidates = state.view === "candidates"; saveUserState(); renderAll({ fitMap: true }); }
function deleteArea(id) { state.areas = state.areas.filter(area => area.id !== id); if (state.selectedAreaId === id) state.selectedAreaId = null; state.expandedAreas.delete(id); saveUserState(); renderAll({ fitMap: true }); }
function removeCandidateFromArea(areaId, candidateId) { const area = areaById(areaId); if (!area) return; area.candidateIds = area.candidateIds.filter(id => id !== candidateId); saveUserState(); renderAll({ fitMap: true }); }
function updateLayerButtons() { $("toggleAreaLayer").classList.toggle("active", state.showAreas); $("toggleCandidateLayer").classList.toggle("active", state.showCandidates); }

function catalogMatches(query) {
  const value = query.trim().toLowerCase(); if (!value) return [];
  return state.catalog.filter(place => [place.name_zh, place.google_title, place.formatted_address, ...(place.search_terms || [])].join(" ").toLowerCase().includes(value)).slice(0, 8);
}
function renderCatalogSearchResults(query, apiUnavailable = false) {
  const results = catalogMatches(query);
  state.livePredictions = [];
  $("areaSearchResults").innerHTML = results.length ? results.map(place => `<button class="search-result" data-preview-place="${esc(place.place_id)}"><span class="result-pin">⌖</span><span><strong>${esc(place.name_zh)}</strong><p>${esc(place.formatted_address)}</p></span><span class="provider-tag">${apiUnavailable ? "已核对库" : "Google Maps"}</span></button>`).join("") : `<div class="search-empty">${apiUnavailable ? "实时搜索暂时不可用，已核对地区中也没有匹配结果" : "没有匹配的市或地区"}</div>`;
  $("areaSearchResults").hidden = false;
}
function renderLiveSearchResults(predictions) {
  state.livePredictions = predictions;
  $("areaSearchResults").innerHTML = predictions.length ? predictions.map((prediction, index) => `<button class="search-result" data-preview-live-place="${index}"><span class="result-pin">⌖</span><span><strong>${esc(prediction.mainText?.toString() || prediction.text.toString())}</strong><p>${esc(prediction.secondaryText?.toString() || "日本")}</p></span><span class="provider-tag">Google Maps</span></button>`).join("") : '<div class="search-empty">Google Maps 中没有匹配的市或地区</div>';
  $("areaSearchResults").hidden = false;
}
async function renderAreaSearchResults() {
  const query = $("areaSearch").value; $("clearAreaSearch").hidden = !query;
  const trimmed = query.trim();
  if (!trimmed) { state.livePredictions = []; state.searchSessionToken = null; $("areaSearchResults").hidden = true; return; }
  if (!state.placesReady || mapProvider !== "google") return renderCatalogSearchResults(trimmed, true);

  const requestId = ++state.searchRequestId;
  $("areaSearchResults").innerHTML = '<div class="search-empty">正在搜索 Google Maps…</div>';
  $("areaSearchResults").hidden = false;
  try {
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary("places");
    if (!state.searchSessionToken) state.searchSessionToken = new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: trimmed,
      sessionToken: state.searchSessionToken,
      includedPrimaryTypes: ["(regions)"],
      includedRegionCodes: ["jp"],
      locationBias: { center: { lat: 43.35, lng: 142.15 }, radius: 850000 },
      language: "zh-CN",
      region: "jp",
    });
    if (requestId !== state.searchRequestId || $("areaSearch").value.trim() !== trimmed) return;
    renderLiveSearchResults(suggestions.map(item => item.placePrediction).filter(Boolean).slice(0, 8));
  } catch (_) {
    if (requestId === state.searchRequestId) renderCatalogSearchResults(trimmed, true);
  }
}
function scheduleAreaSearch() {
  clearTimeout(searchTimer);
  state.searchRequestId += 1;
  const query = $("areaSearch").value;
  $("clearAreaSearch").hidden = !query;
  if (!query.trim()) return void renderAreaSearchResults();
  searchTimer = setTimeout(renderAreaSearchResults, 280);
}
function previewPlace(placeId) {
  const place = state.catalog.find(item => item.place_id === placeId); if (!place) return;
  showPlacePreview(place);
}
async function previewLivePlace(index) {
  const prediction = state.livePredictions[index]; if (!prediction) return;
  $("areaSearchResults").innerHTML = '<div class="search-empty">正在确认地区…</div>';
  try {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location", "primaryType"] });
    if (!place.location) throw new Error("missing location");
    state.searchSessionToken = null;
    showPlacePreview({
      place_id: place.id,
      name_zh: place.displayName || prediction.mainText?.toString() || prediction.text.toString(),
      google_title: place.displayName || prediction.text.toString(),
      formatted_address: place.formattedAddress || prediction.secondaryText?.toString() || "日本",
      lat: place.location.lat(), lon: place.location.lng(), place_type: place.primaryType || "city_or_area",
    });
  } catch (_) {
    $("areaSearchResults").innerHTML = '<div class="search-empty">无法读取这个地区，请重新搜索</div>';
    $("areaSearchResults").hidden = false;
  }
}
function showPlacePreview(place) {
  state.searchPreview = place; $("areaSearchResults").hidden = true; $("mapFocusCard").hidden = true;
  const existing = state.areas.find(area => area.placeId === place.place_id);
  $("placePreview").innerHTML = `<div class="preview-top"><div class="preview-symbol">⌖</div><div class="preview-copy"><p class="preview-meta">GOOGLE MAPS · CITY / AREA</p><h3>${esc(place.name_zh)}</h3><p>${esc(place.formatted_address)}</p></div></div><div class="preview-actions"><button class="primary-button" data-add-preview-place>${existing ? "查看已加入地区" : "加入行程 ⭐"}</button><button class="secondary-button" data-dismiss-preview>取消</button></div>`;
  $("placePreview").hidden = false; clearMapLayer(previewLayer);
  if (mapProvider === "google") {
    const marker = new google.maps.Marker({
      position: { lat: place.lat, lng: place.lon }, map, title: place.name_zh,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#1f6b53", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
    });
    previewLayer.push(marker); map.setCenter({ lat: place.lat, lng: place.lon }); map.setZoom(9);
  } else {
    L.circleMarker([place.lat, place.lon], { radius: 10, color: "#fff", weight: 3, fillColor: "#1f6b53", fillOpacity: 1 }).addTo(previewLayer);
    map.setView([place.lat, place.lon], 9, { animate: true });
  }
}
function addPreviewPlace() {
  const place = state.searchPreview; if (!place) return;
  const existing = state.areas.find(area => area.placeId === place.place_id);
  if (existing) { dismissPreview(); return selectArea(existing.id); }
  const id = `area-${place.place_id}`;
  state.areas.push({ id, placeId: place.place_id, name: place.name_zh, address: place.formatted_address, lat: place.lat, lon: place.lon, startDate: "", endDate: "", nights: "", note: "", candidateIds: [] });
  state.expandedAreas.add(id); state.selectedAreaId = id; state.showAreas = true; state.showCandidates = true;
  dismissPreview(); saveUserState(); renderAll({ fitMap: true });
}
function dismissPreview() { state.searchPreview = null; $("placePreview").hidden = true; clearMapLayer(previewLayer); renderMapFocusCard(); }

function openPicker(areaId) {
  const area = areaById(areaId); if (!area) return;
  state.pickerAreaId = areaId; state.pickerSelection = new Set(area.candidateIds);
  $("pickerTitle").textContent = `添加到 ${area.name}`; $("pickerSearch").value = ""; $("pickerCategory").value = ""; $("pickerUnassignedOnly").checked = false;
  renderPicker(); $("candidatePicker").classList.add("open"); $("candidatePicker").setAttribute("aria-hidden", "false"); $("drawerScrim").hidden = false;
}
function closePicker() { state.pickerAreaId = null; state.pickerSelection = new Set(); $("candidatePicker").classList.remove("open"); $("candidatePicker").setAttribute("aria-hidden", "true"); $("drawerScrim").hidden = true; }
function pickerCandidates() {
  const query = $("pickerSearch").value.trim().toLowerCase(); const category = $("pickerCategory").value; const onlyUnassigned = $("pickerUnassignedOnly").checked;
  return state.candidates.filter(item => (!query || searchCandidateText(item).includes(query)) && (!category || item.category === category) && (!onlyUnassigned || !areaForCandidate(item.id) || areaForCandidate(item.id)?.id === state.pickerAreaId));
}
function renderPicker() {
  const items = pickerCandidates();
  $("pickerCandidateList").innerHTML = items.length ? items.map(item => { const current = areaForCandidate(item.id); return `<label class="picker-row"><input type="checkbox" value="${esc(item.id)}"${state.pickerSelection.has(item.id) ? " checked" : ""}><span class="type-dot" style="background:${COLORS[item.category]}"></span><span><h3>${esc(item.name)}</h3><p>${esc(labelCategory(item.category))}${current ? ` · 当前：${esc(current.name)}` : " · 未归属"}</p></span></label>`; }).join("") : '<div class="empty-state"><h3>没有符合筛选的 Candidate</h3></div>';
  $("pickerSelectionCount").textContent = `已选择 ${state.pickerSelection.size}`;
}
function savePicker() {
  const target = areaById(state.pickerAreaId); if (!target) return;
  const moved = [...state.pickerSelection].map(id => ({ id, area: areaForCandidate(id) })).filter(row => row.area && row.area.id !== target.id);
  if (moved.length && !window.confirm(`${moved.length} 个 Candidate 已属于其他地区。确认移动到“${target.name}”吗？`)) return;
  state.areas.forEach(area => { if (area.id !== target.id) area.candidateIds = area.candidateIds.filter(id => !state.pickerSelection.has(id)); });
  target.candidateIds = [...state.pickerSelection]; state.expandedAreas.add(target.id); saveUserState(); closePicker(); renderAll({ fitMap: true });
}

function displayList(items, emptyText = "未研究") { return Array.isArray(items) && items.length ? `<ul class="research-list">${items.map(item => `<li>${esc(shown(item))}</li>`).join("")}</ul>` : `<p class="unknown-value">${esc(emptyText)}</p>`; }
function dl(rows) { return `<dl>${rows.map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(shown(value))}</dd>`).join("")}</dl>`; }
function infoSection(title, content) { return `<section class="detail-section"><h3>${esc(title)}</h3>${content}</section>`; }
function renderVisualEvidence(item) {
  const assets = item.visual?.assets || [];
  if (!assets.length) return '<div class="photo-placeholder"><p>尚无已研究视觉证据</p></div>';
  return `<div class="gallery">${assets.map(asset => { const url = asset.asset_url || asset.source_page_url; return `<figure>${asset.asset_url ? `<img src="${esc(asset.asset_url)}" alt="${esc(asset.caption || item.name)}" loading="lazy">` : '<div class="photo-placeholder">VISUAL SOURCE</div>'}<figcaption>${esc(shown(asset.what_this_image_is_showing || asset.caption))}</figcaption></figure>`; }).join("")}</div>`;
}
function openCandidate(id) {
  const item = candidateById(id); if (!item) return; const area = areaForCandidate(id); const position = item.temporal?.trip_window_position || {};
  $("detailContent").innerHTML = `<header class="detail-hero"><p class="eyebrow">${esc(item.id)}</p><h2>${esc(item.name)}</h2><p class="alt-names">${esc(item.names?.ja || "")}<br>${esc(item.names?.en || "")}</p></header><div class="detail-body"><div class="detail-tags"><span class="detail-tag">${esc(labelCategory(item.category))}</span><span class="detail-tag">${area ? esc(area.name) : "未归属"}</span><span class="detail-tag">${esc(item.status)}</span></div>${infoSection("30 秒预览", dl([["Experience summary",item.experience?.experience_summary],["Why people love it",item.experience?.why_people_love_it],["Trip-window fit",item.experience?.trip_window_fit]]))}${infoSection("实际会做什么", displayList(item.experience?.what_you_actually_do,"尚未完成 L1 行为步骤研究"))}${infoSection("9/5–9/18 实际体验", dl([["Sep 2026 experience",item.experience?.sep_2026_experience],["Trip-window position",position.position],["Preferred segment",position.preferred_trip_segment]]))}${infoSection("Practical", dl([["Realistic duration",item.experience?.realistic_duration],["Weather dependency",item.experience?.weather_dependency],["Physical load",item.experience?.physical_load],["Municipality",item.municipality],["Coordinate scope",item.location?.scope]]))}${infoSection("可能失望之处", `<p>${esc(shown(item.experience?.common_disappointments))}</p>`)}${infoSection("Visual evidence",renderVisualEvidence(item))}${infoSection("研究缺口",displayList([...(item.uncertainties||[]),...(item.dynamicRechecks||[]),...(item.level2Attention||[])],"尚未记录明确研究缺口"))}</div>`;
  $("detailDialog").showModal();
}

function switchView(view) {
  state.view = view; document.querySelectorAll(".panel-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view));
  $("areasView").classList.toggle("active", view === "areas"); $("candidatesView").classList.toggle("active", view === "candidates");
  if (view === "candidates") { state.selectedAreaId = null; state.showCandidates = true; } else if (!state.selectedAreaId) state.showCandidates = false;
  renderAll({ fitMap: true });
}
function setupInteractions() {
  document.querySelectorAll(".panel-tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $("areaSearch").addEventListener("input", scheduleAreaSearch);
  $("areaSearch").addEventListener("keydown", event => { if (event.key === "Escape") { $("areaSearch").value = ""; scheduleAreaSearch(); dismissPreview(); } });
  $("clearAreaSearch").addEventListener("click", () => { $("areaSearch").value = ""; scheduleAreaSearch(); dismissPreview(); $("areaSearch").focus(); });
  $("areaSearchResults").addEventListener("click", event => {
    const liveButton = event.target.closest("[data-preview-live-place]");
    if (liveButton) return void previewLivePlace(Number(liveButton.dataset.previewLivePlace));
    const catalogButton = event.target.closest("[data-preview-place]");
    if (catalogButton) previewPlace(catalogButton.dataset.previewPlace);
  });
  $("placePreview").addEventListener("click", event => { if (event.target.closest("[data-add-preview-place]")) addPreviewPlace(); if (event.target.closest("[data-dismiss-preview]")) dismissPreview(); });
  $("mapFocusCard").addEventListener("click", event => { if (event.target.closest("[data-clear-area-focus]")) clearAreaFocus(); });
  $("toggleAreaLayer").addEventListener("click", () => { state.showAreas = !state.showAreas; renderMap(); updateLayerButtons(); });
  $("toggleCandidateLayer").addEventListener("click", () => { state.showCandidates = !state.showCandidates; renderMap({ fit: state.showCandidates }); updateLayerButtons(); });
  $("areaList").addEventListener("click", event => {
    const select = event.target.closest("[data-select-area]"); if (select) return selectArea(select.dataset.selectArea);
    const toggle = event.target.closest("[data-toggle-area-candidates]"); if (toggle) { const id = toggle.dataset.toggleAreaCandidates; state.expandedAreas.has(id) ? state.expandedAreas.delete(id) : state.expandedAreas.add(id); if (state.selectedAreaId !== id) state.selectedAreaId = id; state.showCandidates = true; saveUserState(); return renderAll({ fitMap: true }); }
    const edit = event.target.closest("[data-toggle-area-editor]"); if (edit) { const area = areaById(edit.dataset.toggleAreaEditor); if (area) { area.editing = !area.editing; state.selectedAreaId = area.id; renderAreas(); } return; }
    const picker = event.target.closest("[data-open-picker]"); if (picker) return openPicker(picker.dataset.openPicker);
    const remove = event.target.closest("[data-remove-candidate]"); if (remove) return removeCandidateFromArea(remove.dataset.areaId, remove.dataset.removeCandidate);
    const open = event.target.closest("[data-open-candidate]"); if (open) return openCandidate(open.dataset.openCandidate);
    const del = event.target.closest("[data-delete-area]"); if (del) return deleteArea(del.dataset.deleteArea);
  });
  $("areaList").addEventListener("input", event => { const field = event.target.dataset.areaField; const area = areaById(event.target.dataset.areaId); if (field && area) { area[field] = event.target.value; saveUserState(); if (field === "name") renderMapFocusCard(); renderCounts(); } });
  $("areaList").addEventListener("dragstart", event => { const card = event.target.closest("[data-area-card]"); if (card) { state.draggedAreaId = card.dataset.areaCard; card.classList.add("dragging"); } });
  $("areaList").addEventListener("dragend", event => { event.target.closest("[data-area-card]")?.classList.remove("dragging"); state.draggedAreaId = null; });
  $("areaList").addEventListener("dragover", event => event.preventDefault());
  $("areaList").addEventListener("drop", event => { event.preventDefault(); const target = event.target.closest("[data-area-card]")?.dataset.areaCard; if (!target || !state.draggedAreaId || target === state.draggedAreaId) return; const from = state.areas.findIndex(area => area.id === state.draggedAreaId); const to = state.areas.findIndex(area => area.id === target); const [moved] = state.areas.splice(from,1); state.areas.splice(to,0,moved); saveUserState(); renderAll({ fitMap: true }); });
  $("candidateList").addEventListener("click", event => { const button = event.target.closest("[data-open-candidate]"); if (button) openCandidate(button.dataset.openCandidate); });
  $("candidateSearch").addEventListener("input", event => { state.candidateQuery = event.target.value; renderCandidates(); renderCounts(); if (state.view === "candidates") renderMap(); });
  $("candidateCategory").addEventListener("change", event => { state.candidateCategory = event.target.value; renderCandidates(); renderCounts(); if (state.view === "candidates") renderMap({fit:true}); });
  $("candidateUnassignedOnly").addEventListener("change", event => { state.candidateUnassignedOnly = event.target.checked; renderCandidates(); renderCounts(); if (state.view === "candidates") renderMap({fit:true}); });
  $("closePicker").addEventListener("click", closePicker); $("drawerScrim").addEventListener("click", closePicker);
  ["pickerSearch","pickerCategory","pickerUnassignedOnly"].forEach(id => $(id).addEventListener(id === "pickerSearch" ? "input" : "change", renderPicker));
  $("pickerCandidateList").addEventListener("change", event => { if (event.target.matches('input[type="checkbox"]')) { event.target.checked ? state.pickerSelection.add(event.target.value) : state.pickerSelection.delete(event.target.value); $("pickerSelectionCount").textContent = `已选择 ${state.pickerSelection.size}`; } });
  $("selectAllPicker").addEventListener("click", () => { pickerCandidates().forEach(item => state.pickerSelection.add(item.id)); renderPicker(); });
  $("savePicker").addEventListener("click", savePicker);
  $("closeDetail").addEventListener("click", () => $("detailDialog").close());
}

async function boot() {
  try {
    const paths = ["../data/hokkaido_places_master.json","../data/candidate_locations.json","../data/research_batches_level1.json","../data/google_maps_area_catalog.json"];
    const responses = await Promise.all(paths.map(path => fetch(path))); if (responses.some(response => !response.ok)) throw new Error("数据文件无法读取");
    const [master,locations,batches,catalog] = await Promise.all(responses.map(response => response.json()));
    state.candidates = window.ResearchDataAdapter.buildCandidateViewModels(master,locations,batches); state.catalog = catalog.places || [];
    loadUserState(); fillCategorySelect($("candidateCategory")); fillCategorySelect($("pickerCategory")); await initMap(); setupInteractions(); renderAll({ fitMap: true });
  } catch (error) {
    $("areaList").innerHTML = `<div class="empty-state"><h3>无法载入地图数据</h3><p>${esc(error.message)}</p></div>`;
  }
}
boot();
