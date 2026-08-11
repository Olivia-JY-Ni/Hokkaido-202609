(() => {
  const PREFS_KEY = "hokkaido-itinerary-ui-v1";
  const TRIP_START = "2026-09-05";
  const TRIP_END = "2026-09-19";
  const WEEKDAYS = ["日","一","二","三","四","五","六"];
  let rendering = false;
  let layerPanelOpen = false;
  let itineraryObserver = null;

  function readPrefs() {
    try {
      const value = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return {
        density: value.density === "expanded" ? "expanded" : "compact",
        sidebar: ["full","narrow","collapsed"].includes(value.sidebar) ? value.sidebar : "full",
        sidebarBeforeCollapse: value.sidebarBeforeCollapse === "narrow" ? "narrow" : "full",
        showPlanned: value.showPlanned !== false,
        showUnplanned: value.showUnplanned !== false,
        selectedDay: /^\d{4}-\d{2}-\d{2}$/.test(value.selectedDay || "") ? value.selectedDay : "",
        excludedTypes: Array.isArray(value.excludedTypes) ? value.excludedTypes : [],
      };
    } catch (_) {
      return { density: "compact", sidebar: "full", sidebarBeforeCollapse: "full", showPlanned: true, showUnplanned: true, selectedDay: "", excludedTypes: [] };
    }
  }
  function writePrefs(next) {
    const current = readPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...next }));
  }
  function escHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  }
  function dateRange() {
    const result = [];
    const start = new Date(`${TRIP_START}T00:00:00+09:00`);
    const end = new Date(`${TRIP_END}T00:00:00+09:00`);
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) result.push(new Date(cursor).toISOString().slice(0,10));
    return result;
  }
  function dayLabel(date) {
    const parsed = new Date(`${date}T12:00:00+09:00`);
    const [,m,d] = date.split("-");
    return `${Number(m)}月${Number(d)}日 · 周${WEEKDAYS[parsed.getUTCDay()]}`;
  }
  function timeFromISO(value) {
    const match = String(value || "").match(/T(\d{2}:\d{2})/);
    return match?.[1] || "";
  }
  function dateFromISO(value) {
    const match = String(value || "").match(/(2026-09-\d{2})/);
    return match?.[1] || "";
  }
  function typeOf(item) {
    return item?.candidate?.entity_type || item?.entity_type || item?.original?.entity_type || "place";
  }
  function typeLabel(type) {
    return ({
      lodging:"住宿", onsen:"温泉", restaurant:"餐厅", dessert_cafe:"甜品 / 咖啡", animal_experience:"动物",
      natural_experience:"自然", event:"活动", museum:"博物馆", architecture:"建筑", shop:"商店",
      workshop:"工坊", special_transport:"交通", place:"地点",
    })[type] || type || "地点";
  }
  function typeIcon(type) {
    return ({ lodging:"⌂", onsen:"♨", restaurant:"●", dessert_cafe:"●", animal_experience:"●",
      natural_experience:"●", event:"◆", museum:"■", architecture:"■", shop:"■", workshop:"■",
      special_transport:"◆", place:"●" })[type] || "●";
  }
  function candidateSummary(item) {
    return item?.experience?.experience_summary || item?.experience?.why_people_love_it || "";
  }
  function candidatePlanValue(item) {
    return state.candidatePlans?.[item.id] || { date:"", time:"" };
  }
  function itineraryCandidatesForDate(date) {
    return state.candidates
      .filter(item => {
        const plan = candidatePlanValue(item);
        return plan.date === date && !(item?.candidate?.entity_type === "regional_module" || item?.candidate?.candidate_type === "regional_module");
      })
      .map(item => ({ item, time: candidatePlanValue(item).time || "" }))
      .sort((a,b) => String(a.time).localeCompare(String(b.time)) || String(a.item.name).localeCompare(String(b.item.name)));
  }
  function itineraryRoutesForDate(date) {
    return state.savedRoutes
      .map(route => {
        const option = route.selectedOption || {};
        const routeDate = dateFromISO(option.departureTime || route.dateTime);
        return { route, date: routeDate, time: timeFromISO(option.departureTime || route.dateTime) };
      })
      .filter(row => row.date === date)
      .sort((a,b) => String(a.time).localeCompare(String(b.time)));
  }
  function endpointMatchesCandidate(endpoint, item) {
    if (!endpoint || !item) return false;
    const endpointName = String(endpoint.name || "").trim().toLowerCase();
    const names = [item.name, item.names?.ja, item.names?.en, item.names?.zh].filter(Boolean).map(value => String(value).trim().toLowerCase());
    if (endpointName && names.some(name => name === endpointName || endpointName.includes(name) || name.includes(endpointName))) return true;
    const lat = Number(endpoint.lat), lon = Number(endpoint.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(item.location?.lat) && Number.isFinite(item.location?.lon)) {
      return Math.abs(lat - item.location.lat) < 0.0015 && Math.abs(lon - item.location.lon) < 0.0015;
    }
    return false;
  }
  function routeForPair(routes, used, fromRow, toRow) {
    const directIndex = routes.findIndex((row,index) => !used.has(index) && endpointMatchesCandidate(row.route.origin, fromRow.item) && endpointMatchesCandidate(row.route.destination, toRow.item));
    if (directIndex >= 0) return directIndex;
    const fromTime = fromRow.time || "00:00";
    const toTime = toRow.time || "23:59";
    return routes.findIndex((row,index) => !used.has(index) && row.time && row.time >= fromTime && row.time <= toTime);
  }
  function routeConnectorHTML(routeRow) {
    const route = routeRow.route;
    const option = route.selectedOption || {};
    const title = route.title || `${route.origin?.name || "起点"} → ${route.destination?.name || "终点"}`;
    const duration = option.durationText || "已保存交通";
    const arrival = timeFromISO(option.arrivalTime);
    return `<button class="planner-v2-connector saved" type="button" data-itinerary-route="${escHtml(route.id)}"><span class="planner-v2-connector-line"></span><span class="planner-v2-connector-icon">↕</span><span><strong>${escHtml(duration)}</strong><small>${escHtml(routeRow.time || "")}${arrival ? ` → ${escHtml(arrival)}` : ""} · ${escHtml(title)}</small></span><span class="planner-v2-connector-action">查看</span></button>`;
  }
  function missingConnectorHTML(fromRow, toRow, date) {
    return `<button class="planner-v2-connector missing" type="button" data-connect-from="${escHtml(fromRow.item.id)}" data-connect-to="${escHtml(toRow.item.id)}" data-connect-date="${escHtml(date)}"><span class="planner-v2-connector-line"></span><span class="planner-v2-connector-icon">＋</span><span><strong>添加交通</strong><small>${escHtml(fromRow.item.name)} → ${escHtml(toRow.item.name)}</small></span></button>`;
  }
  function candidateRowHTML(row, index) {
    const item = row.item;
    const area = typeof areaForCandidate === "function" ? areaForCandidate(item.id) : null;
    const type = typeOf(item);
    const summary = candidateSummary(item);
    return `<button class="planner-v2-stop" type="button" data-itinerary-candidate="${escHtml(item.id)}"><span class="planner-v2-sequence">${index + 1}</span><span class="planner-row-time">${escHtml(row.time || "时间未定")}</span><span class="planner-row-icon">${escHtml(typeIcon(type))}</span><span class="planner-v2-stop-copy"><strong>${escHtml(item.name)}</strong><small>${escHtml(typeLabel(type))}${area ? ` · ${escHtml(area.name)}` : ""}</small>${summary ? `<em>${escHtml(summary)}</em>` : ""}</span></button>`;
  }
  function renderDay(date) {
    const candidates = itineraryCandidatesForDate(date);
    const routes = itineraryRoutesForDate(date);
    const usedRoutes = new Set();
    const areaNames = [...new Set(candidates.map(row => typeof areaForCandidate === "function" ? areaForCandidate(row.item.id)?.name : "").filter(Boolean))];
    const areaSummary = areaNames.length > 1 ? `${areaNames[0]} → ${areaNames.at(-1)}` : (areaNames[0] || "");
    const meta = `${candidates.length} 个地点${routes.length ? ` · ${routes.length} 段交通` : ""}`;
    let content = "";
    candidates.forEach((row,index) => {
      content += candidateRowHTML(row,index);
      if (index < candidates.length - 1) {
        const next = candidates[index + 1];
        const routeIndex = routeForPair(routes, usedRoutes, row, next);
        if (routeIndex >= 0) {
          usedRoutes.add(routeIndex);
          content += routeConnectorHTML(routes[routeIndex]);
        } else {
          content += missingConnectorHTML(row,next,date);
        }
      }
    });
    const extras = routes.filter((_,index) => !usedRoutes.has(index));
    if (extras.length) content += `<div class="planner-v2-extra-routes"><span>其他已保存交通</span>${extras.map(routeConnectorHTML).join("")}</div>`;
    if (!candidates.length && routes.length) content = `<div class="planner-v2-extra-routes only"><span>已保存交通</span>${routes.map(routeConnectorHTML).join("")}</div>`;
    return `<section class="planner-day planner-v2-day" data-itinerary-day="${escHtml(date)}"><header class="planner-v2-day-header"><div><strong>${escHtml(dayLabel(date))}</strong>${areaSummary ? `<b>${escHtml(areaSummary)}</b>` : ""}<span>${escHtml(meta)}</span></div><div class="planner-v2-day-actions"><button type="button" data-show-day="${escHtml(date)}">只看今天</button><button type="button" data-add-day="${escHtml(date)}">＋安排</button></div></header><div class="planner-v2-day-content">${content || '<div class="planner-v2-day-empty">这天还没有安排地点。</div>'}</div></section>`;
  }
  function ensureItineraryToolbar() {
    const view = document.getElementById("itineraryView");
    const heading = view?.querySelector(".panel-heading");
    if (!heading || heading.querySelector(".planner-density-toggle")) return;
    const transport = document.getElementById("openRouteWorkspace");
    const actions = document.createElement("div");
    actions.className = "planner-itinerary-heading-actions";
    actions.innerHTML = `<div class="planner-density-toggle" role="group" aria-label="行程显示密度"><button type="button" data-density="compact">紧凑</button><button type="button" data-density="expanded">展开</button></div>`;
    if (transport) actions.appendChild(transport);
    heading.appendChild(actions);
  }
  function renderEnhancedItinerary() {
    const host = document.getElementById("itineraryList");
    if (!host || rendering) return;
    ensureItineraryToolbar();
    const prefs = readPrefs();
    const dates = dateRange().filter(date => itineraryCandidatesForDate(date).length || itineraryRoutesForDate(date).length);
    rendering = true;
    host.dataset.itineraryDensity = prefs.density;
    host.innerHTML = dates.length ? dates.map(renderDay).join("") :
      '<div class="planner-itinerary-empty"><strong>还没有安排具体日期</strong><span>在地点详情里填写“我什么时候去”，保存的交通也会自动出现在这里。</span></div>';
    document.querySelectorAll("[data-density]").forEach(button => button.classList.toggle("active", button.dataset.density === prefs.density));
    rendering = false;
  }
  function watchItinerary() {
    const host = document.getElementById("itineraryList");
    if (!host || itineraryObserver) return;
    itineraryObserver = new MutationObserver(() => {
      if (rendering || host.querySelector(".planner-v2-day")) return;
      queueMicrotask(renderEnhancedItinerary);
    });
    itineraryObserver.observe(host, { childList:true });
  }

  function ensureSidebarControls() {
    const panel = document.querySelector(".planner-panel");
    if (!panel || panel.querySelector(".planner-sidebar-controls")) return;
    const controls = document.createElement("div");
    controls.className = "planner-sidebar-controls";
    controls.innerHTML = '<button type="button" data-sidebar-narrow title="切换窄栏">⇤</button><button type="button" data-sidebar-collapse title="收起左栏">‹</button>';
    panel.appendChild(controls);
    applySidebarState();
  }
  function resizeMapSoon() {
    setTimeout(() => {
      try {
        if (mapProvider === "google" && window.google?.maps?.event) google.maps.event.trigger(map,"resize");
        else if (map?.invalidateSize) map.invalidateSize({ animate:false });
      } catch (_) {}
    }, 240);
  }
  function applySidebarState() {
    const prefs = readPrefs();
    document.body.classList.toggle("planner-sidebar-narrow", prefs.sidebar === "narrow");
    document.body.classList.toggle("planner-sidebar-collapsed", prefs.sidebar === "collapsed");
    const narrow = document.querySelector("[data-sidebar-narrow]");
    const collapse = document.querySelector("[data-sidebar-collapse]");
    if (narrow) { narrow.classList.toggle("active", prefs.sidebar === "narrow"); narrow.disabled = prefs.sidebar === "collapsed"; }
    if (collapse) { collapse.textContent = prefs.sidebar === "collapsed" ? "›" : "‹"; collapse.title = prefs.sidebar === "collapsed" ? "展开左栏" : "收起左栏"; }
    resizeMapSoon();
  }

  function availableTypes() {
    const typeMap = new Map();
    state.candidates.forEach(item => {
      if (item?.candidate?.entity_type === "regional_module" || item?.candidate?.candidate_type === "regional_module") return;
      const type = typeOf(item);
      typeMap.set(type, typeLabel(type));
    });
    return [...typeMap.entries()].sort((a,b) => a[1].localeCompare(b[1],"zh-CN"));
  }
  function layerCandidateVisible(item) {
    const prefs = readPrefs();
    const plan = candidatePlanValue(item);
    const planned = Boolean(plan.date);
    if (prefs.selectedDay && plan.date !== prefs.selectedDay) return false;
    if (!prefs.selectedDay && planned && !prefs.showPlanned) return false;
    if (!prefs.selectedDay && !planned && !prefs.showUnplanned) return false;
    if (prefs.excludedTypes.includes(typeOf(item))) return false;
    return true;
  }
  function renderLayerPanel() {
    const panel = document.getElementById("plannerLayerPanel");
    if (!panel) return;
    const prefs = readPrefs();
    const days = dateRange();
    panel.innerHTML = `<div class="planner-layer-heading"><strong>地图图层</strong><button type="button" data-close-layers>×</button></div>
      <label class="planner-layer-check"><input type="checkbox" data-layer-areas ${state.showAreas ? "checked" : ""}><span>⭐ 地区</span></label>
      <label class="planner-layer-check"><input type="checkbox" data-layer-planned ${prefs.showPlanned ? "checked" : ""}><span>已安排行程地点</span></label>
      <label class="planner-layer-check"><input type="checkbox" data-layer-unplanned ${prefs.showUnplanned ? "checked" : ""}><span>未安排地点</span></label>
      <div class="planner-layer-section"><span>日期</span><div class="planner-day-chips"><button type="button" data-layer-day="" class="${prefs.selectedDay ? "" : "active"}">全部</button>${days.map(date => `<button type="button" data-layer-day="${date}" class="${prefs.selectedDay === date ? "active" : ""}">${Number(date.slice(-2))}</button>`).join("")}</div></div>
      <div class="planner-layer-section"><span>类型</span><div class="planner-type-checks">${availableTypes().map(([type,label]) => `<label><input type="checkbox" data-layer-type="${escHtml(type)}" ${prefs.excludedTypes.includes(type) ? "" : "checked"}><span>${escHtml(label)}</span></label>`).join("")}</div></div>
      <button type="button" class="planner-layer-reset" data-layer-reset>重置图层</button>`;
  }
  function ensureLayerPanel() {
    const stage = document.querySelector(".map-stage");
    if (!stage || document.getElementById("plannerLayerButton")) return;
    const button = document.createElement("button");
    button.id = "plannerLayerButton";
    button.className = "planner-layer-button";
    button.type = "button";
    button.innerHTML = "<span>☷</span> 图层";
    const panel = document.createElement("aside");
    panel.id = "plannerLayerPanel";
    panel.className = "planner-layer-panel";
    panel.hidden = true;
    stage.append(button,panel);
    renderLayerPanel();
  }
  function refreshMapLayers() {
    const prefs = readPrefs();
    state.showCandidates = Boolean(prefs.selectedDay || prefs.showPlanned || prefs.showUnplanned);
    if (typeof renderMap === "function") renderMap({ fit:false });
    if (typeof updateLayerButtons === "function") updateLayerButtons();
    renderLayerPanel();
  }
  function patchMapCandidates() {
    if (typeof mapCandidates !== "function" || mapCandidates.__wanderlogUiPatched) return;
    const base = mapCandidates;
    const wrapped = function plannerWanderlogMapCandidates() {
      return base().filter(layerCandidateVisible);
    };
    wrapped.__wanderlogUiPatched = true;
    mapCandidates = wrapped;
  }

  function openConnectionPlanner(fromId,toId,date) {
    const from = typeof candidateById === "function" ? candidateById(fromId) : null;
    const to = typeof candidateById === "function" ? candidateById(toId) : null;
    if (!from || !to || typeof endpointFromCandidate !== "function") return;
    const origin = endpointFromCandidate(from);
    const destination = endpointFromCandidate(to);
    if (!origin || !destination) {
      if (typeof showToast === "function") showToast("这两个地点缺少可用坐标，暂时不能直接查交通");
      return;
    }
    state.routeDraft.origin = origin;
    state.routeDraft.destination = destination;
    const fromTime = candidatePlanValue(from).time || "09:00";
    state.routeDraft.dateTime = `${date}T${fromTime}`;
    if (typeof syncRouteForm === "function") syncRouteForm();
    if (typeof switchView === "function") switchView("routes");
    if (typeof renderRoutePlanner === "function") renderRoutePlanner();
  }

  function bindEvents() {
    document.addEventListener("click", event => {
      const density = event.target.closest("[data-density]");
      if (density) { writePrefs({ density:density.dataset.density }); renderEnhancedItinerary(); return; }
      const connect = event.target.closest("[data-connect-from][data-connect-to]");
      if (connect) { openConnectionPlanner(connect.dataset.connectFrom,connect.dataset.connectTo,connect.dataset.connectDate); return; }
      const day = event.target.closest("[data-show-day]");
      if (day) { writePrefs({ selectedDay:day.dataset.showDay, showPlanned:true, showUnplanned:false }); layerPanelOpen = false; refreshMapLayers(); return; }
      if (event.target.closest("[data-add-day]")) {
        if (typeof switchView === "function") switchView("candidates");
        if (typeof showToast === "function") showToast("选择地点后，在详情里填写这一天的时间");
        return;
      }
      if (event.target.closest("[data-sidebar-narrow]")) {
        const prefs = readPrefs();
        const next = prefs.sidebar === "narrow" ? "full" : "narrow";
        writePrefs({ sidebar:next, sidebarBeforeCollapse:next });
        applySidebarState();
        return;
      }
      if (event.target.closest("[data-sidebar-collapse]")) {
        const prefs = readPrefs();
        if (prefs.sidebar === "collapsed") writePrefs({ sidebar:prefs.sidebarBeforeCollapse || "full" });
        else writePrefs({ sidebarBeforeCollapse:prefs.sidebar === "narrow" ? "narrow" : "full", sidebar:"collapsed" });
        applySidebarState();
        return;
      }
      if (event.target.closest("#plannerLayerButton")) {
        layerPanelOpen = !layerPanelOpen;
        const panel = document.getElementById("plannerLayerPanel");
        if (panel) panel.hidden = !layerPanelOpen;
        if (layerPanelOpen) renderLayerPanel();
        return;
      }
      if (event.target.closest("[data-close-layers]")) {
        layerPanelOpen = false;
        const panel = document.getElementById("plannerLayerPanel"); if (panel) panel.hidden = true;
        return;
      }
      const layerDay = event.target.closest("[data-layer-day]");
      if (layerDay) { writePrefs({ selectedDay:layerDay.dataset.layerDay }); refreshMapLayers(); return; }
      if (event.target.closest("[data-layer-reset]")) {
        writePrefs({ showPlanned:true, showUnplanned:true, selectedDay:"", excludedTypes:[] });
        state.showAreas = true; refreshMapLayers(); return;
      }
    }, true);
    document.addEventListener("change", event => {
      if (event.target.matches("[data-layer-areas]")) { state.showAreas = event.target.checked; refreshMapLayers(); return; }
      if (event.target.matches("[data-layer-planned]")) { writePrefs({ showPlanned:event.target.checked }); refreshMapLayers(); return; }
      if (event.target.matches("[data-layer-unplanned]")) { writePrefs({ showUnplanned:event.target.checked }); refreshMapLayers(); return; }
      if (event.target.matches("[data-layer-type]")) {
        const prefs = readPrefs(); const excluded = new Set(prefs.excludedTypes);
        event.target.checked ? excluded.delete(event.target.dataset.layerType) : excluded.add(event.target.dataset.layerType);
        writePrefs({ excludedTypes:[...excluded] }); refreshMapLayers();
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && layerPanelOpen) {
        layerPanelOpen = false;
        const panel = document.getElementById("plannerLayerPanel"); if (panel) panel.hidden = true;
      }
    });
  }

  function init(attempt=0) {
    if (typeof state === "undefined" || !document.getElementById("itineraryView") || typeof mapCandidates !== "function") {
      if (attempt < 100) setTimeout(() => init(attempt+1),80);
      return;
    }
    patchMapCandidates();
    ensureSidebarControls();
    ensureLayerPanel();
    ensureItineraryToolbar();
    watchItinerary();
    bindEvents();
    applySidebarState();
    renderEnhancedItinerary();
    refreshMapLayers();
  }

  if (typeof window !== "undefined") {
    window.PlannerItineraryUITestables = { dateRange, dayLabel, timeFromISO, dateFromISO, endpointMatchesCandidate };
    if (document.readyState === "complete") init(); else window.addEventListener("load", () => init(), { once:true });
  }
})();
