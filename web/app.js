const STORAGE_KEY = "hokkaido-trip-planner-v2";
const NAVITIME_KEY_STORAGE = "hokkaido-navitime-rapidapi-key";
const NAVITIME_QUOTA_STORAGE = "hokkaido-navitime-quota";
const NAVITIME_HOST = "navitime-route-totalnavi.p.rapidapi.com";
const state = {
  candidates: [], catalog: [], areas: [], view: "areas", selectedAreaId: null,
  selectedCandidateId: null,
  expandedAreas: new Set(), showAreas: true, showCandidates: false,
  candidateQuery: "", candidateCategory: "", candidateUnassignedOnly: false,
  searchPreview: null, pickerAreaId: null, pickerSelection: new Set(), draggedAreaId: null,
  livePredictions: [], placesReady: false, searchSessionToken: null, searchRequestId: 0,
  legendOpen: false, nearbyAreaId: null, nearbyType: "tourist_attraction", nearbyPlaces: [],
  nearbyStatus: "idle", selectedNearbyPlaceId: null, placeDetails: new Map(), placeDetailsLoading: new Set(),
  savedRoutes: [], activeSavedRouteId: null, routeOptions: [], selectedRouteOption: 0,
  routeStatus: "idle", routeRequestId: 0, routeSearchRequestId: 0, routeSearchTarget: null,
  routeSearchPredictions: [], routeSearchSessionToken: null, routeDetailsOpen: new Set(),
  navitimeQuota: { limit: 500, remaining: null, resetSeconds: null, observedCalls: 0, authoritative: false, updatedAt: null },
  routeDraft: {
    origin: null, destination: null, travelMode: "TRANSIT", timeMode: "departure",
    dateTime: "2026-09-05T09:00", transitModes: [], transitPreference: "",
  },
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
const ROUTE_MODES = {
  TRANSIT: { label: "公共交通", icon: "🚆" }, WALKING: { label: "步行", icon: "🚶" },
  BICYCLING: { label: "骑行", icon: "🚲" }, DRIVING: { label: "驾车", icon: "🚗" },
  CUSTOM: { label: "自定义交通", icon: "🚌" },
};
const TRANSIT_MODE_LABELS = { BUS: "巴士", SUBWAY: "地铁", TRAIN: "列车", LIGHT_RAIL: "轻轨", RAIL: "轨道交通", FERRY: "渡轮" };
const NAVITIME_MOVE_LABELS = {
  domestic_flight: "航空", superexpress_train: "新干线", sleeper_ultraexpress: "卧铺特急",
  ultraexpress_train: "特急", express_train: "急行", rapid_train: "快速", semiexpress_train: "有料列车",
  local_train: "普通列车", shuttle_bus: "空港巴士", local_bus: "巴士", highway_bus: "高速巴士", ferry: "渡轮",
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
function navitimeApiKey() { return sessionStorage.getItem(NAVITIME_KEY_STORAGE) || localStorage.getItem(NAVITIME_KEY_STORAGE) || ""; }
function setNavitimeApiKey(value) {
  const key = String(value || "").trim();
  const changed = key !== navitimeApiKey();
  if (key) localStorage.setItem(NAVITIME_KEY_STORAGE, key); else localStorage.removeItem(NAVITIME_KEY_STORAGE);
  sessionStorage.removeItem(NAVITIME_KEY_STORAGE);
  if (changed) clearNavitimeQuota();
  renderNavitimeConnection();
}
function loadNavitimeQuota() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAVITIME_QUOTA_STORAGE) || "null");
    if (saved && Number.isFinite(saved.limit) && saved.limit > 0) state.navitimeQuota = {
      limit: saved.limit, remaining: Number.isFinite(saved.remaining) ? saved.remaining : null,
      resetSeconds: Number.isFinite(saved.resetSeconds) ? saved.resetSeconds : null,
      observedCalls: Number.isFinite(saved.observedCalls) ? saved.observedCalls : 0,
      authoritative: Boolean(saved.authoritative), updatedAt: saved.updatedAt || null,
    };
  } catch (_) { /* use the safe default */ }
}
function saveNavitimeQuota() { localStorage.setItem(NAVITIME_QUOTA_STORAGE, JSON.stringify(state.navitimeQuota)); }
function clearNavitimeQuota() {
  state.navitimeQuota = { limit: 500, remaining: null, resetSeconds: null, observedCalls: 0, authoritative: false, updatedAt: null };
  localStorage.removeItem(NAVITIME_QUOTA_STORAGE); renderNavitimeQuota();
}
function quotaHeaderNumber(headers,names) {
  for (const name of names) {
    const value = Number(headers?.get?.(name)); if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}
function updateNavitimeQuota(response) {
  const hardLimit = quotaHeaderNumber(response?.headers, ["x-rate-limit-rapid-free-plans-hard-limit-limit"]);
  const hardRemaining = quotaHeaderNumber(response?.headers, ["x-rate-limit-rapid-free-plans-hard-limit-remaining"]);
  const genericLimit = quotaHeaderNumber(response?.headers, ["x-ratelimit-requests-limit"]);
  const genericRemaining = quotaHeaderNumber(response?.headers, ["x-ratelimit-requests-remaining"]);
  const limit = hardLimit > 0 ? hardLimit : (genericLimit === 500 ? genericLimit : null);
  const remaining = hardLimit > 0 ? hardRemaining : (genericLimit === 500 ? genericRemaining : null);
  const resetSeconds = quotaHeaderNumber(response?.headers, hardLimit > 0 ? ["x-rate-limit-rapid-free-plans-hard-limit-reset"] : ["x-ratelimit-requests-reset"]);
  if (Number.isFinite(limit) && Number.isFinite(remaining) && remaining >= 0) {
    state.navitimeQuota = { limit, remaining: Math.min(limit,remaining), resetSeconds, observedCalls: Math.max(0,limit - remaining), authoritative: true, updatedAt: new Date().toISOString() };
  } else if (response?.ok) {
    state.navitimeQuota = { ...state.navitimeQuota, limit: state.navitimeQuota.limit || 500, remaining: null, resetSeconds: null, observedCalls: state.navitimeQuota.observedCalls + 1, authoritative: false, updatedAt: new Date().toISOString() };
  }
  saveNavitimeQuota(); renderNavitimeQuota();
}
function quotaResetLabel(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const days = Math.ceil(seconds / 86400); if (days > 1) return ` · 约 ${days} 天后重置`;
  const hours = Math.max(1,Math.ceil(seconds / 3600)); return ` · 约 ${hours} 小时后重置`;
}
function renderNavitimeQuota() {
  const usage = $("navitimeQuotaUsage"); if (!usage) return;
  const quota = state.navitimeQuota; const knownRemaining = Number.isFinite(quota.remaining);
  const used = knownRemaining ? Math.max(0,quota.limit - quota.remaining) : quota.observedCalls;
  usage.textContent = `${quota.authoritative ? "已使用" : "本浏览器已查询"} ${used} / ${quota.limit}`;
  $("navitimeQuotaRemaining").textContent = knownRemaining ? `剩余 ${quota.remaining} 次${quotaResetLabel(quota.resetSeconds)}` : "查询后读取账户剩余额度";
  const ratio = quota.limit ? Math.min(1,used / quota.limit) : 0; $("navitimeQuotaBar").style.width = `${ratio * 100}%`;
  const box = $("navitimeQuota"); box.classList.toggle("warning", knownRemaining && quota.remaining / quota.limit <= .15); box.classList.toggle("depleted", knownRemaining && quota.remaining === 0);
}
function renderNavitimeConnection() {
  const connected = Boolean(navitimeApiKey()); const box = $("navitimeConnection"); if (!box) return;
  box.classList.toggle("connected", connected);
  const remaining = state.navitimeQuota.remaining;
  $("navitimeConnectionStatus").textContent = connected ? (Number.isFinite(remaining) ? `已连接 · 剩余 ${remaining} 次` : "已连接 · 免费额度 500 次") : "尚未连接 · 免费额度 500 次";
  $("toggleNavitimeSettings").textContent = connected ? "设置" : "连接";
  renderNavitimeQuota();
}
function openNavitimeSettings() {
  $("navitimeSettings").hidden = false; $("navitimeApiKey").value = ""; $("navitimeApiKey").focus();
}
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
function routeById(id) { return state.savedRoutes.find(route => route.id === id) || null; }
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
    const googleRouteCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    state.savedRoutes = Array.isArray(saved.savedRoutes) ? saved.savedRoutes.filter(route => route?.id && route.origin && route.destination && route.selectedOption)
      .filter(route => route.selectedOption.custom || (route.updatedAt && new Date(route.updatedAt).getTime() >= googleRouteCutoff)) : [];
    state.activeSavedRouteId = state.savedRoutes.some(route => route.id === saved.activeSavedRouteId) ? saved.activeSavedRouteId : null;
  } catch (_) { state.areas = []; state.selectedAreaId = null; }
}
function saveUserState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    areas: state.areas, selectedAreaId: state.selectedAreaId,
    savedRoutes: state.savedRoutes, activeSavedRouteId: state.activeSavedRouteId,
  }));
}
function fillCategorySelect(select) {
  Object.entries(CATEGORY_LABELS).forEach(([value, label]) => {
    const option = document.createElement("option"); option.value = value; option.textContent = label; select.appendChild(option);
  });
}

let map, mapProvider = "leaflet", areaLayer, candidateLayer, routeLayer, previewLayer, nearbyLayer, searchTimer, routeSearchTimer;
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
function currentRouteOption() { return state.routeOptions[state.selectedRouteOption] || null; }
function addRoutePolyline(path, { color = "#1a73e8", weight = 5, opacity = .8, dashed = false, zIndex = 1 } = {}, onClick) {
  if (!Array.isArray(path) || path.length < 2) return;
  if (mapProvider === "google") {
    const line = new google.maps.Polyline({ path, map, strokeColor: color, strokeWeight: weight, strokeOpacity: opacity, zIndex });
    if (onClick) line.addListener("click", onClick);
    routeLayer.push(line);
  } else {
    const line = L.polyline(path.map(point => [point.lat,point.lng]), { color, weight, opacity, dashArray: dashed ? "7 8" : undefined });
    if (onClick) line.on("click", onClick);
    line.addTo(routeLayer);
  }
}
function addRouteEndpointMarker(endpoint, label, color) {
  if (!endpoint || !Number.isFinite(endpoint.lat) || !Number.isFinite(endpoint.lon)) return;
  const position = { lat: endpoint.lat, lng: endpoint.lon };
  if (mapProvider === "google") {
    const marker = new google.maps.Marker({ position, map, title: endpoint.name,
      zIndex: 1450, label: { text: label, color: "#fff", fontWeight: "700" },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } });
    routeLayer.push(marker);
  } else {
    L.marker([endpoint.lat,endpoint.lon], { icon: L.divIcon({ className: "route-endpoint-marker", html: `<span style="background:${color}">${label}</span>`, iconSize: [28,28], iconAnchor: [14,14] }), zIndexOffset: 1400 }).addTo(routeLayer);
  }
}
function renderRouteLayers() {
  const current = currentRouteOption();
  const currentPaths = state.view === "routes" ? state.routeOptions : [];
  state.savedRoutes.forEach(route => {
    if (route.id === state.activeSavedRouteId && current) return;
    const active = route.id === state.activeSavedRouteId;
    addRoutePolyline(route.selectedOption?.path, { color: active ? "#1a73e8" : "#5f6368", weight: active ? 6 : 3, opacity: active ? .88 : .32, dashed: Boolean(route.selectedOption?.custom), zIndex: active ? 20 : 2 }, () => activateSavedRoute(route.id));
  });
  currentPaths.forEach((option,index) => {
    const selected = index === state.selectedRouteOption;
    addRoutePolyline(option.path, { color: selected ? "#1a73e8" : "#6f8fbd", weight: selected ? 7 : 4, opacity: selected ? .92 : .42, dashed: Boolean(option.custom), zIndex: selected ? 40 : 15 }, () => selectRouteOption(index, { fit: true }));
  });
  const activeSaved = routeById(state.activeSavedRouteId);
  const endpoints = current ? state.routeDraft : activeSaved;
  if (endpoints?.origin && endpoints?.destination) {
    addRouteEndpointMarker(endpoints.origin, "A", "#1a73e8");
    addRouteEndpointMarker(endpoints.destination, "B", "#d93025");
  }
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
  }
  renderRouteLayers();
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
    const routeFocusPoints = currentRouteOption()?.path || routeById(state.activeSavedRouteId)?.selectedOption?.path || [];
    const focusPoints = state.view === "routes" && routeFocusPoints.length ? routeFocusPoints : (state.view === "candidates" && !selected && libraryPoints.length ? libraryPoints : points);
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
    $("mapFocusCard").innerHTML = `<div class="preview-top"><span class="focus-type-dot" style="background:${COLORS[candidate.category]}"></span><div class="preview-copy"><p class="preview-meta">当前候选地点</p><h3>${esc(candidate.name)}</h3><p>${esc(candidate.municipality || candidate.region || labelCategory(candidate.category))}</p></div></div>${validCoordinates(candidate) ? `<div class="route-quick-actions"><button class="route-to-button" data-plan-route-to-candidate="${esc(candidate.id)}"><span>↗</span>到这里</button><button class="route-from-button" data-plan-route-from-candidate="${esc(candidate.id)}"><span>↘</span>从这里出发</button></div>` : ""}<div class="focus-row"><span>${esc(labelCategory(candidate.category))}${area ? ` · ${esc(area.name)}` : ""}</span><button data-reopen-candidate="${esc(candidate.id)}">查看详情</button></div>`;
    $("mapFocusCard").hidden = false;
    return;
  }
  const area = areaById(state.selectedAreaId);
  if (!area) { $("mapFocusCard").hidden = true; return; }
  const previewNames = candidatesForArea(area.id).slice(0, 3).map(item => item.name).join("、");
  const status = labelBusinessStatus(area.businessStatus);
  $("mapFocusCard").innerHTML = `<div class="preview-top"><div class="preview-symbol">⭐</div><div class="preview-copy"><p class="preview-meta">当前行程地区</p><h3>${esc(area.name)}</h3><p>${esc(area.address)}</p>${status ? `<span class="place-status">${esc(status)}</span>` : ""}</div></div>${previewNames ? `<p class="focus-candidate-preview">${esc(previewNames)}${area.candidateIds.length > 3 ? "…" : ""}</p>` : ""}<div class="route-quick-actions"><button class="route-to-button" data-plan-route-to-area="${esc(area.id)}"><span>↗</span>到这里</button><button class="route-from-button" data-plan-route-from-area="${esc(area.id)}"><span>↘</span>从这里出发</button></div><div class="focus-actions focus-tool-actions"><button class="secondary-button" data-explore-nearby="${esc(area.id)}">探索周边</button><button class="secondary-button" data-refresh-area="${esc(area.id)}">更新地点资料</button></div><div class="focus-row"><span>${area.candidateIds.length} 个候选地点 · ${esc(area.startDate || "日期未定")}</span><button data-clear-area-focus>查看整个行程</button></div>`;
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
  const count = state.savedRoutes.length;
  box.innerHTML = `<span class="route-icon">⇄</span><span><strong>${count ? `已保存 ${count} 条交通路线` : "规划两地交通"}</strong><small>${count ? "查看班次、费用或更换方案" : "公共交通、步行、骑行与驾车方案"}</small></span><button data-open-route-planner aria-label="打开路线规划">›</button>`;
}
function renderAreaCard(area) {
  const selected = area.id === state.selectedAreaId; const expanded = state.expandedAreas.has(area.id);
  const dateLabel = area.startDate ? `${area.startDate}${area.endDate ? ` — ${area.endDate}` : ""}` : "日期未定";
  return `<article class="area-card${selected ? " selected" : ""}" data-area-card="${esc(area.id)}" draggable="true">
    <div class="area-summary"><button class="drag-handle" aria-label="拖动调整顺序">⋮⋮</button><button class="area-main" data-select-area="${esc(area.id)}"><span class="area-title-row"><span class="area-pin">⭐</span><h3>${esc(area.name)}</h3></span><p>${esc(area.address)}</p><span class="area-inline-meta">${esc(dateLabel)}${area.nights ? ` · ${esc(area.nights)} 晚` : ""} · ${area.candidateIds.length} 个地点</span></button><button class="candidate-toggle" data-toggle-area-candidates="${esc(area.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起" : "展开"} ${esc(area.name)} 的候选地点"><span class="chevron">⌄</span></button></div>
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
  return `<article class="candidate-card${item.id === state.selectedCandidateId ? " selected" : ""}" data-candidate-card="${esc(item.id)}"><button class="candidate-card-main" data-focus-candidate="${esc(item.id)}"><span class="type-dot" style="background:${COLORS[item.category]}"></span><span class="candidate-card-copy"><span class="candidate-name-row"><strong>${esc(item.name)}</strong>${area ? `<span class="area-label">${esc(area.name)}</span>` : ""}</span><span class="candidate-meta">${esc(labelCategory(item.category))}${duration ? ` · ${esc(duration)}` : ""}${item.municipality ? ` · ${esc(item.municipality)}` : ""}</span>${summary ? `<span class="candidate-summary">${esc(summary)}</span>` : ""}</span></button><div class="candidate-card-actions">${validCoordinates(item) ? `<button data-plan-route-to-candidate="${esc(item.id)}">路线</button>` : ""}<button data-open-candidate-detail="${esc(item.id)}">详情</button><button class="candidate-quick-add" data-quick-add-candidate="${esc(item.id)}">${area ? "更改地区" : "＋ 加入地区"}</button></div></article>`;
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
function renderAll({ fitMap = false } = {}) {
  renderCounts(); renderTripRouteSummary(); renderAreas(); renderCandidates();
  if (state.view === "routes") renderRoutePlanner(); else renderSavedRoutes();
  renderMap({ fit: fitMap }); updateLayerButtons();
}

function selectArea(id) {
  if (!areaById(id)) return; state.selectedAreaId = id; state.selectedCandidateId = null; state.showAreas = true; state.showCandidates = true;
  saveUserState(); renderAll({ fitMap: true });
}
function clearAreaFocus() { state.selectedAreaId = null; state.selectedCandidateId = null; state.showCandidates = state.view === "candidates"; saveUserState(); renderAll({ fitMap: true }); }
function deleteArea(id) { state.areas = state.areas.filter(area => area.id !== id); if (state.selectedAreaId === id) state.selectedAreaId = null; state.expandedAreas.delete(id); saveUserState(); renderAll({ fitMap: true }); }
function removeCandidateFromArea(areaId, candidateId) { const area = areaById(areaId); if (!area) return; area.candidateIds = area.candidateIds.filter(id => id !== candidateId); saveUserState(); renderAll({ fitMap: true }); }
function updateLayerButtons() { $("toggleAreaLayer").classList.toggle("active", state.showAreas); $("toggleCandidateLayer").classList.toggle("active", state.showCandidates); $("toggleMapLegend").classList.toggle("active", state.legendOpen); }

function pointLiteral(point) {
  const lat = typeof point?.lat === "function" ? point.lat() : point?.lat;
  const lng = typeof point?.lng === "function" ? point.lng() : point?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
function routeWaypoint(endpoint) { return { lat: endpoint.lat, lng: endpoint.lon }; }
function endpointFromArea(area) {
  return { source: "area", sourceId: area.id, placeId: area.placeId, name: area.name, address: area.address, lat: area.lat, lon: area.lon };
}
function endpointFromCandidate(item) {
  return { source: "candidate", sourceId: item.id, placeId: item.location?.provider_place_id || `local-${item.id}`, name: item.name,
    address: [item.municipality,item.region].filter(Boolean).join(" · "), lat: item.location.lat, lon: item.location.lon };
}
function endpointFromSearchPlace(place) {
  return { source: "google", sourceId: place.place_id, placeId: place.place_id, name: place.name_zh,
    address: place.formatted_address || "", lat: place.lat, lon: place.lon };
}
function launchRoutePlanner(endpoint, target = "destination") {
  if (!endpoint || !Number.isFinite(endpoint.lat) || !Number.isFinite(endpoint.lon)) return showToast("这个地点暂时没有可用坐标");
  const previous = state.routeDraft;
  state.activeSavedRouteId = null; state.routeOptions = []; state.routeStatus = "idle"; state.selectedRouteOption = 0; state.routeDetailsOpen = new Set();
  state.routeDraft = { origin: null, destination: null, travelMode: previous.travelMode || "TRANSIT", timeMode: previous.timeMode || "departure",
    dateTime: previous.dateTime || "2026-09-05T09:00", transitModes: [...(previous.transitModes || [])], transitPreference: previous.transitPreference || "" };
  state.routeDraft[target] = structuredClone(endpoint);
  state.searchPreview = null; $("placePreview").hidden = true; clearMapLayer(previewLayer); $("customRoutePanel").hidden = true;
  if ($("detailDialog").open) $("detailDialog").close();
  if (state.nearbyAreaId) closeNearby();
  $("routeTitle").value = ""; $("routeManualCost").value = ""; $("routeNotes").value = ""; syncRouteForm(); switchView("routes");
  const missingTarget = target === "destination" ? "origin" : "destination";
  setTimeout(() => { const input = routeEndpointInput(missingTarget); input.focus(); input.select(); }, 80);
  showToast(`已把“${endpoint.name}”设为${target === "destination" ? "终点" : "起点"}，请选择${target === "destination" ? "出发地" : "目的地"}`);
}
function localRouteEndpointMatches(query) {
  const value = query.trim().toLowerCase(); if (!value) return [];
  const areaRows = state.areas.filter(area => [area.name,area.address].join(" ").toLowerCase().includes(value)).map(endpointFromArea);
  const candidates = state.candidates.filter(item => validCoordinates(item) && searchCandidateText(item).includes(value)).slice(0, 6).map(endpointFromCandidate);
  return [...areaRows,...candidates].slice(0, 8);
}
function routeEndpointInput(target) { return $(target === "origin" ? "routeOriginSearch" : "routeDestinationSearch"); }
function routeEndpointResults(target) { return $(target === "origin" ? "routeOriginResults" : "routeDestinationResults"); }
function renderRouteEndpointResults(target, localRows, predictions = [], apiUnavailable = false) {
  const box = routeEndpointResults(target);
  state.routeSearchPredictions = predictions;
  const localHtml = localRows.map((row,index) => `<button type="button" data-route-local-endpoint="${index}"><span class="route-result-icon">${row.source === "area" ? "⭐" : "●"}</span><span><strong>${esc(row.name)}</strong><small>${esc(row.address || (row.source === "area" ? "行程地区" : "Candidate"))}</small></span><em>${row.source === "area" ? "地区" : "Candidate"}</em></button>`).join("");
  const liveHtml = predictions.map((prediction,index) => `<button type="button" data-route-live-endpoint="${index}"><span class="route-result-icon">⌖</span><span><strong>${esc(prediction.mainText?.toString() || prediction.text.toString())}</strong><small>${esc(prediction.secondaryText?.toString() || "Google Maps")}</small></span><em>Google</em></button>`).join("");
  box.dataset.localRows = JSON.stringify(localRows);
  box.innerHTML = localHtml + liveHtml || `<div class="route-place-empty">${apiUnavailable ? "实时搜索暂不可用，也没有匹配的已收藏地点" : "没有匹配地点"}</div>`;
  box.hidden = false;
}
async function searchRouteEndpoint(target) {
  const input = routeEndpointInput(target); const query = input.value.trim(); const box = routeEndpointResults(target);
  if (!query) { box.hidden = true; return; }
  const localRows = localRouteEndpointMatches(query);
  if (!state.placesReady || mapProvider !== "google") return renderRouteEndpointResults(target, localRows, [], true);
  const requestId = ++state.routeSearchRequestId;
  renderRouteEndpointResults(target, localRows, []);
  try {
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary("places");
    if (!state.routeSearchSessionToken || state.routeSearchTarget !== target) state.routeSearchSessionToken = new AutocompleteSessionToken();
    state.routeSearchTarget = target;
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, sessionToken: state.routeSearchSessionToken, language: "zh-CN", region: "jp" });
    if (requestId !== state.routeSearchRequestId || input.value.trim() !== query) return;
    renderRouteEndpointResults(target, localRows, suggestions.map(item => item.placePrediction).filter(Boolean).slice(0, 7));
  } catch (error) {
    console.warn("Route endpoint autocomplete unavailable:", error?.message || error);
    if (requestId === state.routeSearchRequestId) renderRouteEndpointResults(target, localRows, [], true);
  }
}
function scheduleRouteEndpointSearch(target) {
  clearTimeout(routeSearchTimer); state.routeSearchRequestId += 1;
  state.routeDraft[target] = null; state.routeOptions = []; state.routeStatus = "idle";
  renderRoutePlanner(); renderMap();
  routeSearchTimer = setTimeout(() => void searchRouteEndpoint(target), 260);
}
function chooseLocalRouteEndpoint(target, index) {
  const box = routeEndpointResults(target); const rows = JSON.parse(box.dataset.localRows || "[]"); const endpoint = rows[index]; if (!endpoint) return;
  setRouteEndpoint(target, endpoint);
}
async function chooseLiveRouteEndpoint(target, index) {
  const prediction = state.routeSearchPredictions[index]; if (!prediction) return;
  const box = routeEndpointResults(target); box.innerHTML = '<div class="route-place-empty">正在确认地点…</div>';
  try {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ["id","displayName","formattedAddress","location"] });
    if (!place.location) throw new Error("missing location");
    setRouteEndpoint(target, { source: "google", sourceId: place.id, placeId: place.id,
      name: place.displayName || prediction.mainText?.toString() || prediction.text.toString(),
      address: place.formattedAddress || prediction.secondaryText?.toString() || "",
      lat: place.location.lat(), lon: place.location.lng() });
    state.routeSearchSessionToken = null;
  } catch (_) { box.innerHTML = '<div class="route-place-empty">无法读取这个地点，请重新搜索</div>'; }
}
function setRouteEndpoint(target, endpoint) {
  state.routeDraft[target] = endpoint; routeEndpointInput(target).value = endpoint.name; routeEndpointResults(target).hidden = true;
  state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap({ fit: true });
}
function clearRouteEndpoint(target) {
  state.routeDraft[target] = null; routeEndpointInput(target).value = ""; routeEndpointResults(target).hidden = true;
  state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap();
}
function swapRouteEndpoints() {
  const origin = state.routeDraft.origin; state.routeDraft.origin = state.routeDraft.destination; state.routeDraft.destination = origin;
  routeEndpointInput("origin").value = state.routeDraft.origin?.name || ""; routeEndpointInput("destination").value = state.routeDraft.destination?.name || "";
  state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap({ fit: true });
}
function valueText(value) {
  if (value == null) return ""; if (typeof value === "string" || typeof value === "number") return String(value);
  return value.text || value.localizedText || (typeof value.toString === "function" && value.toString() !== "[object Object]" ? value.toString() : "");
}
function dateISO(value) {
  if (!value) return ""; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
function timeLabel(value) {
  if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(date);
}
function moneyText(money) {
  if (!money) return ""; const localized = valueText(money); if (localized) return localized;
  const units = Number(money.units || 0) + Number(money.nanos || 0) / 1e9;
  if (!money.currencyCode && !units) return "";
  try { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: money.currencyCode || "JPY", maximumFractionDigits: 0 }).format(units); } catch (_) { return `${money.currencyCode || ""} ${units}`.trim(); }
}
function transitSegmentFromStep(step) {
  const detail = step.transitDetails; if (!detail) return null; const line = detail.transitLine || {}; const vehicle = line.vehicle || {};
  return {
    mode: vehicle.vehicleType || "TRANSIT", vehicle: vehicle.name || TRANSIT_MODE_LABELS[vehicle.vehicleType] || "公共交通",
    line: line.shortName || line.name || detail.tripShortText || "公共交通", lineName: line.name || "", color: line.color || "#1a73e8",
    departureStop: detail.departureStop?.name || "", arrivalStop: detail.arrivalStop?.name || "", headsign: detail.headsign || "",
    departureTime: dateISO(detail.departureTime), arrivalTime: dateISO(detail.arrivalTime), stopCount: detail.stopCount || 0,
    headwayMillis: detail.headwayMillis || 0, agencies: (line.agencies || []).map(agency => agency.name).filter(Boolean),
    durationMillis: step.staticDurationMillis || 0,
  };
}
function serializeRouteOption(route, index) {
  const steps = (route.legs || []).flatMap(leg => leg.steps || []); const segments = steps.map(transitSegmentFromStep).filter(Boolean);
  const walkingMillis = steps.filter(step => String(step.travelMode) === "WALKING").reduce((sum,step) => sum + (step.staticDurationMillis || 0), 0);
  const fare = valueText(route.localizedValues?.transitFare) || moneyText(route.travelAdvisory?.transitFare);
  const tolls = (route.travelAdvisory?.tollInfo?.estimatedPrices || []).map(moneyText).filter(Boolean).join(" / ");
  return {
    index, description: route.description || "", distanceMeters: route.distanceMeters || 0, durationMillis: route.durationMillis || 0,
    durationText: valueText(route.localizedValues?.duration), distanceText: valueText(route.localizedValues?.distance),
    fare: fare || tolls || "", path: (route.path || []).map(pointLiteral).filter(Boolean), segments, walkingMillis,
    transfers: Math.max(0, segments.length - 1), departureTime: segments[0]?.departureTime || "", arrivalTime: segments.at(-1)?.arrivalTime || "",
    warnings: (route.warnings || []).map(valueText).filter(Boolean),
  };
}
function durationMillis(value) {
  if (Number.isFinite(value)) return value; const seconds = Number.parseFloat(String(value || "").replace(/s$/, "")); return Number.isFinite(seconds) ? seconds * 1000 : 0;
}
function restTransitSegment(step) {
  const detail = step.transitDetails; if (!detail) return null; const stops = detail.stopDetails || {}; const line = detail.transitLine || {}; const vehicle = line.vehicle || {};
  return { mode: vehicle.type || "TRANSIT", vehicle: valueText(vehicle.name) || TRANSIT_MODE_LABELS[vehicle.type] || "公共交通",
    line: line.nameShort || line.name || detail.tripShortText || "公共交通", lineName: line.name || "", color: line.color || "#1a73e8",
    departureStop: stops.departureStop?.name || "", arrivalStop: stops.arrivalStop?.name || "", headsign: detail.headsign || "",
    departureTime: stops.departureTime || "", arrivalTime: stops.arrivalTime || "", stopCount: detail.stopCount || 0,
    headwayMillis: durationMillis(detail.headway), agencies: (line.agencies || []).map(agency => agency.name).filter(Boolean), durationMillis: durationMillis(step.staticDuration) };
}
function serializeRestRouteOption(route, index) {
  const steps = (route.legs || []).flatMap(leg => leg.steps || []); const segments = steps.map(restTransitSegment).filter(Boolean);
  const coordinates = route.polyline?.geoJsonLinestring?.coordinates || [];
  const walkingMillis = steps.filter(step => ["WALK","WALKING"].includes(step.travelMode)).reduce((sum,step) => sum + durationMillis(step.staticDuration), 0);
  return { index, description: route.description || "", distanceMeters: route.distanceMeters || 0, durationMillis: durationMillis(route.duration),
    durationText: valueText(route.localizedValues?.duration), distanceText: valueText(route.localizedValues?.distance),
    fare: valueText(route.localizedValues?.transitFare) || moneyText(route.travelAdvisory?.transitFare),
    path: coordinates.map(point => ({ lat: Number(point[1]), lng: Number(point[0]) })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    segments, walkingMillis, transfers: Math.max(0,segments.length - 1), departureTime: segments[0]?.departureTime || "", arrivalTime: segments.at(-1)?.arrivalTime || "",
    warnings: (route.warnings || []).filter(Boolean) };
}
function navitimeShapePath(shapes) {
  const points = [];
  const collect = coordinates => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))) {
      points.push({ lat: Number(coordinates[1]), lng: Number(coordinates[0]) }); return;
    }
    coordinates.forEach(collect);
  };
  (shapes?.features || []).forEach(feature => collect(feature?.geometry?.coordinates));
  return points.filter((point,index) => !index || point.lat !== points[index - 1].lat || point.lng !== points[index - 1].lng);
}
function navitimeFareText(move) {
  const reference = move?.reference_fare || {};
  const amount = Number(reference.lowest_total_ic ?? reference.lowest_total_ticket ?? move?.fare?.unit_48 ?? move?.fare?.unit_0);
  return Number.isFinite(amount) ? new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(amount) : "";
}
function navitimeCallingStops(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}
function navitimeSegment(section, sections, index) {
  if (section.type !== "move" || section.move === "walk" || !section.transport) return null;
  const transport = section.transport || {};
  const before = [...sections.slice(0,index)].reverse().find(item => item.type === "point") || {};
  const after = sections.slice(index + 1).find(item => item.type === "point") || {};
  const callingStops = navitimeCallingStops(transport.calling_at);
  const destination = transport.destination || transport.links?.[0]?.destination || {};
  const moveLabel = NAVITIME_MOVE_LABELS[section.move] || transport.type || "公共交通";
  return {
    mode: section.move === "shuttle_bus" ? "BUS" : (section.move === "domestic_flight" ? "AIRPLANE" : "RAIL"),
    vehicle: moveLabel, line: transport.self_name || section.line_name || transport.name || moveLabel,
    lineName: transport.name || section.line_name || "", color: /^#[0-9a-f]{6}$/i.test(transport.color || "") ? transport.color : "#0068b7",
    departureStop: before.name || "", arrivalStop: after.name || "", headsign: destination.name || "",
    departureTime: section.from_time || "", arrivalTime: section.to_time || "", stopCount: callingStops.length,
    headwayMillis: 0, agencies: [transport.company?.name].filter(Boolean), durationMillis: Number(section.time || 0) * 60000,
  };
}
function serializeNavitimeRouteOption(route,index) {
  const summary = route.summary?.move || {}; const sections = route.sections || [];
  const segments = sections.map((section,sectionIndex) => navitimeSegment(section,sections,sectionIndex)).filter(Boolean);
  const walkingMillis = sections.filter(section => section.type === "move" && section.move === "walk").reduce((sum,section) => sum + Number(section.time || 0) * 60000,0);
  const duration = Number(summary.time || 0) * 60000; const distance = Number(summary.distance || 0);
  return {
    index, provider: "navitime", travelMode: "TRANSIT", description: segments.map(segment => segment.line).join(" → "),
    distanceMeters: distance, durationMillis: duration, durationText: duration ? compactDuration(duration) : "",
    distanceText: distance ? compactDistance(distance) : "", fare: navitimeFareText(summary), path: navitimeShapePath(route.shapes),
    segments, walkingMillis, transfers: Number.isFinite(Number(summary.transit_count)) ? Number(summary.transit_count) : Math.max(0,segments.length - 1),
    departureTime: summary.from_time || segments[0]?.departureTime || "", arrivalTime: summary.to_time || segments.at(-1)?.arrivalTime || "", warnings: [],
  };
}
async function computeNavitimeTransitRoutes(origin,destination) {
  const apiKey = navitimeApiKey(); if (!apiKey) throw new Error("NAVITIME_KEY_REQUIRED");
  const params = new URLSearchParams({
    start: `${origin.lat},${origin.lon}`, goal: `${destination.lat},${destination.lon}`,
    [state.routeDraft.timeMode === "arrival" ? "goal_time" : "start_time"]: `${state.routeDraft.dateTime}:00`,
    datum: "wgs84", coord_unit: "degree", term: "1440", limit: "5", shape: "true", options: "railway_calling_at",
    order: state.routeDraft.transitPreference === "FEWER_TRANSFERS" ? "transit" : (state.routeDraft.transitPreference === "LESS_WALKING" ? "walk_distance" : "time_optimized"),
  });
  const selectedMode = state.routeDraft.transitModes[0];
  if (selectedMode === "RAIL") params.set("unuse", "domestic_flight.shuttle_bus");
  if (selectedMode === "BUS") params.set("unuse", "domestic_flight.superexpress_train.sleeper_ultraexpress.ultraexpress_train.express_train.rapid_train.semiexpress_train.local_train");
  const response = await fetch(`https://${NAVITIME_HOST}/route_transit?${params}`, { headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": NAVITIME_HOST, Accept: "application/json" } });
  updateNavitimeQuota(response);
  let payload = {}; try { payload = await response.json(); } catch (_) { /* handled by status below */ }
  if (!response.ok) {
    if ([401,403].includes(response.status)) throw new Error("NAVITIME_KEY_INVALID");
    if (response.status === 429) throw new Error("NAVITIME_QUOTA_EXHAUSTED");
    throw new Error(payload?.message || payload?.error?.message || `NAVITIME_HTTP_${response.status}`);
  }
  return (payload.items || []).map(serializeNavitimeRouteOption).filter(option => option.durationMillis || option.segments.length);
}
async function computeTransitRoutesREST(origin,destination,time) {
  const apiKey = window.GOOGLE_MAPS_CONFIG?.apiKey; if (!apiKey) return [];
  const body = { origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } }, travelMode: "TRANSIT",
    computeAlternativeRoutes: true, languageCode: "zh-CN", regionCode: "JP", units: "METRIC", polylineQuality: "OVERVIEW", polylineEncoding: "GEO_JSON_LINESTRING" };
  if (time) body[state.routeDraft.timeMode === "arrival" ? "arrivalTime" : "departureTime"] = time.toISOString();
  const transitPreferences = {}; if (state.routeDraft.transitModes.length) transitPreferences.allowedTravelModes = state.routeDraft.transitModes;
  if (state.routeDraft.transitPreference) transitPreferences.routingPreference = state.routeDraft.transitPreference;
  if (Object.keys(transitPreferences).length) body.transitPreferences = transitPreferences;
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", { method: "POST", headers: {
    "Content-Type": "application/json", "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.geoJsonLinestring,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails,routes.localizedValues,routes.travelAdvisory.transitFare,routes.warnings",
  }, body: JSON.stringify(body) });
  const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || `Routes HTTP ${response.status}`);
  return (payload.routes || []).map(serializeRestRouteOption);
}
function legacyTransitSegment(step) {
  const detail = step.transit; if (!detail) return null; const line = detail.line || {}; const vehicle = line.vehicle || {};
  return { mode: vehicle.type || "TRANSIT", vehicle: vehicle.name || TRANSIT_MODE_LABELS[vehicle.type] || "公共交通",
    line: line.short_name || line.name || "公共交通", lineName: line.name || "", color: line.color || "#1a73e8",
    departureStop: detail.departure_stop?.name || "", arrivalStop: detail.arrival_stop?.name || "", headsign: detail.headsign || "",
    departureTime: dateISO(detail.departure_time?.value || detail.departure_time?.time), arrivalTime: dateISO(detail.arrival_time?.value || detail.arrival_time?.time),
    stopCount: detail.num_stops || 0, headwayMillis: (detail.headway || 0) * 1000,
    agencies: (line.agencies || []).map(agency => agency.name).filter(Boolean), durationMillis: (step.duration?.value || 0) * 1000 };
}
function serializeLegacyRouteOption(route,index) {
  const legs = route.legs || []; const steps = legs.flatMap(leg => leg.steps || []); const segments = steps.map(legacyTransitSegment).filter(Boolean);
  const durationSeconds = legs.reduce((sum,leg) => sum + (leg.duration?.value || 0), 0); const distanceMeters = legs.reduce((sum,leg) => sum + (leg.distance?.value || 0), 0);
  const walkingMillis = steps.filter(step => String(step.travel_mode) === "WALKING").reduce((sum,step) => sum + (step.duration?.value || 0) * 1000, 0);
  return { index, description: route.summary || "", distanceMeters, durationMillis: durationSeconds * 1000,
    durationText: legs.map(leg => leg.duration?.text).filter(Boolean).join(" + "), distanceText: legs.map(leg => leg.distance?.text).filter(Boolean).join(" + "),
    fare: route.fare?.text || "", path: (route.overview_path || []).map(pointLiteral).filter(Boolean), segments, walkingMillis,
    transfers: Math.max(0,segments.length - 1), departureTime: segments[0]?.departureTime || "", arrivalTime: segments.at(-1)?.arrivalTime || "",
    warnings: (route.warnings || []).filter(Boolean) };
}
async function computeTransitDirectionsLegacy(origin,destination,time) {
  const { DirectionsService } = await google.maps.importLibrary("routes"); if (!DirectionsService) return [];
  const transitOptions = {}; if (time) transitOptions[state.routeDraft.timeMode === "arrival" ? "arrivalTime" : "departureTime"] = time;
  if (state.routeDraft.transitModes.length) transitOptions.modes = state.routeDraft.transitModes;
  if (state.routeDraft.transitPreference) transitOptions.routingPreference = state.routeDraft.transitPreference;
  const result = await new DirectionsService().route({ origin: routeWaypoint(origin), destination: routeWaypoint(destination), travelMode: "TRANSIT",
    provideRouteAlternatives: true, transitOptions, unitSystem: google.maps.UnitSystem.METRIC, region: "JP" });
  return (result.routes || []).map(serializeLegacyRouteOption);
}
function japanDateFromInput(value) {
  if (!value) return null; const date = new Date(`${value.length === 16 ? value + ":00" : value}+09:00`); return Number.isNaN(date.getTime()) ? null : date;
}
function japanInputFromDate(date) { return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0,16); }
function routeRequestDate() { return japanDateFromInput(state.routeDraft.dateTime); }
async function searchRoutes() {
  const { origin,destination,travelMode } = state.routeDraft;
  if (!origin || !destination) { state.routeStatus = "error"; renderRoutePlanner("请先选择明确的起点和终点"); return; }
  const requestId = ++state.routeRequestId; state.routeStatus = "loading"; state.routeOptions = []; renderRoutePlanner();
  if (travelMode === "TRANSIT") {
    if (!navitimeApiKey()) {
      state.routeStatus = "error"; openNavitimeSettings(); renderRoutePlanner("请先连接 NAVITIME 免费额度，再搜索公共交通"); return;
    }
    try {
      state.routeOptions = await computeNavitimeTransitRoutes(origin,destination);
      if (requestId !== state.routeRequestId) return;
      if (state.routeOptions.length) {
        state.selectedRouteOption = 0; state.routeStatus = "ready"; state.routeDetailsOpen = new Set();
        renderRoutePlanner(); renderMap({ fit: true }); return;
      }
    } catch (navitimeError) {
      const code = navitimeError?.message || String(navitimeError);
      console.warn("NAVITIME route search unavailable:", code);
      if (requestId !== state.routeRequestId) return;
      if (code === "NAVITIME_KEY_INVALID") {
        state.routeStatus = "error"; openNavitimeSettings(); renderRoutePlanner("NAVITIME Key 无效或尚未启用 Route(totalnavi) Basic"); return;
      }
      if (code === "NAVITIME_QUOTA_EXHAUSTED") {
        state.routeStatus = "error"; renderRoutePlanner("NAVITIME 本月 500 次免费额度已用完"); return;
      }
    }
  }
  if (mapProvider !== "google") { state.routeStatus = "error"; renderRoutePlanner(travelMode === "TRANSIT" ? "NAVITIME 没有返回路线，Google 回退服务也暂不可用" : "Google 路线服务暂不可用，请稍后重试"); return; }
  try {
    const { Route } = await google.maps.importLibrary("routes");
    const request = { origin: routeWaypoint(origin), destination: routeWaypoint(destination), travelMode,
      computeAlternativeRoutes: true, language: "zh-CN", region: "JP", fields: ["path","legs","distanceMeters","durationMillis","localizedValues","travelAdvisory","description","warnings"] };
    const time = routeRequestDate();
    if (travelMode === "TRANSIT") {
      if (time) request[state.routeDraft.timeMode === "arrival" ? "arrivalTime" : "departureTime"] = time;
      const transitPreference = {};
      if (state.routeDraft.transitModes.length) transitPreference.allowedTransitModes = state.routeDraft.transitModes;
      if (state.routeDraft.transitPreference) transitPreference.routingPreference = state.routeDraft.transitPreference;
      if (Object.keys(transitPreference).length) request.transitPreference = transitPreference;
    } else if (travelMode === "DRIVING") {
      request.routingPreference = "TRAFFIC_AWARE"; if (time) request.departureTime = time;
    }
    let { routes } = await Route.computeRoutes(request);
    if (travelMode === "TRANSIT" && !routes?.length && request.computeAlternativeRoutes) {
      request.computeAlternativeRoutes = false;
      ({ routes } = await Route.computeRoutes(request));
    }
    if (requestId !== state.routeRequestId) return;
    state.routeOptions = (routes || []).map(serializeRouteOption);
    if (travelMode === "TRANSIT" && !state.routeOptions.length) {
      try { state.routeOptions = await computeTransitRoutesREST(origin,destination,time); }
      catch (restError) { console.warn("Transit REST fallback unavailable:", restError?.message || restError); }
      if (!state.routeOptions.length) {
        try { state.routeOptions = await computeTransitDirectionsLegacy(origin,destination,time); }
        catch (legacyError) { console.warn("Transit Directions fallback unavailable:", legacyError?.message || legacyError); }
      }
    }
    state.selectedRouteOption = 0;
    state.routeStatus = state.routeOptions.length ? "ready" : "empty"; state.routeDetailsOpen = new Set();
  } catch (error) {
    console.warn("Route search unavailable:", error?.message || error);
    if (requestId !== state.routeRequestId) return;
    state.routeOptions = []; state.routeStatus = "error";
  }
  renderRoutePlanner(); renderMap({ fit: true });
}
function selectRouteOption(index, { fit = false } = {}) { if (!state.routeOptions[index]) return; state.selectedRouteOption = index; renderRoutePlanner(); renderMap({ fit }); }
function routeSequence(option) { return option.segments.length ? option.segments.map(segment => segment.line).join(" → ") : ROUTE_MODES[option.travelMode || state.routeDraft.travelMode]?.label || "路线"; }
function renderTransitTimeline(option) {
  if (!option.segments.length) return `<div class="route-no-segments">${state.routeDraft.travelMode === "TRANSIT" ? `${option.provider === "navitime" ? "NAVITIME" : "Google"} 未提供分段班次资料` : "选择路线后会在地图上高亮完整路径"}</div>`;
  return `<div class="transit-timeline">${option.segments.map(segment => `<div class="transit-segment"><span class="segment-line" style="background:${esc(segment.color)}">${esc(segment.line)}</span><div><strong>${esc(timeLabel(segment.departureTime))} ${esc(segment.departureStop)}</strong><p>${esc(segment.vehicle)}${segment.headsign ? ` · 开往 ${esc(segment.headsign)}` : ""}${segment.stopCount ? ` · ${esc(segment.stopCount)} 站` : ""}</p><small>${esc(timeLabel(segment.arrivalTime))} 到达 ${esc(segment.arrivalStop)}${segment.headwayMillis ? ` · 约每 ${esc(compactDuration(segment.headwayMillis))} 一班` : ""}${segment.agencies.length ? ` · ${esc(segment.agencies.join(" / "))}` : ""}</small></div></div>`).join("")}</div>`;
}
function renderRouteOption(option,index) {
  const selected = index === state.selectedRouteOption; const expanded = state.routeDetailsOpen.has(index);
  const optionMode = option.travelMode || state.routeDraft.travelMode; const mode = ROUTE_MODES[optionMode] || ROUTE_MODES.TRANSIT;
  const isNavitime = option.provider === "navitime";
  const optionLabel = option.custom ? `${routeSequence(option)} · 自定义` : (isNavitime ? routeSequence(option) : `${mode.label}方案 ${index + 1}`);
  return `<article class="route-option${selected ? " selected" : ""}${option.custom ? " custom" : ""}${isNavitime ? " navitime" : ""}" data-route-option-card="${index}"><button class="route-option-main" type="button" data-select-route-option="${index}"><span class="route-radio">${selected ? "●" : "○"}</span><span class="route-option-copy"><span class="route-option-times"><strong>${esc(option.durationText || compactDuration(option.durationMillis))}</strong>${option.departureTime && option.arrivalTime ? `<b>${esc(timeLabel(option.departureTime).split(" ").at(-1))}—${esc(timeLabel(option.arrivalTime).split(" ").at(-1))}</b>` : ""}</span><span class="route-sequence">${esc(optionLabel)}</span>${isNavitime ? '<em class="route-provider-tag">NAVITIME 免费版</em>' : ""}<span class="route-metrics"><em>${mode.icon} ${esc(mode.label)}</em><em>${option.distanceText || compactDistance(option.distanceMeters)}</em>${optionMode === "TRANSIT" ? `<em>${option.transfers} 次换乘</em><em>${option.walkingMillis ? `步行 ${esc(compactDuration(option.walkingMillis))}` : "少量步行"}</em>` : ""}</span></span><span class="route-fare ${option.fare ? "" : "missing"}">${esc(option.fare || (optionMode === "WALKING" || optionMode === "BICYCLING" ? "免费" : "费用未提供"))}</span></button><button class="route-detail-toggle" type="button" data-toggle-route-details="${index}" aria-expanded="${expanded}">${expanded ? "收起班次并返回地图" : "班次详情"}</button>${expanded ? `<div class="route-option-details">${renderTransitTimeline(option)}${option.custom && option.customStops ? `<p class="custom-stops"><strong>经停：</strong>${esc(option.customStops)}</p>` : ""}${option.custom && option.frequency ? `<p class="custom-stops"><strong>班次：</strong>${esc(option.frequency)}</p>` : ""}${option.warnings.length ? `<p class="route-warning">${esc(option.warnings.join("；"))}</p>` : ""}</div>` : ""}</article>`;
}
function straightLineDistance(a,b) {
  const radians = value => value * Math.PI / 180; const earth = 6371000;
  const dLat = radians(b.lat - a.lat); const dLon = radians(b.lon - a.lon); const lat1 = radians(a.lat); const lat2 = radians(b.lat);
  const value = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
}
function addCustomRouteOption() {
  const { origin,destination } = state.routeDraft; const name = $("customRouteName").value.trim();
  if (!origin || !destination) return renderRoutePlanner("请先选择自定义路线的起点和终点");
  if (!name) return renderRoutePlanner("请填写运营方或线路名称");
  const departure = japanDateFromInput($("customDepartureTime").value); const arrival = japanDateFromInput($("customArrivalTime").value);
  if (!departure || !arrival || arrival <= departure) return renderRoutePlanner("自定义路线的到达时间必须晚于出发时间");
  const customType = $("customRouteType").value; const vehicleLabels = { TOUR_BUS: "观光巴士", BUS: "巴士", TRAIN: "列车", FERRY: "渡轮", SHUTTLE: "接驳车", CHARTER: "包车", OTHER: "其他交通" };
  const durationMillis = arrival.getTime() - departure.getTime();
  const option = { index: state.routeOptions.length, custom: true, travelMode: "CUSTOM", customType, description: name,
    distanceMeters: straightLineDistance(origin,destination), distanceText: "地图示意线", durationMillis, durationText: compactDuration(durationMillis),
    fare: $("customRouteCost").value.trim(), path: [{ lat: origin.lat, lng: origin.lon },{ lat: destination.lat, lng: destination.lon }], walkingMillis: 0,
    transfers: 0, departureTime: departure.toISOString(), arrivalTime: arrival.toISOString(), frequency: $("customFrequency").value.trim(),
    customStops: $("customStops").value.trim(), warnings: [$("customRouteNotes").value.trim()].filter(Boolean),
    segments: [{ mode: customType, vehicle: vehicleLabels[customType], line: name, lineName: name, color: "#7b61a8",
      departureStop: origin.name, arrivalStop: destination.name, headsign: destination.name, departureTime: departure.toISOString(), arrivalTime: arrival.toISOString(),
      stopCount: 0, headwayMillis: 0, agencies: [], durationMillis }],
  };
  state.routeOptions.push(option); state.selectedRouteOption = option.index; state.routeStatus = "ready";
  $("customRoutePanel").hidden = true; renderRoutePlanner();
  $("routeTitle").value = name; $("routeManualCost").value = option.fare; $("routeNotes").value = option.warnings[0] || "";
  renderMap({ fit: true }); showToast("自定义路线已加入对比，请确认后保存");
}
function openCustomRouteEditor() {
  const option = currentRouteOption();
  if (option?.custom) {
    $("customRouteName").value = option.description || option.segments?.[0]?.line || "";
    $("customRouteType").value = option.customType || "TOUR_BUS";
    $("customRouteCost").value = option.fare || "";
    $("customDepartureTime").value = option.departureTime ? japanInputFromDate(new Date(option.departureTime)) : state.routeDraft.dateTime;
    $("customArrivalTime").value = option.arrivalTime ? japanInputFromDate(new Date(option.arrivalTime)) : state.routeDraft.dateTime;
    $("customFrequency").value = option.frequency || "";
    $("customStops").value = option.customStops || "";
    $("customRouteNotes").value = option.warnings?.[0] || "";
  } else if (!$("customDepartureTime").value) {
    $("customDepartureTime").value = state.routeDraft.dateTime;
  }
  $("customRoutePanel").hidden = false; $("customRouteName").focus();
}
function startBlankCustomRouteRecord() {
  $("customRouteName").value = ""; $("customRouteType").value = "TRAIN"; $("customRouteCost").value = "";
  $("customDepartureTime").value = state.routeDraft.dateTime; $("customArrivalTime").value = "";
  $("customFrequency").value = ""; $("customStops").value = ""; $("customRouteNotes").value = "";
  $("customRoutePanel").hidden = false; $("customRouteName").focus();
}
function renderSavedRoutes() {
  $("savedRouteCount").textContent = state.savedRoutes.length; $("savedRoutesHint").textContent = `${state.savedRoutes.length} 条`;
  $("savedRoutesList").innerHTML = state.savedRoutes.length ? state.savedRoutes.map(route => {
    const active = route.id === state.activeSavedRouteId; const option = route.selectedOption; const mode = ROUTE_MODES[option.travelMode || route.travelMode] || ROUTE_MODES.TRANSIT;
    return `<article class="saved-route-card${active ? " active" : ""}"><button type="button" data-open-saved-route="${esc(route.id)}"><span class="saved-route-icon">${mode.icon}</span><span><strong>${esc(route.title)}</strong><small>${esc(route.origin.name)} → ${esc(route.destination.name)}</small><em>${esc(option.durationText || compactDuration(option.durationMillis))}${option.departureTime ? ` · ${esc(timeLabel(option.departureTime))}` : ""} · ${esc(route.manualCost || option.fare || "费用未提供")}</em></span></button><button type="button" class="delete-saved-route" data-delete-saved-route="${esc(route.id)}" aria-label="删除 ${esc(route.title)}">×</button></article>`;
  }).join("") : '<div class="saved-route-empty">还没有保存路线。搜索并选择方案后，它会留在地图上。</div>';
}
function renderRoutePlanner(message = "") {
  document.body.classList.toggle("route-details-visible", state.view === "routes" && state.routeDetailsOpen.size > 0);
  renderNavitimeConnection();
  const isTransitMode = state.routeDraft.travelMode === "TRANSIT";
  $("navitimeConnection").hidden = !isTransitMode; $("navitimeQuota").hidden = !isTransitMode; if (!isTransitMode) $("navitimeSettings").hidden = true;
  document.querySelectorAll("[data-route-mode]").forEach(button => button.classList.toggle("active", button.dataset.routeMode === state.routeDraft.travelMode));
  document.querySelectorAll("[data-transit-mode]").forEach(button => button.classList.toggle("active", button.dataset.transitMode === (state.routeDraft.transitModes[0] || "")));
  $("transitFilters").hidden = !isTransitMode;
  $("routeTimeMode").querySelector('option[value="arrival"]').disabled = state.routeDraft.travelMode !== "TRANSIT";
  $("routeTimeMode").disabled = state.routeDraft.travelMode === "WALKING" || state.routeDraft.travelMode === "BICYCLING";
  $("routeDateTime").disabled = state.routeDraft.travelMode === "WALKING" || state.routeDraft.travelMode === "BICYCLING";
  $("searchRoutes").textContent = state.routeDraft.travelMode === "TRANSIT" ? "搜索 NAVITIME 路线" : "搜索 Google 路线";
  if (state.routeStatus === "loading") $("routeSearchStatus").innerHTML = '<span class="route-spinner"></span><strong>正在比较可用路线与班次…</strong>';
  else if (message) $("routeSearchStatus").innerHTML = `<strong>${esc(message)}</strong>`;
  else if (state.routeStatus === "error") $("routeSearchStatus").innerHTML = '<strong>暂时无法取得路线，请检查地点或时间后重试</strong>';
  else if (state.routeStatus === "empty" && state.routeDraft.travelMode === "TRANSIT") $("routeSearchStatus").innerHTML = '<strong>NAVITIME 与 Google 都没有返回这段公共交通</strong><small>免费版不含地方巴士、高速巴士和轮渡，可用“自定义路线”记录。</small>';
  else if (state.routeStatus === "empty") $("routeSearchStatus").innerHTML = '<strong>这个时间没有找到可用路线，请调整地点或时间</strong>';
  else if (state.routeOptions.length) {
    const provider = state.routeOptions.some(option => option.provider === "navitime") ? "NAVITIME" : (state.routeOptions.every(option => option.custom) ? "自定义" : "Google");
    $("routeSearchStatus").innerHTML = `<strong>${provider} 找到 ${state.routeOptions.length} 个方案 · 点击卡片即可在地图比较</strong><small>${provider === "NAVITIME" ? "免费版结果仅供当次查看" : "票价以运营方最终公布为准"}</small>`;
  }
  else $("routeSearchStatus").innerHTML = "";
  $("routeResults").innerHTML = state.routeOptions.map(renderRouteOption).join("");
  const showShift = state.routeDraft.travelMode === "TRANSIT" && ["ready","empty"].includes(state.routeStatus);
  $("routeTimeShift").hidden = !showShift; $("routeTimeShiftLabel").textContent = state.routeDraft.timeMode === "arrival" ? "按到达时间" : "按出发时间";
  const option = currentRouteOption(); const navitimeOption = option?.provider === "navitime";
  $("routeSavePanel").hidden = !option || navitimeOption; $("navitimeSaveNotice").hidden = !navitimeOption;
  $("toggleCustomRoute").textContent = option?.custom && state.activeSavedRouteId ? "✎ 编辑自定义路线" : "＋ 自定义路线";
  if (option) {
    const active = routeById(state.activeSavedRouteId); $("saveSelectedRoute").textContent = active ? "更新已保存路线" : "保存到地图和行程";
    if (!$("routeTitle").value || active) $("routeTitle").value = active?.title || `${state.routeDraft.origin?.name || "起点"} → ${state.routeDraft.destination?.name || "终点"}`;
    if (active) { $("routeManualCost").value = active.manualCost || ""; $("routeNotes").value = active.notes || ""; }
  }
  renderSavedRoutes();
}
function saveSelectedRoute() {
  const option = currentRouteOption(); if (!option) return;
  if (option.provider === "navitime") return showToast("NAVITIME 免费版结果不能直接保存，请手动记录为自定义路线");
  const existing = routeById(state.activeSavedRouteId); const id = existing?.id || `route-${Date.now()}`;
  const saved = { id, title: $("routeTitle").value.trim() || `${state.routeDraft.origin.name} → ${state.routeDraft.destination.name}`,
    origin: structuredClone(state.routeDraft.origin), destination: structuredClone(state.routeDraft.destination), travelMode: option.travelMode || state.routeDraft.travelMode, queryTravelMode: state.routeDraft.travelMode,
    timeMode: state.routeDraft.timeMode, dateTime: state.routeDraft.dateTime, transitModes: [...state.routeDraft.transitModes],
    transitPreference: state.routeDraft.transitPreference, manualCost: $("routeManualCost").value.trim(), notes: $("routeNotes").value.trim(),
    selectedOption: structuredClone(option), updatedAt: new Date().toISOString() };
  if (existing) state.savedRoutes[state.savedRoutes.findIndex(route => route.id === id)] = saved; else state.savedRoutes.push(saved);
  state.activeSavedRouteId = id; saveUserState(); renderAll(); showToast(existing ? "已更新路线" : "路线已保存到地图和行程");
}
function activateSavedRoute(id) {
  const route = routeById(id); if (!route) return;
  state.activeSavedRouteId = id; state.routeDraft = { origin: structuredClone(route.origin), destination: structuredClone(route.destination), travelMode: route.queryTravelMode || (route.travelMode === "CUSTOM" ? "TRANSIT" : route.travelMode),
    timeMode: route.timeMode || "departure", dateTime: route.dateTime || "2026-09-05T09:00", transitModes: [...(route.transitModes || [])], transitPreference: route.transitPreference || "" };
  state.routeOptions = [structuredClone(route.selectedOption)]; state.selectedRouteOption = 0; state.routeStatus = "ready"; state.routeDetailsOpen = new Set();
  switchView("routes"); syncRouteForm(); $("routeTitle").value = route.title; $("routeManualCost").value = route.manualCost || ""; $("routeNotes").value = route.notes || "";
  renderRoutePlanner(); renderMap({ fit: true });
}
function deleteSavedRoute(id) {
  state.savedRoutes = state.savedRoutes.filter(route => route.id !== id); if (state.activeSavedRouteId === id) newRoutePlan();
  saveUserState(); renderAll(); showToast("已删除路线");
}
function syncRouteForm() {
  $("routeOriginSearch").value = state.routeDraft.origin?.name || ""; $("routeDestinationSearch").value = state.routeDraft.destination?.name || "";
  $("routeTimeMode").value = state.routeDraft.timeMode; $("routeDateTime").value = state.routeDraft.dateTime; $("transitPreference").value = state.routeDraft.transitPreference;
}
function newRoutePlan() {
  state.activeSavedRouteId = null; state.routeOptions = []; state.routeStatus = "idle"; state.selectedRouteOption = 0;
  state.routeDraft = { origin: null, destination: null, travelMode: "TRANSIT", timeMode: "departure", dateTime: "2026-09-05T09:00", transitModes: [], transitPreference: "" };
  $("routeTitle").value = ""; $("routeManualCost").value = ""; $("routeNotes").value = ""; $("customRoutePanel").hidden = true; syncRouteForm(); renderRoutePlanner(); renderMap();
}
function shiftRouteTime(minutes) {
  const date = routeRequestDate(); if (!date) return; date.setMinutes(date.getMinutes() + minutes);
  const local = japanInputFromDate(date); state.routeDraft.dateTime = local; $("routeDateTime").value = local; void searchRoutes();
}

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
  $("placePreview").innerHTML = `<div class="preview-top"><div class="preview-symbol">⌖</div><div class="preview-copy"><p class="preview-meta">Google Maps 地点 / 地区</p><h3>${esc(place.name_zh)}</h3><p>${esc(place.formatted_address)}</p><div class="place-preview-meta">${place.place_type ? `<span>${esc(place.place_type)}</span>` : ""}${status ? `<span>${esc(status)}</span>` : ""}</div></div></div><div class="route-quick-actions"><button class="route-to-button" data-plan-route-to-preview><span>↗</span>到这里</button><button class="route-from-button" data-plan-route-from-preview><span>↘</span>从这里出发</button></div><div class="preview-actions preview-secondary-actions"><button class="secondary-button" data-add-preview-place>${existing ? "查看已加入地点" : "加入行程 ⭐"}</button><button class="text-button" data-dismiss-preview>取消</button></div>`;
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
function renderDetailRouteActions(item) {
  if (!validCoordinates(item)) return "";
  return `<div class="detail-route-actions"><div><strong>规划前往 ${esc(item.name)}</strong><span>直接带入路线，不用重新搜索地点。</span></div><button class="route-to-button" data-plan-route-to-candidate="${esc(item.id)}">↗ 到这里</button><button class="route-from-button" data-plan-route-from-candidate="${esc(item.id)}">↘ 从这里出发</button></div>`;
}
function renderCandidateDetail(item) {
  const area = areaForCandidate(item.id); const position = item.temporal?.trip_window_position || {};
  const altNames = [item.names?.ja, item.names?.en].filter(known).map(esc).join(" · ");
  const preview = dl([["体验概览",item.experience?.experience_summary],["值得去的原因",item.experience?.why_people_love_it]]);
  const tripExperience = dl([["9 月旅行体验",item.experience?.sep_2026_experience],["时间窗口",friendlyTiming(item.experience?.trip_window_fit)],["建议行程阶段",friendlyTiming(position.preferred_trip_segment)]]);
  const practical = dl([["建议停留时间",item.experience?.realistic_duration],["天气影响",item.experience?.weather_dependency],["体力要求",item.experience?.physical_load],["所在市町",item.municipality]]);
  const disappointment = known(item.experience?.common_disappointments) ? `<p>${esc(shown(item.experience.common_disappointments))}</p>` : "";
  $("detailContent").innerHTML = `<header class="detail-hero"><span class="detail-category" style="--category-color:${COLORS[item.category]}">${esc(labelCategory(item.category))}</span><h2>${esc(item.name)}</h2>${altNames ? `<p class="alt-names">${altNames}</p>` : ""}</header>${renderDetailRouteActions(item)}${renderDetailAreaAction(item)}<div class="detail-body"><div class="detail-tags">${area ? `<span class="detail-tag">已加入 ${esc(area.name)}</span>` : `<span class="detail-tag neutral">尚未加入地区</span>`}${item.municipality ? `<span class="detail-tag neutral">${esc(item.municipality)}</span>` : ""}</div>${renderGooglePlaceDetails(item)}${infoSection("30 秒了解", preview)}${infoSection("实际会做什么", displayList(item.experience?.what_you_actually_do))}${infoSection("9 月 5–18 日体验", tripExperience)}${infoSection("实用信息", practical)}${infoSection("可能失望之处", disappointment)}${infoSection("视觉资料",renderVisualEvidence(item))}</div>`;
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
  state.view = view; state.selectedCandidateId = null; document.body.classList.toggle("route-view-active", view === "routes"); if (view !== "routes") document.body.classList.remove("route-details-visible"); document.querySelectorAll(".panel-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view));
  $("areasView").classList.toggle("active", view === "areas"); $("routesView").classList.toggle("active", view === "routes"); $("candidatesView").classList.toggle("active", view === "candidates");
  if (view === "candidates") { state.selectedAreaId = null; state.showCandidates = true; }
  else if (view === "routes") { state.selectedAreaId = null; state.showCandidates = false; }
  else if (!state.selectedAreaId) state.showCandidates = false;
  renderAll({ fitMap: true });
}
function setupInteractions() {
  document.querySelectorAll(".panel-tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  [["routeOriginSearch","origin"],["routeDestinationSearch","destination"]].forEach(([id,target]) => {
    $(id).addEventListener("input", () => scheduleRouteEndpointSearch(target));
    $(id).addEventListener("focus", () => { if ($(id).value.trim() && !state.routeDraft[target]) void searchRouteEndpoint(target); });
    routeEndpointResults(target).addEventListener("click", event => {
      const local = event.target.closest("[data-route-local-endpoint]"); if (local) return chooseLocalRouteEndpoint(target, Number(local.dataset.routeLocalEndpoint));
      const live = event.target.closest("[data-route-live-endpoint]"); if (live) return void chooseLiveRouteEndpoint(target, Number(live.dataset.routeLiveEndpoint));
    });
  });
  document.querySelectorAll("[data-clear-route-endpoint]").forEach(button => button.addEventListener("click", () => clearRouteEndpoint(button.dataset.clearRouteEndpoint)));
  $("swapRouteEndpoints").addEventListener("click", swapRouteEndpoints);
  $("routeModeTabs").addEventListener("click", event => { const button = event.target.closest("[data-route-mode]"); if (!button) return; state.routeDraft.travelMode = button.dataset.routeMode; if (state.routeDraft.travelMode !== "TRANSIT") { state.routeDraft.timeMode = "departure"; $("routeTimeMode").value = "departure"; } state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap(); });
  $("routeTimeMode").addEventListener("change", event => { state.routeDraft.timeMode = event.target.value; });
  $("routeDateTime").addEventListener("change", event => { state.routeDraft.dateTime = event.target.value; state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap(); });
  $("transitFilters").addEventListener("click", event => { const button = event.target.closest("[data-transit-mode]"); if (!button) return; state.routeDraft.transitModes = button.dataset.transitMode ? [button.dataset.transitMode] : []; state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap(); });
  $("transitPreference").addEventListener("change", event => { state.routeDraft.transitPreference = event.target.value; state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap(); });
  $("searchRoutes").addEventListener("click", () => void searchRoutes());
  $("toggleNavitimeSettings").addEventListener("click", openNavitimeSettings);
  $("closeNavitimeSettings").addEventListener("click", () => { $("navitimeSettings").hidden = true; });
  $("saveNavitimeKey").addEventListener("click", () => {
    const key = $("navitimeApiKey").value.trim(); if (!key) return showToast("请粘贴 RapidAPI Key");
    setNavitimeApiKey(key); $("navitimeApiKey").value = ""; $("navitimeSettings").hidden = true; state.routeStatus = "idle"; renderRoutePlanner(); showToast("NAVITIME 已连接");
  });
  $("clearNavitimeKey").addEventListener("click", () => { setNavitimeApiKey(""); $("navitimeApiKey").value = ""; state.routeOptions = []; state.routeStatus = "idle"; renderRoutePlanner(); renderMap(); showToast("已清除 NAVITIME 连接"); });
  $("recordNavitimeAsCustom").addEventListener("click", startBlankCustomRouteRecord);
  $("routeTimeShift").addEventListener("click", event => { const button = event.target.closest("[data-shift-route-time]"); if (button) shiftRouteTime(Number(button.dataset.shiftRouteTime)); });
  $("routeResults").addEventListener("click", event => {
    const detail = event.target.closest("[data-toggle-route-details]"); if (detail) { const index = Number(detail.dataset.toggleRouteDetails); state.routeDetailsOpen.has(index) ? state.routeDetailsOpen.delete(index) : state.routeDetailsOpen.add(index); return renderRoutePlanner(); }
    const option = event.target.closest("[data-select-route-option]"); if (option) selectRouteOption(Number(option.dataset.selectRouteOption), { fit: true });
  });
  $("saveSelectedRoute").addEventListener("click", saveSelectedRoute);
  $("savedRoutesList").addEventListener("click", event => { const del = event.target.closest("[data-delete-saved-route]"); if (del) return deleteSavedRoute(del.dataset.deleteSavedRoute); const open = event.target.closest("[data-open-saved-route]"); if (open) activateSavedRoute(open.dataset.openSavedRoute); });
  $("newRoutePlan").addEventListener("click", newRoutePlan);
  $("toggleCustomRoute").addEventListener("click", openCustomRouteEditor);
  $("closeCustomRoute").addEventListener("click", () => { $("customRoutePanel").hidden = true; });
  $("addCustomRouteOption").addEventListener("click", addCustomRouteOption);
  $("areaSearch").addEventListener("input", scheduleAreaSearch);
  $("areaSearch").addEventListener("keydown", event => { if (event.key === "Escape") { $("areaSearch").value = ""; scheduleAreaSearch(); dismissPreview(); } });
  $("clearAreaSearch").addEventListener("click", () => { $("areaSearch").value = ""; scheduleAreaSearch(); dismissPreview(); $("areaSearch").focus(); });
  $("areaSearchResults").addEventListener("click", event => {
    const liveButton = event.target.closest("[data-preview-live-place]");
    if (liveButton) return void previewLivePlace(Number(liveButton.dataset.previewLivePlace));
    const catalogButton = event.target.closest("[data-preview-place]");
    if (catalogButton) previewPlace(catalogButton.dataset.previewPlace);
  });
  $("placePreview").addEventListener("click", event => {
    if (event.target.closest("[data-plan-route-to-preview]") && state.searchPreview) return launchRoutePlanner(endpointFromSearchPlace(state.searchPreview), "destination");
    if (event.target.closest("[data-plan-route-from-preview]") && state.searchPreview) return launchRoutePlanner(endpointFromSearchPlace(state.searchPreview), "origin");
    if (event.target.closest("[data-add-preview-place]")) addPreviewPlace();
    if (event.target.closest("[data-dismiss-preview]")) dismissPreview();
  });
  $("mapFocusCard").addEventListener("click", event => {
    if (event.target.closest("[data-clear-area-focus]")) return clearAreaFocus();
    const toCandidate = event.target.closest("[data-plan-route-to-candidate]"); if (toCandidate) return launchRoutePlanner(endpointFromCandidate(candidateById(toCandidate.dataset.planRouteToCandidate)), "destination");
    const fromCandidate = event.target.closest("[data-plan-route-from-candidate]"); if (fromCandidate) return launchRoutePlanner(endpointFromCandidate(candidateById(fromCandidate.dataset.planRouteFromCandidate)), "origin");
    const toArea = event.target.closest("[data-plan-route-to-area]"); if (toArea) return launchRoutePlanner(endpointFromArea(areaById(toArea.dataset.planRouteToArea)), "destination");
    const fromArea = event.target.closest("[data-plan-route-from-area]"); if (fromArea) return launchRoutePlanner(endpointFromArea(areaById(fromArea.dataset.planRouteFromArea)), "origin");
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
  $("areaList").addEventListener("drop", event => { event.preventDefault(); const target = event.target.closest("[data-area-card]")?.dataset.areaCard; if (!target || !state.draggedAreaId || target === state.draggedAreaId) return; const from = state.areas.findIndex(area => area.id === state.draggedAreaId); const to = state.areas.findIndex(area => area.id === target); const [moved] = state.areas.splice(from,1); state.areas.splice(to,0,moved); saveUserState(); renderAll({ fitMap: true }); });
  $("tripRouteSummary").addEventListener("click", event => { if (event.target.closest("[data-open-route-planner]")) switchView("routes"); });
  $("closeNearby").addEventListener("click", closeNearby);
  $("nearbyTypeChips").addEventListener("click", event => { const chip = event.target.closest("[data-nearby-type]"); if (!chip) return; state.nearbyType = chip.dataset.nearbyType; void searchNearby(); });
  $("nearbyResults").addEventListener("click", event => { const result = event.target.closest("[data-focus-nearby]"); if (result) return focusNearbyPlace(result.dataset.focusNearby); if (event.target.closest("[data-retry-nearby]")) void searchNearby(); });
  $("candidateList").addEventListener("click", event => { const route = event.target.closest("[data-plan-route-to-candidate]"); if (route) return launchRoutePlanner(endpointFromCandidate(candidateById(route.dataset.planRouteToCandidate)), "destination"); const detail = event.target.closest("[data-open-candidate-detail]"); if (detail) return focusCandidate(detail.dataset.openCandidateDetail, { showDetails: true }); const add = event.target.closest("[data-quick-add-candidate]"); if (add) return focusCandidate(add.dataset.quickAddCandidate, { showDetails: true }); const focus = event.target.closest("[data-focus-candidate]"); if (focus) return focusCandidate(focus.dataset.focusCandidate, { showDetails: false }); });
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
    const toCandidate = event.target.closest("[data-plan-route-to-candidate]"); if (toCandidate) return launchRoutePlanner(endpointFromCandidate(candidateById(toCandidate.dataset.planRouteToCandidate)), "destination");
    const fromCandidate = event.target.closest("[data-plan-route-from-candidate]"); if (fromCandidate) return launchRoutePlanner(endpointFromCandidate(candidateById(fromCandidate.dataset.planRouteFromCandidate)), "origin");
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
    loadUserState(); loadNavitimeQuota(); fillCategorySelect($("pickerCategory")); await initMap(); setupInteractions(); syncRouteForm(); renderAll({ fitMap: true });
  } catch (error) {
    $("areaList").innerHTML = `<div class="empty-state"><h3>无法载入地图数据</h3><p>${esc(error.message)}</p></div>`;
  }
}
boot();
