const STORAGE_KEY = "hokkaido-trip-planner-v2";
const state = {
  candidates: [], catalog: [], areas: [], view: "areas", selectedAreaId: null,
  selectedCandidateId: null,
  expandedAreas: new Set(), showAreas: true, showCandidates: false,
  candidateQuery: "", candidateCategory: "", candidateUnassignedOnly: false,
  searchPreview: null, pickerAreaId: null, pickerSelection: new Set(), draggedAreaId: null,
  livePredictions: [], placesReady: false, searchSessionToken: null, searchRequestId: 0,
  legendOpen: false, nearbyAreaId: null, nearbyType: "tourist_attraction", nearbyPlaces: [],
  nearbyStatus: "idle", selectedNearbyPlaceId: null, placeDetails: new Map(), placeDetailsLoading: new Set(),
  routeLegs: [], routeStatus: "idle", routeSignature: "", routeRequestId: 0,
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
const NEARBY_TYPES = {
  tourist_attraction: "景点", restaurant: "餐厅", cafe: "咖啡甜品", park: "公园",
  museum: "博物馆", spa: "温泉 / Spa", lodging: "住宿", transit_station: "车站", parking: "停车场",
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
function known(value) { return !unknown(value); }
function friendlyTiming(value) {
  return ({ uncertain: "日期仍待确认", peak_window: "正值最佳时间", outside_best_window: "不在最佳时间", first_half: "行程前半段", second_half: "行程后半段", middle: "行程中段" })[value] || (value === "unknown" ? null : value);
}
function labelCategory(value) { return CATEGORY_LABELS[value] || value || "unknown"; }
function labelBusinessStatus(value) {
  return ({ OPERATIONAL: "正常营业", CLOSED_TEMPORARILY: "暂时关闭", CLOSED_PERMANENTLY: "永久关闭", FUTURE_OPENING: "即将开业" })[value] || "";
}
function compactDistance(meters) { return meters >= 1000 ? `${Math.round(meters / 1000)} 公里` : `${Math.round(meters || 0)} 米`; }
function compactDuration(milliseconds) {
  const minutes = Math.max(1, Math.round((milliseconds || 0) / 60000));
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return hours ? `${hours} 小时${rest ? ` ${rest} 分` : ""}` : `${rest} 分钟`;
}
function viewportJSON(viewport) {
  if (!viewport) return null;
  const value = typeof viewport.toJSON === "function" ? viewport.toJSON() : viewport;
  return [value?.north,value?.south,value?.east,value?.west].every(Number.isFinite) ? {
    north: value.north, south: value.south, east: value.east, west: value.west,
  } : null;
}
function simplifyAddressComponents(components) {
  return (components || []).map(component => ({
    longText: component.longText || "", shortText: component.shortText || "", types: component.types || [],
  }));
}
function validCoordinates(item) {
  const { lat, lon, verification_status: status } = item.location || {};
  return status === "verified" && Number.isFinite(lat) && Number.isFinite(lon);
}
function areaById(id) { return state.areas.find(area => area.id === id); }
function candidateById(id) { return state.candidates.find(candidate => candidate.id === id); }
function areaForCandidate(id) { return state.areas.find(area => area.candidateIds.includes(id)) || null; }
function candidatesForArea(id) { const area = areaById(id); return area ? area.candidateIds.map(candidateById).filter(Boolean) : []; }
function routeLegTo(areaId) { return state.routeLegs.find(leg => leg.toId === areaId) || null; }
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
      viewport: viewportJSON(area.viewport), primaryType: area.primaryType || "", types: Array.isArray(area.types) ? area.types : [],
      businessStatus: area.businessStatus || "", addressComponents: Array.isArray(area.addressComponents) ? area.addressComponents : [],
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

let map, mapProvider = "leaflet", areaLayer, candidateLayer, routeLayer, previewLayer, nearbyLayer, searchTimer;
const areaMarkers = new Map();
const candidateMarkers = new Map();
function initLeafletMap() {
  mapProvider = "leaflet";
  $("map").replaceChildren();
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([43.35, 142.15], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: "© OpenStreetMap",
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map); areaLayer = L.layerGroup().addTo(map);
  candidateLayer = L.layerGroup().addTo(map); previewLayer = L.layerGroup().addTo(map); nearbyLayer = L.layerGroup().addTo(map);
}
function shortSummary(item) {
  const value = item.experience?.experience_summary || item.experience?.why_people_love_it;
  return known(value) ? String(value) : "";
}
function candidateRegion(item) {
  if (String(item.id).startsWith("JP-")) return "北海道以外的备选";
  return item.region || item.municipality || "其他地区";
}
function focusMapAt(lat, lon, zoom = 13) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (mapProvider === "google") {
    map.panTo({ lat, lng: lon });
    map.setZoom(zoom);
  } else {
    map.flyTo([lat, lon], zoom, { animate: true, duration: .45 });
  }
  setTimeout(() => { $("map").dataset.focusZoom = String(map.getZoom()); }, 550);
}
let toastTimer;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}
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
    await new Promise(resolve => setTimeout(resolve, 1200));
    if ($("map").innerText.includes("无法正确加载 Google 地图")) {
      state.placesReady = false;
      initLeafletMap();
      return;
    }
    areaLayer = []; candidateLayer = []; routeLayer = []; previewLayer = []; nearbyLayer = [];
    try {
      await google.maps.importLibrary("places");
      state.placesReady = true;
    } catch (_) {
      state.placesReady = false;
    }
    return;
  }
  initLeafletMap();
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
  $("mapLegend").innerHTML = categories.map(category => `<button class="legend-item${state.candidateCategory === category ? " active" : ""}" data-map-category="${esc(category)}"><span class="type-dot" style="background:${COLORS[category]}"></span>${esc(labelCategory(category))}</button>`).join("");
  $("mapLegend").hidden = !state.legendOpen || !categories.length;
  $("toggleMapLegend").hidden = !state.showCandidates || !categories.length;
  $("toggleMapLegend").setAttribute("aria-expanded", String(state.legendOpen));
}
function mapCandidates() {
  if (!state.showCandidates) return [];
  if (state.selectedAreaId) return candidatesForArea(state.selectedAreaId).filter(validCoordinates);
  if (state.view === "candidates") return filteredCandidates().filter(validCoordinates);
  return state.candidates.filter(validCoordinates);
}
function renderMap({ fit = false } = {}) {
  clearMapLayer(areaLayer); clearMapLayer(candidateLayer); clearMapLayer(routeLayer); clearMapLayer(previewLayer); clearMapLayer(nearbyLayer);
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
      const computedPaths = state.routeLegs.filter(leg => leg.path?.length > 1);
      if (mapProvider === "google") {
        if (computedPaths.length) computedPaths.forEach(leg => routeLayer.push(new google.maps.Polyline({ path: leg.path, map, strokeColor: "#1a73e8", strokeWeight: 5, strokeOpacity: .72 })));
        else routeLayer.push(new google.maps.Polyline({ path: state.areas.map(area => ({ lat: area.lat, lng: area.lon })), map, strokeColor: "#1a73e8", strokeWeight: 3, strokeOpacity: .48 }));
      } else {
        if (computedPaths.length) computedPaths.forEach(leg => L.polyline(leg.path.map(point => [point.lat,point.lng]), { color: "#1a73e8", weight: 5, opacity: .72 }).addTo(routeLayer));
        else L.polyline(state.areas.map(area => [area.lat, area.lon]), { color: "#1a73e8", weight: 3, opacity: .48, dashArray: "7 8" }).addTo(routeLayer);
      }
    }
  }
  const visibleCandidates = mapCandidates();
  visibleCandidates.forEach(item => {
    const color = COLORS[item.category] || "#687d86";
    const isSelected = item.id === state.selectedCandidateId;
    let marker;
    if (mapProvider === "google") {
      marker = new google.maps.Marker({
        position: { lat: item.location.lat, lng: item.location.lon }, map, title: item.name,
        zIndex: isSelected ? 1200 : 300,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: isSelected ? 11 : 7, fillColor: color, fillOpacity: .96, strokeColor: "#fff", strokeWeight: isSelected ? 4 : 2 },
      });
      marker.addListener("click", () => focusCandidate(item.id, { showDetails: false })); candidateLayer.push(marker);
    } else {
      marker = L.circleMarker([item.location.lat, item.location.lon], { radius: isSelected ? 11 : 7, color: "#fff", weight: isSelected ? 4 : 2, fillColor: color, fillOpacity: .96, className: `candidate-map-marker${isSelected ? " is-selected" : ""}` });
      marker.bindTooltip(item.name, { direction: "top" }); marker.on("click", () => focusCandidate(item.id, { showDetails: false }));
      marker.addTo(candidateLayer);
      const markerElement = marker.getElement();
      if (markerElement) { markerElement.setAttribute("role", "button"); markerElement.setAttribute("aria-label", item.name); markerElement.setAttribute("tabindex", "0"); }
    }
    candidateMarkers.set(item.id, marker); points.push({ lat: item.location.lat, lng: item.location.lon });
  });
  state.nearbyPlaces.forEach(place => {
    if (!place.location) return;
    const position = { lat: place.location.lat(), lng: place.location.lng() };
    const selectedNearby = place.id === state.selectedNearbyPlaceId;
    if (mapProvider === "google") {
      const marker = new google.maps.Marker({ position, map, title: place.displayName || "周边地点", zIndex: selectedNearby ? 1150 : 250,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: selectedNearby ? 10 : 6, fillColor: "#1a73e8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: selectedNearby ? 4 : 2 } });
      marker.addListener("click", () => focusNearbyPlace(place.id)); nearbyLayer.push(marker);
    } else {
      const marker = L.circleMarker([position.lat,position.lng], { radius: selectedNearby ? 10 : 6, color: "#fff", weight: selectedNearby ? 4 : 2, fillColor: "#1a73e8", fillOpacity: 1 });
      marker.on("click", () => focusNearbyPlace(place.id)); marker.addTo(nearbyLayer);
    }
  });
  renderLegend(visibleCandidates);
  if (fit) {
    const libraryPoints = visibleCandidates.filter(item => !String(item.id).startsWith("JP-")).map(item => ({ lat: item.location.lat, lng: item.location.lon }));
    const focusPoints = state.view === "candidates" && !selected && libraryPoints.length ? libraryPoints : points;
    if (mapProvider === "google") {
      if (selected && visibleCandidates.length === 0 && selected.viewport) { map.fitBounds(selected.viewport, 72); }
      else if (selected && visibleCandidates.length === 0) { map.setCenter({ lat: selected.lat, lng: selected.lon }); map.setZoom(10); }
      else if (focusPoints.length === 1) { map.setCenter(focusPoints[0]); map.setZoom(selected ? 11 : 8); }
      else if (focusPoints.length > 1) {
        const bounds = new google.maps.LatLngBounds(); focusPoints.forEach(point => bounds.extend(point)); map.fitBounds(bounds, 72);
        google.maps.event.addListenerOnce(map, "idle", () => { const maxZoom = selected ? 12 : 9; if (map.getZoom() > maxZoom) map.setZoom(maxZoom); });
      } else { map.setCenter({ lat: 43.35, lng: 142.15 }); map.setZoom(6); }
    } else {
      const leafletPoints = focusPoints.map(point => [point.lat, point.lng]);
      if (selected && visibleCandidates.length === 0 && selected.viewport) map.fitBounds([[selected.viewport.south,selected.viewport.west],[selected.viewport.north,selected.viewport.east]], { padding: [70,70], animate: true });
      else if (selected && visibleCandidates.length === 0) map.setView([selected.lat, selected.lon], 10, { animate: true });
      else if (focusPoints.length === 1) map.setView(leafletPoints[0], selected ? 11 : 8, { animate: true });
      else if (focusPoints.length > 1) map.fitBounds(L.latLngBounds(leafletPoints).pad(.18), { maxZoom: selected ? 12 : 9, animate: true });
      else map.setView([43.35, 142.15], 6, { animate: true });
    }
  }
  renderMapFocusCard();
}
function renderMapFocusCard() {
  const candidate = candidateById(state.selectedCandidateId);
  if (candidate) {
    const area = areaForCandidate(candidate.id);
    $("mapFocusCard").innerHTML = `<div class="preview-top"><span class="focus-type-dot" style="background:${COLORS[candidate.category]}"></span><div class="preview-copy"><p class="preview-meta">当前候选地点</p><h3>${esc(candidate.name)}</h3><p>${esc(candidate.municipality || candidate.region || labelCategory(candidate.category))}</p></div></div><div class="focus-row"><span>${esc(labelCategory(candidate.category))}${area ? ` · ${esc(area.name)}` : ""}</span><button data-reopen-candidate="${esc(candidate.id)}">查看详情</button></div>`;
    $("mapFocusCard").hidden = false;
    return;
  }
  const area = areaById(state.selectedAreaId);
  if (!area) { $("mapFocusCard").hidden = true; return; }
  const previewNames = candidatesForArea(area.id).slice(0, 3).map(item => item.name).join("、");
  const status = labelBusinessStatus(area.businessStatus);
  $("mapFocusCard").innerHTML = `<div class="preview-top"><div class="preview-symbol">⭐</div><div class="preview-copy"><p class="preview-meta">当前行程地区</p><h3>${esc(area.name)}</h3><p>${esc(area.address)}</p>${status ? `<span class="place-status">${esc(status)}</span>` : ""}</div></div>${previewNames ? `<p class="focus-candidate-preview">${esc(previewNames)}${area.candidateIds.length > 3 ? "…" : ""}</p>` : ""}<div class="focus-actions"><button class="primary-button" data-explore-nearby="${esc(area.id)}">探索周边</button><button class="secondary-button" data-refresh-area="${esc(area.id)}">更新地点资料</button></div><div class="focus-row"><span>${area.candidateIds.length} 个候选地点 · ${esc(area.startDate || "日期未定")}</span><button data-clear-area-focus>查看整个行程</button></div>`;
  $("mapFocusCard").hidden = false;
}

function renderCounts() {
  const assigned = new Set(state.areas.flatMap(area => area.candidateIds));
  $("areaCount").textContent = state.areas.length; $("areaRailCount").textContent = state.areas.length;
  $("assignedCount").textContent = assigned.size; $("candidateRailCount").textContent = filteredCandidates().length;
}
function areaCandidateRows(area) {
  const items = candidatesForArea(area.id);
  if (!items.length) return '<div class="area-empty-candidates"><strong>还没有候选地点</strong><span>点击下方按钮，从资料库中选择。</span></div>';
  return items.map(item => `<div class="area-candidate-row${item.id === state.selectedCandidateId ? " selected" : ""}"><span class="type-dot" style="background:${COLORS[item.category]}"></span><button data-focus-candidate="${esc(item.id)}"><strong>${esc(item.name)}</strong><span>${esc(labelCategory(item.category))}</span></button><button class="area-detail-button" data-open-candidate-detail="${esc(item.id)}">详情</button><button class="remove-mini" data-remove-candidate="${esc(item.id)}" data-area-id="${esc(area.id)}" aria-label="从地区移除 ${esc(item.name)}">×</button></div>`).join("");
}
function renderTripRouteSummary() {
  const box = $("tripRouteSummary");
  if (state.areas.length < 2) {
    box.innerHTML = '<span class="route-icon">↗</span><span><strong>交通时间</strong><small>加入两个地区后自动计算驾车距离</small></span>';
    return;
  }
  if (state.routeStatus === "loading") {
    box.innerHTML = '<span class="route-spinner"></span><span><strong>正在计算地区间交通</strong><small>按当前行程顺序获取路线</small></span>';
    return;
  }
  const ready = state.routeLegs.filter(leg => Number.isFinite(leg.distanceMeters));
  if (ready.length) {
    const totalDistance = ready.reduce((sum,leg) => sum + leg.distanceMeters, 0);
    const totalDuration = ready.reduce((sum,leg) => sum + leg.durationMillis, 0);
    box.innerHTML = `<span class="route-icon">🚗</span><span><strong>${esc(compactDuration(totalDuration))} · ${esc(compactDistance(totalDistance))}</strong><small>${ready.length} 段驾车路线${state.routeStatus === "partial" ? " · 部分路线暂不可用" : ""}</small></span><button data-refresh-routes aria-label="重新计算交通">↻</button>`;
    return;
  }
  box.innerHTML = '<span class="route-icon">!</span><span><strong>暂时无法取得交通时间</strong><small>地图仍会按行程顺序连接地区</small></span><button data-refresh-routes>重试</button>';
}
function renderAreaCard(area) {
  const selected = area.id === state.selectedAreaId; const expanded = state.expandedAreas.has(area.id);
  const dateLabel = area.startDate ? `${area.startDate}${area.endDate ? ` — ${area.endDate}` : ""}` : "日期未定";
  const leg = routeLegTo(area.id);
  const routeMeta = leg && Number.isFinite(leg.distanceMeters) ? `<span class="area-route-meta">从上一站 🚗 ${esc(compactDuration(leg.durationMillis))} · ${esc(compactDistance(leg.distanceMeters))}</span>` : "";
  return `<article class="area-card${selected ? " selected" : ""}" data-area-card="${esc(area.id)}" draggable="true">
    ${routeMeta}<div class="area-summary"><button class="drag-handle" aria-label="拖动调整顺序">⋮⋮</button><button class="area-main" data-select-area="${esc(area.id)}"><span class="area-title-row"><span class="area-pin">⭐</span><h3>${esc(area.name)}</h3></span><p>${esc(area.address)}</p><span class="area-inline-meta">${esc(dateLabel)}${area.nights ? ` · ${esc(area.nights)} 晚` : ""} · ${area.candidateIds.length} 个地点</span></button><button class="candidate-toggle" data-toggle-area-candidates="${esc(area.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起" : "展开"} ${esc(area.name)} 的候选地点"><span class="chevron">⌄</span></button></div>
    ${expanded ? `<div class="area-expanded"><div class="area-expanded-heading"><span>候选地点</span><button class="icon-menu-button" data-toggle-area-editor="${esc(area.id)}">编辑地区</button></div><div class="area-candidates">${areaCandidateRows(area)}</div><div class="area-primary-actions"><button class="add-candidates-button" data-open-picker="${esc(area.id)}">＋ 添加候选地点</button><button class="explore-nearby-button" data-explore-nearby="${esc(area.id)}">⌖ 探索周边</button></div></div>` : ""}
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
  const summary = shortSummary(item);
  const duration = known(item.experience?.realistic_duration) ? String(item.experience.realistic_duration) : "";
  return `<article class="candidate-card${item.id === state.selectedCandidateId ? " selected" : ""}" data-candidate-card="${esc(item.id)}"><button class="candidate-card-main" data-focus-candidate="${esc(item.id)}"><span class="type-dot" style="background:${COLORS[item.category]}"></span><span class="candidate-card-copy"><span class="candidate-name-row"><strong>${esc(item.name)}</strong>${area ? `<span class="area-label">${esc(area.name)}</span>` : ""}</span><span class="candidate-meta">${esc(labelCategory(item.category))}${duration ? ` · ${esc(duration)}` : ""}${item.municipality ? ` · ${esc(item.municipality)}` : ""}</span>${summary ? `<span class="candidate-summary">${esc(summary)}</span>` : ""}</span></button><div class="candidate-card-actions"><button data-open-candidate-detail="${esc(item.id)}">详情</button><button class="candidate-quick-add" data-quick-add-candidate="${esc(item.id)}">${area ? "更改地区" : "＋ 加入地区"}</button></div></article>`;
}
function renderCategoryChips() {
  const counts = new Map(); state.candidates.forEach(item => counts.set(item.category, (counts.get(item.category) || 0) + 1));
  const chips = [["", "全部", state.candidates.length], ...Object.entries(CATEGORY_LABELS).map(([value,label]) => [value,label,counts.get(value) || 0])];
  $("candidateCategoryChips").innerHTML = chips.map(([value,label,count]) => `<button data-category-chip="${esc(value)}" class="category-chip${state.candidateCategory === value ? " active" : ""}"><span${value ? ` class="type-dot" style="background:${COLORS[value]}"` : ""}></span>${esc(label)} <small>${count}</small></button>`).join("");
}
function renderCandidates() {
  const items = filteredCandidates();
  renderCategoryChips();
  if (!items.length) { $("candidateList").innerHTML = '<div class="empty-state"><h3>没有符合筛选的候选地点</h3></div>'; return; }
  const groups = new Map();
  items.forEach(item => { const group = candidateRegion(item); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(item); });
  $("candidateList").innerHTML = [...groups.entries()].map(([group,rows]) => `<section class="candidate-group"><div class="candidate-group-heading"><h3>${esc(group)}</h3><span>${rows.length}</span></div>${rows.map(candidateCard).join("")}</section>`).join("");
}
function renderAll({ fitMap = false } = {}) { renderCounts(); renderTripRouteSummary(); renderAreas(); renderCandidates(); renderMap({ fit: fitMap }); updateLayerButtons(); }

function selectArea(id) {
  if (!areaById(id)) return; state.selectedAreaId = id; state.selectedCandidateId = null; state.showAreas = true; state.showCandidates = true;
  saveUserState(); renderAll({ fitMap: true });
}
function clearAreaFocus() { state.selectedAreaId = null; state.selectedCandidateId = null; state.showCandidates = state.view === "candidates"; saveUserState(); renderAll({ fitMap: true }); }
function deleteArea(id) { state.areas = state.areas.filter(area => area.id !== id); if (state.selectedAreaId === id) state.selectedAreaId = null; state.expandedAreas.delete(id); saveUserState(); renderAll({ fitMap: true }); queueRouteRefresh(true); }
function removeCandidateFromArea(areaId, candidateId) { const area = areaById(areaId); if (!area) return; area.candidateIds = area.candidateIds.filter(id => id !== candidateId); saveUserState(); renderAll({ fitMap: true }); }
function updateLayerButtons() { $("toggleAreaLayer").classList.toggle("active", state.showAreas); $("toggleCandidateLayer").classList.toggle("active", state.showCandidates); $("toggleMapLegend").classList.toggle("active", state.legendOpen); }

function pointLiteral(point) {
  const lat = typeof point?.lat === "function" ? point.lat() : point?.lat;
  const lng = typeof point?.lng === "function" ? point.lng() : point?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
function areaRouteWaypoint(area, Place) {
  if (area.placeId && !String(area.placeId).startsWith("catalog-")) {
    try { return new Place({ id: area.placeId, requestedLanguage: "zh-CN", requestedRegion: "JP" }); } catch (_) { /* use coordinates */ }
  }
  return { lat: area.lat, lng: area.lon };
}
async function refreshTripRoutes({ force = false } = {}) {
  const signature = state.areas.map(area => `${area.id}:${area.lat}:${area.lon}`).join("|");
  if (state.areas.length < 2 || mapProvider !== "google") {
    state.routeLegs = []; state.routeStatus = state.areas.length < 2 ? "idle" : "unavailable"; state.routeSignature = signature; renderTripRouteSummary(); return;
  }
  if (!force && signature === state.routeSignature && state.routeLegs.length === state.areas.length - 1) return;
  const requestId = ++state.routeRequestId;
  state.routeSignature = signature; state.routeStatus = "loading"; state.routeLegs = []; renderTripRouteSummary(); renderAreas();
  try {
    const [{ Route }, { Place }] = await Promise.all([google.maps.importLibrary("routes"),google.maps.importLibrary("places")]);
    const legs = [];
    for (let index = 1; index < state.areas.length; index += 1) {
      if (requestId !== state.routeRequestId) return;
      const from = state.areas[index - 1]; const to = state.areas[index];
      try {
        const { routes } = await Route.computeRoutes({
          origin: areaRouteWaypoint(from, Place), destination: areaRouteWaypoint(to, Place), travelMode: "DRIVING",
          routingPreference: "TRAFFIC_UNAWARE", language: "zh-CN", region: "JP",
          fields: ["distanceMeters","durationMillis","path"],
        });
        const route = routes?.[0];
        if (!route) throw new Error("No route returned");
        legs.push({ fromId: from.id, toId: to.id, distanceMeters: route.distanceMeters, durationMillis: route.durationMillis,
          path: (route.path || []).map(pointLiteral).filter(Boolean) });
      } catch (error) {
        console.warn(`Route unavailable for ${from.name} → ${to.name}:`, error?.message || error);
        legs.push({ fromId: from.id, toId: to.id, error: error?.message || "route unavailable" });
      }
    }
    if (requestId !== state.routeRequestId) return;
    state.routeLegs = legs; state.routeStatus = legs.some(leg => leg.error) ? (legs.some(leg => !leg.error) ? "partial" : "unavailable") : "ready";
  } catch (error) {
    console.warn("Google Routes library unavailable:", error?.message || error);
    if (requestId !== state.routeRequestId) return;
    state.routeLegs = []; state.routeStatus = "unavailable";
  }
  renderAll();
}
function queueRouteRefresh(force = false) { window.setTimeout(() => void refreshTripRoutes({ force }), 0); }

async function refreshAreaDetails(areaId, { quiet = false } = {}) {
  const area = areaById(areaId); if (!area || !state.placesReady || !area.placeId) return;
  if (!quiet) showToast(`正在更新 ${area.name} 的地点资料…`);
  try {
    const { Place } = await google.maps.importLibrary("places");
    const place = new Place({ id: area.placeId, requestedLanguage: "zh-CN", requestedRegion: "JP" });
    await place.fetchFields({ fields: ["id","displayName","formattedAddress","location","viewport","primaryType","types","businessStatus","addressComponents"] });
    if (place.location) { area.lat = place.location.lat(); area.lon = place.location.lng(); }
    area.name = place.displayName || area.name; area.address = place.formattedAddress || area.address;
    area.viewport = viewportJSON(place.viewport); area.primaryType = place.primaryType || area.primaryType;
    area.types = place.types || area.types; area.businessStatus = place.businessStatus || area.businessStatus;
    area.addressComponents = simplifyAddressComponents(place.addressComponents); saveUserState(); renderAll({ fitMap: true });
    if (!quiet) showToast("地点资料已更新");
  } catch (error) {
    console.warn("Area details unavailable:", error?.message || error);
    if (!quiet) showToast("暂时无法更新地点资料");
  }
}

function renderNearbySheet() {
  const area = areaById(state.nearbyAreaId); const sheet = $("nearbySheet");
  if (!area) { sheet.hidden = true; return; }
  sheet.hidden = false; $("nearbyTitle").textContent = `${area.name}周边`;
  $("nearbyTypeChips").innerHTML = Object.entries(NEARBY_TYPES).map(([value,label]) => `<button class="nearby-chip${state.nearbyType === value ? " active" : ""}" data-nearby-type="${esc(value)}">${esc(label)}</button>`).join("");
  const target = $("nearbyResults");
  if (state.nearbyStatus === "loading") { target.innerHTML = '<div class="nearby-loading"><span class="route-spinner"></span><strong>正在寻找附近地点…</strong></div>'; return; }
  if (state.nearbyStatus === "error") { target.innerHTML = '<div class="nearby-empty"><strong>暂时无法取得周边地点</strong><span>请稍后重试，或选择其他类型。</span><button data-retry-nearby>重试</button></div>'; return; }
  if (!state.nearbyPlaces.length) { target.innerHTML = '<div class="nearby-empty"><strong>附近没有找到此类地点</strong><span>换一个类型试试看。</span></div>'; return; }
  target.innerHTML = state.nearbyPlaces.map(place => {
    const selected = place.id === state.selectedNearbyPlaceId;
    const status = labelBusinessStatus(place.businessStatus);
    return `<button class="nearby-result${selected ? " selected" : ""}" data-focus-nearby="${esc(place.id)}"><span class="nearby-pin">${selected ? "●" : "⌖"}</span><span class="nearby-copy"><strong>${esc(place.displayName || "未命名地点")}</strong><span>${place.rating ? `★ ${esc(place.rating.toFixed(1))}${place.userRatingCount ? `（${esc(place.userRatingCount)}）` : ""}` : esc(place.primaryType || NEARBY_TYPES[state.nearbyType])}${status ? ` · ${esc(status)}` : ""}</span><small>${esc(place.formattedAddress || "")}</small></span></button>`;
  }).join("");
}
async function searchNearby() {
  const area = areaById(state.nearbyAreaId); if (!area) return;
  state.nearbyStatus = "loading"; state.nearbyPlaces = []; state.selectedNearbyPlaceId = null; renderNearbySheet(); renderMap();
  try {
    const { Place, SearchNearbyRankPreference } = await google.maps.importLibrary("places");
    const { places } = await Place.searchNearby({
      fields: ["id","displayName","formattedAddress","location","primaryType","rating","userRatingCount","businessStatus"],
      locationRestriction: { center: { lat: area.lat, lng: area.lon }, radius: 15000 },
      includedPrimaryTypes: [state.nearbyType], maxResultCount: 10,
      rankPreference: SearchNearbyRankPreference.POPULARITY, language: "zh-CN", region: "JP",
    });
    state.nearbyPlaces = places || []; state.nearbyStatus = "ready";
  } catch (error) {
    console.warn("Nearby Search unavailable:", error?.message || error);
    state.nearbyPlaces = []; state.nearbyStatus = "error";
  }
  renderNearbySheet(); renderMap();
}
function openNearby(areaId) {
  const area = areaById(areaId); if (!area) return;
  state.nearbyAreaId = area.id; state.selectedAreaId = area.id; state.selectedCandidateId = null; state.nearbyStatus = "loading";
  renderAll({ fitMap: true }); renderNearbySheet(); void searchNearby();
}
function closeNearby() {
  state.nearbyAreaId = null; state.nearbyPlaces = []; state.selectedNearbyPlaceId = null; state.nearbyStatus = "idle"; renderNearbySheet(); renderMap();
}
function focusNearbyPlace(placeId) {
  const place = state.nearbyPlaces.find(item => item.id === placeId); if (!place?.location) return;
  state.selectedNearbyPlaceId = placeId; focusMapAt(place.location.lat(), place.location.lng(), 15); renderNearbySheet(); renderMap();
}

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
  $("areaSearchResults").innerHTML = predictions.length ? predictions.map((prediction, index) => `<button class="search-result" data-preview-live-place="${index}"><span class="result-pin">⌖</span><span><strong>${esc(prediction.mainText?.toString() || prediction.text.toString())}</strong><p>${esc(prediction.secondaryText?.toString() || "Google Maps")}</p></span><span class="provider-tag">Google Maps</span></button>`).join("") : '<div class="search-empty">Google Maps 中没有匹配地点</div>';
  $("areaSearchResults").hidden = false;
}
async function renderAreaSearchResults() {
  const query = $("areaSearch").value; $("clearAreaSearch").hidden = !query;
  const trimmed = query.trim();
  if (!trimmed) { state.livePredictions = []; state.searchSessionToken = null; $("areaSearchResults").hidden = true; return; }
  if (!state.placesReady || mapProvider !== "google") return renderCatalogSearchResults(trimmed, true);

  const requestId = ++state.searchRequestId;
  delete $("areaSearchResults").dataset.liveSearchError;
  $("areaSearchResults").innerHTML = '<div class="search-empty">正在搜索 Google Maps…</div>';
  $("areaSearchResults").hidden = false;
  try {
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary("places");
    if (!state.searchSessionToken) state.searchSessionToken = new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: trimmed,
      sessionToken: state.searchSessionToken,
      language: "zh-CN",
      region: "jp",
    });
    if (requestId !== state.searchRequestId || $("areaSearch").value.trim() !== trimmed) return;
    renderLiveSearchResults(suggestions.map(item => item.placePrediction).filter(Boolean).slice(0, 8));
  } catch (error) {
    const message = error?.message || String(error);
    $("areaSearchResults").dataset.liveSearchError = message;
    console.warn("Google Places autocomplete unavailable:", message);
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
    await place.fetchFields({ fields: ["id","displayName","formattedAddress","location","viewport","primaryType","types","businessStatus","addressComponents"] });
    if (!place.location) throw new Error("missing location");
    state.searchSessionToken = null;
    showPlacePreview({
      place_id: place.id,
      name_zh: place.displayName || prediction.mainText?.toString() || prediction.text.toString(),
      google_title: place.displayName || prediction.text.toString(),
      formatted_address: place.formattedAddress || prediction.secondaryText?.toString() || "日本",
      lat: place.location.lat(), lon: place.location.lng(), place_type: place.primaryType || "city_or_area",
      viewport: viewportJSON(place.viewport), types: place.types || [], business_status: place.businessStatus || "",
      address_components: simplifyAddressComponents(place.addressComponents),
    });
  } catch (_) {
    $("areaSearchResults").innerHTML = '<div class="search-empty">无法读取这个地区，请重新搜索</div>';
    $("areaSearchResults").hidden = false;
  }
}
function showPlacePreview(place) {
  state.searchPreview = place; $("areaSearchResults").hidden = true; $("mapFocusCard").hidden = true;
  const existing = state.areas.find(area => area.placeId === place.place_id);
  const status = labelBusinessStatus(place.business_status);
  $("placePreview").innerHTML = `<div class="preview-top"><div class="preview-symbol">⌖</div><div class="preview-copy"><p class="preview-meta">Google Maps 地点 / 地区</p><h3>${esc(place.name_zh)}</h3><p>${esc(place.formatted_address)}</p><div class="place-preview-meta">${place.place_type ? `<span>${esc(place.place_type)}</span>` : ""}${status ? `<span>${esc(status)}</span>` : ""}</div></div></div><div class="preview-actions"><button class="primary-button" data-add-preview-place>${existing ? "查看已加入地点" : "加入行程 ⭐"}</button><button class="secondary-button" data-dismiss-preview>取消</button></div>`;
  $("placePreview").hidden = false; clearMapLayer(previewLayer);
  if (mapProvider === "google") {
    const marker = new google.maps.Marker({
      position: { lat: place.lat, lng: place.lon }, map, title: place.name_zh,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#1f6b53", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
    });
    previewLayer.push(marker); if (place.viewport) map.fitBounds(place.viewport, 72); else { map.setCenter({ lat: place.lat, lng: place.lon }); map.setZoom(9); }
  } else {
    L.circleMarker([place.lat, place.lon], { radius: 10, color: "#fff", weight: 3, fillColor: "#1f6b53", fillOpacity: 1 }).addTo(previewLayer);
    if (place.viewport) map.fitBounds([[place.viewport.south,place.viewport.west],[place.viewport.north,place.viewport.east]], { padding: [70,70], animate: true });
    else map.setView([place.lat, place.lon], 9, { animate: true });
  }
}
function addPreviewPlace() {
  const place = state.searchPreview; if (!place) return;
  const existing = state.areas.find(area => area.placeId === place.place_id);
  if (existing) { dismissPreview(); return selectArea(existing.id); }
  const id = `area-${place.place_id}`;
  state.areas.push({ id, placeId: place.place_id, name: place.name_zh, address: place.formatted_address, lat: place.lat, lon: place.lon,
    viewport: viewportJSON(place.viewport), primaryType: place.place_type || "", types: place.types || [], businessStatus: place.business_status || "",
    addressComponents: place.address_components || [], startDate: "", endDate: "", nights: "", note: "", candidateIds: [] });
  state.expandedAreas.clear(); state.expandedAreas.add(id); state.selectedAreaId = id; state.showAreas = true; state.showCandidates = true;
  dismissPreview(); saveUserState(); renderAll({ fitMap: true }); queueRouteRefresh();
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
  $("pickerCandidateList").innerHTML = items.length ? items.map(item => { const current = areaForCandidate(item.id); return `<label class="picker-row"><input type="checkbox" value="${esc(item.id)}"${state.pickerSelection.has(item.id) ? " checked" : ""}><span class="type-dot" style="background:${COLORS[item.category]}"></span><span><h3>${esc(item.name)}</h3><p>${esc(labelCategory(item.category))}${item.municipality ? ` · ${esc(item.municipality)}` : ""}${current ? ` · 当前：${esc(current.name)}` : ""}</p></span></label>`; }).join("") : '<div class="empty-state"><h3>没有符合筛选的候选地点</h3></div>';
  $("pickerSelectionCount").textContent = `已选择 ${state.pickerSelection.size}`;
}
function savePicker() {
  const target = areaById(state.pickerAreaId); if (!target) return;
  const moved = [...state.pickerSelection].map(id => ({ id, area: areaForCandidate(id) })).filter(row => row.area && row.area.id !== target.id);
  if (moved.length && !window.confirm(`${moved.length} 个 Candidate 已属于其他地区。确认移动到“${target.name}”吗？`)) return;
  state.areas.forEach(area => { if (area.id !== target.id) area.candidateIds = area.candidateIds.filter(id => !state.pickerSelection.has(id)); });
  target.candidateIds = [...state.pickerSelection]; state.expandedAreas.clear(); state.expandedAreas.add(target.id); saveUserState(); closePicker(); renderAll({ fitMap: true }); showToast(`已更新 ${target.name} 的候选地点`);
}

function displayList(items) { return Array.isArray(items) && items.length ? `<ul class="research-list">${items.map(item => `<li>${esc(shown(item))}</li>`).join("")}</ul>` : ""; }
function dl(rows) { const knownRows = rows.filter(([,value]) => known(value)); return knownRows.length ? `<dl>${knownRows.map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(shown(value))}</dd>`).join("")}</dl>` : ""; }
function infoSection(title, content) { return content ? `<section class="detail-section"><h3>${esc(title)}</h3>${content}</section>` : ""; }
function renderVisualEvidence(item) {
  const assets = item.visual?.assets || [];
  if (!assets.length) return "";
  return `<div class="gallery">${assets.map(asset => { const url = asset.asset_url || asset.source_page_url; return `<figure>${asset.asset_url ? `<img src="${esc(asset.asset_url)}" alt="${esc(asset.caption || item.name)}" loading="lazy">` : '<div class="photo-placeholder">VISUAL SOURCE</div>'}<figcaption>${esc(shown(asset.what_this_image_is_showing || asset.caption))}</figcaption></figure>`; }).join("")}</div>`;
}
function yesNoFeature(label, value) { return value === true ? `<span class="google-feature">✓ ${esc(label)}</span>` : ""; }
function renderGooglePlaceDetails(item) {
  const placeId = item.location?.provider_place_id;
  if (!placeId || !state.placesReady) return "";
  if (state.placeDetailsLoading.has(item.id)) return '<section class="google-place-card loading"><span class="route-spinner"></span><div><strong>正在读取 Google 地点资料</strong><small>营业时间、评分和实用设施</small></div></section>';
  const detail = state.placeDetails.get(item.id);
  if (!detail) return '<section class="google-place-card"><div><strong>Google 地点资料暂不可用</strong><small>研究资料仍可正常查看</small></div><button data-refresh-google-detail="true">重试</button></section>';
  const currentHours = detail.currentOpeningHours?.weekdayDescriptions || [];
  const regularHours = detail.regularOpeningHours?.weekdayDescriptions || [];
  const photo = detail.photos?.[0]; const photoUrl = photo?.getURI ? photo.getURI({ maxWidth: 1000, maxHeight: 560 }) : "";
  const attributions = (photo?.authorAttributions || []).map(author => author.uri ? `<a href="${esc(author.uri)}" target="_blank" rel="noopener">${esc(author.displayName || "照片提供者")}</a>` : esc(author.displayName || "")).join(" · ");
  const accessibility = detail.accessibilityOptions || {}; const parking = detail.parkingOptions || {};
  const features = [
    yesNoFeature("无障碍入口",accessibility.hasWheelchairAccessibleEntrance), yesNoFeature("无障碍停车",accessibility.hasWheelchairAccessibleParking),
    yesNoFeature("无障碍洗手间",accessibility.hasWheelchairAccessibleRestroom), yesNoFeature("设有洗手间",detail.hasRestroom),
    yesNoFeature("可预约",detail.isReservable), yesNoFeature("免费停车场",parking.hasFreeParkingLot), yesNoFeature("收费停车场",parking.hasPaidParkingLot),
  ].filter(Boolean).join("");
  const status = labelBusinessStatus(detail.businessStatus);
  return `<section class="google-place-card">${photoUrl ? `<figure><img src="${esc(photoUrl)}" alt="${esc(item.name)} Google 地点照片"><figcaption>${attributions ? `照片：${attributions}` : "Google 地点照片"}</figcaption></figure>` : ""}<div class="google-place-content"><div class="google-place-heading"><div><span>GOOGLE 地点资料</span><strong>${esc(detail.displayName || item.name)}</strong></div>${detail.rating ? `<div class="google-rating"><b>${esc(detail.rating.toFixed(1))}</b><span>★</span><small>${esc(detail.userRatingCount || 0)} 条评分</small></div>` : ""}</div><div class="google-place-facts">${status ? `<span>${esc(status)}</span>` : ""}${detail.priceLevel ? `<span>${esc(detail.priceLevel)}</span>` : ""}${detail.nationalPhoneNumber ? `<a href="tel:${esc(detail.nationalPhoneNumber)}">${esc(detail.nationalPhoneNumber)}</a>` : ""}${detail.websiteURI ? `<a href="${esc(detail.websiteURI)}" target="_blank" rel="noopener">官方网站 ↗</a>` : ""}</div>${features ? `<div class="google-features">${features}</div>` : ""}${currentHours.length || regularHours.length ? `<details class="opening-hours"><summary>查看营业时间</summary><div>${(currentHours.length ? currentHours : regularHours).map(row => `<span>${esc(row)}</span>`).join("")}</div></details>` : ""}<small class="google-freshness">实时资料可能变化，出发前请再次刷新。</small></div></section>`;
}
async function loadCandidateGoogleDetails(item, { force = false } = {}) {
  const placeId = item.location?.provider_place_id;
  if (!placeId || !state.placesReady || state.placeDetailsLoading.has(item.id) || (!force && state.placeDetails.has(item.id))) return;
  state.placeDetailsLoading.add(item.id); if ($("detailDialog").open) renderCandidateDetail(item);
  try {
    const { Place } = await google.maps.importLibrary("places");
    const place = new Place({ id: placeId, requestedLanguage: "zh-CN", requestedRegion: "JP" });
    await place.fetchFields({ fields: ["displayName","formattedAddress","businessStatus","rating","userRatingCount","regularOpeningHours","currentOpeningHours","websiteURI","nationalPhoneNumber","internationalPhoneNumber","priceLevel","photos","accessibilityOptions","parkingOptions","hasRestroom","isReservable"] });
    state.placeDetails.set(item.id, place);
  } catch (error) {
    console.warn(`Google details unavailable for ${item.id}:`, error?.message || error);
    state.placeDetails.delete(item.id);
  }
  state.placeDetailsLoading.delete(item.id);
  if ($("detailDialog").open && state.selectedCandidateId === item.id) renderCandidateDetail(item);
}
function renderDetailAreaAction(item) {
  const current = areaForCandidate(item.id);
  if (!state.areas.length) return `<div class="detail-area-action"><div><strong>加入行程地区</strong><span>先在地图上搜索并添加一个市或地区。</span></div><button class="primary-button" data-go-to-areas>添加地区</button></div>`;
  const options = state.areas.map(area => `<option value="${esc(area.id)}"${current?.id === area.id ? " selected" : ""}>${esc(area.name)}</option>`).join("");
  return `<div class="detail-area-action"><label><strong>${current ? "更改所属地区" : "加入行程地区"}</strong><select id="detailAreaSelect"><option value="">请选择地区</option>${options}</select></label><button class="primary-button" data-assign-candidate="${esc(item.id)}">${current ? "更新地区" : "加入地区"}</button></div>`;
}
function renderCandidateDetail(item) {
  const area = areaForCandidate(item.id); const position = item.temporal?.trip_window_position || {};
  const altNames = [item.names?.ja, item.names?.en].filter(known).map(esc).join(" · ");
  const preview = dl([["体验概览",item.experience?.experience_summary],["值得去的原因",item.experience?.why_people_love_it]]);
  const tripExperience = dl([["9 月旅行体验",item.experience?.sep_2026_experience],["时间窗口",friendlyTiming(item.experience?.trip_window_fit)],["建议行程阶段",friendlyTiming(position.preferred_trip_segment)]]);
  const practical = dl([["建议停留时间",item.experience?.realistic_duration],["天气影响",item.experience?.weather_dependency],["体力要求",item.experience?.physical_load],["所在市町",item.municipality]]);
  const disappointment = known(item.experience?.common_disappointments) ? `<p>${esc(shown(item.experience.common_disappointments))}</p>` : "";
  $("detailContent").innerHTML = `<header class="detail-hero"><span class="detail-category" style="--category-color:${COLORS[item.category]}">${esc(labelCategory(item.category))}</span><h2>${esc(item.name)}</h2>${altNames ? `<p class="alt-names">${altNames}</p>` : ""}</header>${renderDetailAreaAction(item)}<div class="detail-body"><div class="detail-tags">${area ? `<span class="detail-tag">已加入 ${esc(area.name)}</span>` : `<span class="detail-tag neutral">尚未加入地区</span>`}${item.municipality ? `<span class="detail-tag neutral">${esc(item.municipality)}</span>` : ""}</div>${renderGooglePlaceDetails(item)}${infoSection("30 秒了解", preview)}${infoSection("实际会做什么", displayList(item.experience?.what_you_actually_do))}${infoSection("9 月 5–18 日体验", tripExperience)}${infoSection("实用信息", practical)}${infoSection("可能失望之处", disappointment)}${infoSection("视觉资料",renderVisualEvidence(item))}</div>`;
}
function openCandidate(id) {
  const item = candidateById(id); if (!item) return;
  renderCandidateDetail(item);
  if (!$("detailDialog").open) $("detailDialog").showModal();
  void loadCandidateGoogleDetails(item);
}
function focusCandidate(id, { showDetails = false } = {}) {
  const item = candidateById(id); if (!item) return;
  state.selectedCandidateId = id; state.showCandidates = true;
  renderAll();
  if (validCoordinates(item)) focusMapAt(item.location.lat, item.location.lon, 13);
  if (showDetails) openCandidate(id);
}
function assignCandidateToArea(candidateId, areaId) {
  const item = candidateById(candidateId); const target = areaById(areaId); if (!item) return; if (!target) return showToast("请先选择一个地区");
  state.areas.forEach(area => { area.candidateIds = area.candidateIds.filter(id => id !== candidateId); });
  target.candidateIds.push(candidateId);
  state.selectedAreaId = target.id; state.selectedCandidateId = candidateId; state.expandedAreas.add(target.id); state.showCandidates = true;
  saveUserState(); renderAll(); focusMapAt(item.location?.lat, item.location?.lon, 13); renderCandidateDetail(item);
  showToast(`已把“${item.name}”加入 ${target.name}`);
}

function switchView(view) {
  state.view = view; state.selectedCandidateId = null; document.querySelectorAll(".panel-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view));
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
  $("mapFocusCard").addEventListener("click", event => {
    if (event.target.closest("[data-clear-area-focus]")) return clearAreaFocus();
    const reopen = event.target.closest("[data-reopen-candidate]"); if (reopen) return openCandidate(reopen.dataset.reopenCandidate);
    const nearby = event.target.closest("[data-explore-nearby]"); if (nearby) return openNearby(nearby.dataset.exploreNearby);
    const refresh = event.target.closest("[data-refresh-area]"); if (refresh) return void refreshAreaDetails(refresh.dataset.refreshArea);
  });
  $("toggleAreaLayer").addEventListener("click", () => { state.showAreas = !state.showAreas; renderMap(); updateLayerButtons(); });
  $("toggleCandidateLayer").addEventListener("click", () => { state.showCandidates = !state.showCandidates; renderMap({ fit: state.showCandidates }); updateLayerButtons(); });
  $("toggleMapLegend").addEventListener("click", () => { state.legendOpen = !state.legendOpen; renderMap(); updateLayerButtons(); });
  $("mapLegend").addEventListener("click", event => { const button = event.target.closest("[data-map-category]"); if (!button) return; state.candidateCategory = state.candidateCategory === button.dataset.mapCategory ? "" : button.dataset.mapCategory; renderCandidates(); renderCounts(); renderMap({ fit: true }); });
  $("areaList").addEventListener("click", event => {
    const select = event.target.closest("[data-select-area]"); if (select) return selectArea(select.dataset.selectArea);
    const toggle = event.target.closest("[data-toggle-area-candidates]"); if (toggle) { const id = toggle.dataset.toggleAreaCandidates; if (state.expandedAreas.has(id)) state.expandedAreas.delete(id); else { state.expandedAreas.clear(); state.expandedAreas.add(id); } state.selectedAreaId = id; state.selectedCandidateId = null; state.showCandidates = true; saveUserState(); return renderAll({ fitMap: true }); }
    const edit = event.target.closest("[data-toggle-area-editor]"); if (edit) { const area = areaById(edit.dataset.toggleAreaEditor); if (area) { area.editing = !area.editing; state.selectedAreaId = area.id; renderAreas(); } return; }
    const picker = event.target.closest("[data-open-picker]"); if (picker) return openPicker(picker.dataset.openPicker);
    const nearby = event.target.closest("[data-explore-nearby]"); if (nearby) return openNearby(nearby.dataset.exploreNearby);
    const remove = event.target.closest("[data-remove-candidate]"); if (remove) return removeCandidateFromArea(remove.dataset.areaId, remove.dataset.removeCandidate);
    const detail = event.target.closest("[data-open-candidate-detail]"); if (detail) return focusCandidate(detail.dataset.openCandidateDetail, { showDetails: true });
    const focus = event.target.closest("[data-focus-candidate]"); if (focus) return focusCandidate(focus.dataset.focusCandidate, { showDetails: false });
    const del = event.target.closest("[data-delete-area]"); if (del) return deleteArea(del.dataset.deleteArea);
  });
  $("areaList").addEventListener("input", event => { const field = event.target.dataset.areaField; const area = areaById(event.target.dataset.areaId); if (field && area) { area[field] = event.target.value; saveUserState(); if (field === "name") renderMapFocusCard(); renderCounts(); } });
  $("areaList").addEventListener("dragstart", event => { const card = event.target.closest("[data-area-card]"); if (card) { state.draggedAreaId = card.dataset.areaCard; card.classList.add("dragging"); } });
  $("areaList").addEventListener("dragend", event => { event.target.closest("[data-area-card]")?.classList.remove("dragging"); state.draggedAreaId = null; });
  $("areaList").addEventListener("dragover", event => event.preventDefault());
  $("areaList").addEventListener("drop", event => { event.preventDefault(); const target = event.target.closest("[data-area-card]")?.dataset.areaCard; if (!target || !state.draggedAreaId || target === state.draggedAreaId) return; const from = state.areas.findIndex(area => area.id === state.draggedAreaId); const to = state.areas.findIndex(area => area.id === target); const [moved] = state.areas.splice(from,1); state.areas.splice(to,0,moved); saveUserState(); renderAll({ fitMap: true }); queueRouteRefresh(true); });
  $("tripRouteSummary").addEventListener("click", event => { if (event.target.closest("[data-refresh-routes]")) queueRouteRefresh(true); });
  $("closeNearby").addEventListener("click", closeNearby);
  $("nearbyTypeChips").addEventListener("click", event => { const chip = event.target.closest("[data-nearby-type]"); if (!chip) return; state.nearbyType = chip.dataset.nearbyType; void searchNearby(); });
  $("nearbyResults").addEventListener("click", event => { const result = event.target.closest("[data-focus-nearby]"); if (result) return focusNearbyPlace(result.dataset.focusNearby); if (event.target.closest("[data-retry-nearby]")) void searchNearby(); });
  $("candidateList").addEventListener("click", event => { const detail = event.target.closest("[data-open-candidate-detail]"); if (detail) return focusCandidate(detail.dataset.openCandidateDetail, { showDetails: true }); const add = event.target.closest("[data-quick-add-candidate]"); if (add) return focusCandidate(add.dataset.quickAddCandidate, { showDetails: true }); const focus = event.target.closest("[data-focus-candidate]"); if (focus) return focusCandidate(focus.dataset.focusCandidate, { showDetails: false }); });
  $("candidateCategoryChips").addEventListener("click", event => { const chip = event.target.closest("[data-category-chip]"); if (!chip) return; state.candidateCategory = chip.dataset.categoryChip; renderCandidates(); renderCounts(); if (state.view === "candidates") renderMap({fit:true}); });
  $("candidateSearch").addEventListener("input", event => { state.candidateQuery = event.target.value; renderCandidates(); renderCounts(); if (state.view === "candidates") renderMap({fit:true}); });
  $("candidateUnassignedOnly").addEventListener("change", event => { state.candidateUnassignedOnly = event.target.checked; renderCandidates(); renderCounts(); if (state.view === "candidates") renderMap({fit:true}); });
  $("closePicker").addEventListener("click", closePicker); $("drawerScrim").addEventListener("click", closePicker);
  ["pickerSearch","pickerCategory","pickerUnassignedOnly"].forEach(id => $(id).addEventListener(id === "pickerSearch" ? "input" : "change", renderPicker));
  $("pickerCandidateList").addEventListener("change", event => { if (event.target.matches('input[type="checkbox"]')) { event.target.checked ? state.pickerSelection.add(event.target.value) : state.pickerSelection.delete(event.target.value); $("pickerSelectionCount").textContent = `已选择 ${state.pickerSelection.size}`; } });
  $("selectAllPicker").addEventListener("click", () => { pickerCandidates().forEach(item => state.pickerSelection.add(item.id)); renderPicker(); });
  $("savePicker").addEventListener("click", savePicker);
  $("closeDetail").addEventListener("click", () => $("detailDialog").close());
  $("detailContent").addEventListener("click", event => {
    const assign = event.target.closest("[data-assign-candidate]");
    if (assign) return assignCandidateToArea(assign.dataset.assignCandidate, $("detailAreaSelect")?.value);
    if (event.target.closest("[data-refresh-google-detail]")) { const item = candidateById(state.selectedCandidateId); if (item) void loadCandidateGoogleDetails(item, { force: true }); return; }
    if (event.target.closest("[data-go-to-areas]")) { $("detailDialog").close(); switchView("areas"); $("areaSearch").focus(); }
  });
}

async function boot() {
  try {
    const paths = ["../data/hokkaido_places_master.json","../data/candidate_locations.json","../data/research_batches_level1.json","../data/google_maps_area_catalog.json"];
    const responses = await Promise.all(paths.map(path => fetch(path))); if (responses.some(response => !response.ok)) throw new Error("数据文件无法读取");
    const [master,locations,batches,catalog] = await Promise.all(responses.map(response => response.json()));
    state.candidates = window.ResearchDataAdapter.buildCandidateViewModels(master,locations,batches); state.catalog = catalog.places || [];
    loadUserState(); fillCategorySelect($("pickerCategory")); await initMap(); setupInteractions(); renderAll({ fitMap: true }); queueRouteRefresh();
  } catch (error) {
    $("areaList").innerHTML = `<div class="empty-state"><h3>无法载入地图数据</h3><p>${esc(error.message)}</p></div>`;
  }
}
boot();
