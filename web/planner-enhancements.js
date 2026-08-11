(() => {
  const ENHANCEMENT_STORAGE = "hokkaido-planner-enhancements-v1";
  const TRIP_END = "2026-09-19";
  const iconByType = {
    lodging: "⌂", onsen: "♨", restaurant: "●", dessert_cafe: "●", animal_experience: "●",
    natural_experience: "●", event: "◆", museum: "■", architecture: "■", shop: "■", workshop: "■",
    special_transport: "◆", place: "●",
  };
  const labelByType = {
    lodging: "住宿", onsen: "温泉", restaurant: "餐厅", dessert_cafe: "甜品 / 咖啡", animal_experience: "动物",
    natural_experience: "自然", event: "活动", museum: "博物馆", architecture: "建筑", shop: "商店", workshop: "工坊",
    special_transport: "特别交通", place: "地点",
  };
  const infoSuggestions = {
    lodging: ["预订", "入住", "退房", "确认号", "早餐", "温泉", "备注"],
    restaurant: ["预约", "预约时间", "想吃", "备注"],
    dessert_cafe: ["预约", "想吃", "售罄提醒", "备注"],
    special_transport: ["车票", "班次", "座位", "取票", "换乘", "备注"],
    event: ["门票", "预约", "入场", "注意", "备注"],
    default: ["门票", "预约", "取票", "想看", "注意", "备注"],
  };

  let overlay = { regional_modules: [], candidate_additions: [] };
  let regionalMarkers = [];
  let renderingCompactDetail = false;

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function loadEnhancementState() {
    return safeParse(localStorage.getItem(ENHANCEMENT_STORAGE) || "{}", {});
  }
  function saveEnhancementState(value) {
    localStorage.setItem(ENHANCEMENT_STORAGE, JSON.stringify(value));
  }
  function candidateType(item) {
    return item?.candidate?.entity_type || item?.entity_type || item?.original?.entity_type || "place";
  }
  function candidateIcon(item) {
    const type = candidateType(item);
    if (type === "lodging") return "⌂";
    if (type === "onsen") return "♨";
    if (type === "restaurant") return "●";
    if (type === "dessert_cafe") return "●";
    if (type === "animal_experience") return "●";
    if (type === "natural_experience") return "●";
    if (type === "event") return "◆";
    if (["museum", "architecture", "shop", "workshop"].includes(type)) return "■";
    if (type === "special_transport") return "◆";
    return "●";
  }
  function candidateTypeLabel(item) {
    const type = candidateType(item);
    return labelByType[type] || (typeof labelCategory === "function" ? labelCategory(item.category) : type);
  }
  function candidateIsRegionalModule(item) {
    return item?.candidate?.entity_type === "regional_module" || item?.candidate?.candidate_type === "regional_module";
  }
  function additionToViewModel(candidate) {
    return {
      id: candidate.candidate_id,
      candidate,
      name: candidate.name_zh || candidate.name_ja || candidate.name_en || candidate.candidate_id,
      names: { ja: candidate.name_ja, en: candidate.name_en, zh: candidate.name_zh },
      category: candidate.normalized_category,
      originalCategory: null,
      subcategory: candidate.subcategory,
      region: candidate.region,
      municipality: candidate.municipality,
      country: "Japan",
      role: "atomic_candidate",
      eligible: null,
      status: "inventory_only",
      batchId: null,
      experience: candidate.experience || {},
      temporal: candidate.temporal_profile || {},
      visual: { assets: [] },
      sourcePacks: {},
      provenance: [], originalRecords: [], historicalAssessment: null, relationships: {},
      location: { verification_status: "unresolved" }, original: {}, uncertainties: [], dynamicRechecks: [], level2Attention: [], conflicts: [],
      latestOverlay: null, dynamicRecheckRequired: false, hasVisualEvidence: false, hasUncertainty: false,
      plannerOverlay: true,
    };
  }
  function appendMissingCandidates() {
    (overlay.candidate_additions || []).forEach(raw => {
      if (!state.candidates.some(item => item.id === raw.candidate_id)) state.candidates.push(additionToViewModel(raw));
    });
  }

  function updateTripDates() {
    const brand = document.querySelector(".brand-block p");
    if (brand) brand.textContent = "9月5日—19日 · 旅行地图";
    const customDate = document.getElementById("customCandidateDate");
    if (customDate) customDate.max = TRIP_END;
    document.querySelectorAll('input[type="date"]').forEach(input => {
      if (input.min === "2026-09-05" && (!input.max || input.max === "2026-09-18")) input.max = TRIP_END;
    });
  }

  function ensureItineraryView() {
    const nav = document.querySelector(".panel-tabs");
    if (!nav || document.querySelector('[data-view="itinerary"]')) return;
    const itineraryTab = document.createElement("button");
    itineraryTab.className = "panel-tab";
    itineraryTab.dataset.view = "itinerary";
    itineraryTab.textContent = "行程";
    nav.prepend(itineraryTab);
    const routeTab = nav.querySelector('[data-view="routes"]');
    if (routeTab) routeTab.classList.add("planner-route-tab-hidden");

    const itinerary = document.createElement("section");
    itinerary.id = "itineraryView";
    itinerary.className = "panel-view planner-itinerary-view";
    itinerary.innerHTML = '<div class="panel-heading"><div><p class="section-kicker">TRIP PLAN</p><h2>行程</h2></div><button id="openRouteWorkspace" class="planner-transport-action" type="button">＋ 查交通</button></div><p class="panel-intro">按日期看已经安排的地点与保存的交通。交通查询只在需要时打开。</p><div id="itineraryList" class="planner-itinerary-list"></div>';
    const areasView = document.getElementById("areasView");
    areasView?.parentElement?.insertBefore(itinerary, areasView);

    const routesView = document.getElementById("routesView");
    if (routesView && !document.getElementById("closeRouteWorkspace")) {
      const heading = routesView.querySelector(".panel-heading");
      const back = document.createElement("button");
      back.id = "closeRouteWorkspace";
      back.className = "planner-route-back";
      back.type = "button";
      back.textContent = "← 返回行程";
      heading?.prepend(back);
    }
  }
  function activateView(name) {
    state.view = name;
    document.querySelectorAll(".panel-tab").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    document.querySelectorAll(".panel-view").forEach(view => view.classList.remove("active"));
    const target = document.getElementById(name === "itinerary" ? "itineraryView" : `${name}View`);
    target?.classList.add("active");
    if (name === "itinerary") renderItinerary();
    if (name === "routes" && typeof renderRoutePlanner === "function") renderRoutePlanner();
    if (typeof renderMap === "function") renderMap({ fit: false });
  }

  function dateFromISO(value) {
    if (!value) return "";
    const match = String(value).match(/(2026-09-\d{2})/);
    return match?.[1] || "";
  }
  function timeFromISO(value) {
    if (!value) return "";
    const match = String(value).match(/T(\d{2}:\d{2})/);
    return match?.[1] || "";
  }
  function dayLabel(date) {
    const [,m,d] = date.split("-");
    return `${Number(m)}月${Number(d)}日`;
  }
  function renderItinerary() {
    const host = document.getElementById("itineraryList");
    if (!host) return;
    const byDate = new Map();
    const push = (date, item) => {
      if (!date) return;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(item);
    };
    state.candidates.forEach(item => {
      const plan = state.candidatePlans?.[item.id];
      if (plan?.date) push(plan.date, { kind: "candidate", time: plan.time || "", item });
    });
    state.savedRoutes.forEach(route => {
      const option = route.selectedOption || {};
      const date = dateFromISO(option.departureTime || route.dateTime);
      if (date) push(date, { kind: "route", time: timeFromISO(option.departureTime), route });
    });
    const dates = [...byDate.keys()].sort();
    if (!dates.length) {
      host.innerHTML = '<div class="planner-itinerary-empty"><strong>还没有安排具体日期</strong><span>在地点详情里填写“我什么时候去”，保存的交通也会自动出现在这里。</span></div>';
      return;
    }
    host.innerHTML = dates.map(date => {
      const rows = byDate.get(date).sort((a,b) => String(a.time).localeCompare(String(b.time)));
      return `<section class="planner-day"><header><strong>${dayLabel(date)}</strong><span>${rows.length} 项</span></header><div>${rows.map(row => {
        if (row.kind === "candidate") {
          const area = areaForCandidate(row.item.id);
          return `<button class="planner-itinerary-row" type="button" data-itinerary-candidate="${esc(row.item.id)}"><span class="planner-row-time">${esc(row.time || "时间未定")}</span><span class="planner-row-icon">${candidateIcon(row.item)}</span><span><strong>${esc(row.item.name)}</strong><small>${esc(candidateTypeLabel(row.item))}${area ? ` · ${esc(area.name)}` : ""}</small></span></button>`;
        }
        const option = row.route.selectedOption || {};
        return `<button class="planner-itinerary-row transport" type="button" data-itinerary-route="${esc(row.route.id)}"><span class="planner-row-time">${esc(row.time || "")}</span><span class="planner-row-icon">↔</span><span><strong>${esc(row.route.title || `${row.route.origin?.name || "起点"} → ${row.route.destination?.name || "终点"}`)}</strong><small>${esc(option.durationText || "已保存交通")}${option.arrivalTime ? ` · ${esc(timeFromISO(option.arrivalTime))} 到达` : ""}</small></span></button>`;
      }).join("")}</div></section>`;
    }).join("");
  }

  function infoState() {
    const value = loadEnhancementState();
    value.infoBlocks ||= {};
    value.tags ||= {};
    return value;
  }
  function defaultTags(item) {
    const values = [];
    const duration = item.experience?.realistic_duration;
    if (known(duration)) values.push(String(duration).replace(/，.*$/, ""));
    const weather = item.experience?.weather_dependency;
    if (known(weather) && weather !== "low") values.push("天气敏感");
    const physical = item.experience?.physical_load;
    if (known(physical)) values.push(String(physical).split(/[；，。]/)[0]);
    const temporal = item.temporal || {};
    if (["fixed_dates", "fixed_datetime", "limited_date_range"].includes(temporal.time_constraint_type)) values.push("日期限定");
    return [...new Set(values.filter(Boolean))].slice(0,4);
  }
  function candidateTags(item) {
    const saved = infoState().tags?.[item.id];
    return Array.isArray(saved) ? saved : defaultTags(item);
  }
  function liveInfoLines(item) {
    const t = item.temporal || {};
    const lines = [];
    const raw = Array.isArray(t.raw_source_time_text) ? t.raw_source_time_text.filter(Boolean) : [];
    if (raw.length) lines.push(["营业 / 时间", raw.slice(0,2).join("；")]);
    else if (Array.isArray(t.operating_period) && t.operating_period.length) lines.push(["营业 / 时间", t.operating_period.slice(0,2).join("；")]);
    const fixed = Array.isArray(t.hard_date_constraints) ? t.hard_date_constraints.filter(Boolean) : [];
    if (fixed.length && !raw.length) lines.push(["日期", fixed.slice(0,2).join("；")]);
    const weather = item.experience?.weather_dependency;
    if (known(weather) && weather !== "low") lines.push(["天气", shown(weather, "")]);
    return lines.slice(0,4);
  }
  function planEditorHTML(item) {
    const plan = candidatePlan(item.id);
    return `<div class="planner-plan-editor" hidden data-plan-editor="${esc(item.id)}"><label>日期<input type="date" min="2026-09-05" max="${TRIP_END}" value="${esc(plan.date || "")}" data-planner-date></label><label>时间<input type="time" value="${esc(plan.time || "")}" data-planner-time></label><div><button type="button" data-save-plan="${esc(item.id)}">保存</button><button type="button" data-cancel-plan>取消</button></div></div>`;
  }
  function infoEditorHTML(item) {
    const suggestions = infoSuggestions[candidateType(item)] || infoSuggestions.default;
    return `<div class="planner-info-editor" hidden data-info-editor><label>标题<select data-info-title-select><option value="">选择一个标题</option>${suggestions.map(v => `<option>${esc(v)}</option>`).join("")}<option value="__custom__">自定义…</option></select></label><label data-custom-title-wrap hidden>自定义标题<input type="text" data-info-custom-title></label><label>内容<textarea rows="3" data-info-content placeholder="写下预订、门票、取票方式、想做的事或其他备注"></textarea></label><input type="hidden" data-info-block-id><div><button type="button" data-save-info>保存</button><button type="button" data-cancel-info>取消</button><button type="button" class="danger-text-button" data-delete-info hidden>删除</button></div></div>`;
  }
  function renderInfoBlocks(item) {
    const blocks = infoState().infoBlocks?.[item.id] || [];
    if (!blocks.length) return '<div class="planner-no-info">还没有个人记录。</div>';
    return blocks.map(block => `<button type="button" class="planner-info-block ${String(block.content || "").length < 28 ? "compact" : ""}" data-edit-info="${esc(block.id)}"><strong>${esc(block.title)}</strong><span>${esc(block.content)}</span></button>`).join("");
  }
  function compactDetailHTML(item) {
    const planLabel = candidatePlanLabel(item) || "还没安排时间";
    const tags = candidateTags(item);
    const summary = item.experience?.experience_summary || "";
    const activities = Array.isArray(item.experience?.what_you_actually_do) ? item.experience.what_you_actually_do.filter(Boolean) : [];
    const how = activities.length ? activities.join(" → ") : summary;
    const disappoint = item.experience?.common_disappointments;
    const live = liveInfoLines(item);
    return `<div class="planner-detail-shell" data-planner-detail-id="${esc(item.id)}">
      <header class="planner-detail-hero"><div class="planner-detail-title"><span class="planner-detail-icon">${candidateIcon(item)}</span><div><p>${esc(candidateTypeLabel(item))}${item.region ? ` · ${esc(item.region)}` : ""}</p><h2>${esc(item.name)}</h2></div></div><button type="button" class="planner-plan-pill" data-edit-plan>${esc(planLabel)}</button>${planEditorHTML(item)}<div class="planner-tag-row">${tags.map(tag => `<button type="button" class="planner-tag" data-edit-tags>${esc(tag)}</button>`).join("")}<button type="button" class="planner-tag add" data-edit-tags>＋ Tag</button></div>${summary ? `<p class="planner-detail-summary">${esc(summary)}</p>` : ""}</header>
      <div class="planner-tag-editor" hidden><label>Tag（每行一个，最多 4 个）<textarea rows="4" data-tags-text>${esc(tags.join("\n"))}</textarea></label><div><button type="button" data-save-tags>保存</button><button type="button" data-cancel-tags>取消</button></div></div>
      ${how ? `<details class="planner-fold"><summary>怎么玩</summary><p>${esc(how)}</p></details>` : ""}
      ${(live.length || known(disappoint)) ? `<details class="planner-fold"><summary>现场信息</summary>${live.map(([k,v]) => `<div class="planner-live-row"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`).join("")}${known(disappoint) ? `<div class="planner-live-row note"><strong>注意</strong><span>${esc(disappoint)}</span></div>` : ""}</details>` : ""}
      <section class="planner-my-info"><div class="planner-my-info-heading"><div><p>MY INFO</p><h3>我的信息</h3></div><button type="button" data-add-info>＋ 添加</button></div><div class="planner-info-grid">${renderInfoBlocks(item)}</div>${infoEditorHTML(item)}</section>
    </div>`;
  }
  function renderCompactDetail() {
    if (renderingCompactDetail) return;
    const host = document.getElementById("detailContent");
    const item = candidateById(state.selectedCandidateId);
    if (!host || !item || host.dataset.compactFor === item.id) return;
    renderingCompactDetail = true;
    host.dataset.compactFor = item.id;
    host.innerHTML = compactDetailHTML(item);
    renderingCompactDetail = false;
  }

  function researchModules() {
    const modules = new Map();
    (overlay.regional_modules || []).forEach(module => modules.set(module.module_id, module));
    state.candidates.filter(candidateIsRegionalModule).forEach(item => {
      if (!modules.has(item.id)) modules.set(item.id, { module_id: item.id, name_zh: item.name, region: item.region, experience_summary: item.experience?.experience_summary || "", primary_candidates: [], secondary_candidates: [] });
    });
    return [...modules.values()];
  }
  function regionCatalogPlace(module) {
    const haystack = `${module.name_zh || ""} ${module.region || ""}`.replace(/区域模块/g, "");
    const matches = state.catalog.filter(place => {
      const names = [place.name_zh, place.google_title, ...(place.search_terms || [])].filter(Boolean);
      return names.some(name => haystack.includes(name) || String(name).includes(module.region || "__none__"));
    });
    return matches.length === 1 ? matches[0] : null;
  }
  function moduleFreeIdeas(module) {
    return (module.secondary_candidates || []).filter(item => !item?.candidate_id).map(item => item.name_zh || item.summary).filter(Boolean).slice(0,5);
  }
  function modulePlanned(module) {
    const place = regionCatalogPlace(module);
    return place ? state.areas.some(area => area.placeId === place.place_id) : false;
  }
  function renderResearchRegions() {
    let host = document.getElementById("plannerResearchRegions");
    const areaList = document.getElementById("areaList");
    if (!areaList) return;
    if (!host) {
      host = document.createElement("section");
      host.id = "plannerResearchRegions";
      host.className = "planner-research-regions";
      areaList.insertAdjacentElement("afterend", host);
    }
    const modules = researchModules();
    host.innerHTML = `<div class="planner-research-heading"><span>研究地区</span><small>${modules.length}</small></div>${modules.map(module => {
      const place = regionCatalogPlace(module);
      const planned = modulePlanned(module);
      const ideas = moduleFreeIdeas(module);
      return `<article class="planner-research-region ${planned ? "planned" : ""}"><button type="button" data-focus-module="${esc(module.module_id)}"><span class="research-star">${planned ? "★" : "☆"}</span><span><strong>${esc((module.name_zh || module.region || module.module_id).replace(/区域模块$/, ""))}</strong><small>${esc(module.experience_summary || "")}</small>${ideas.length ? `<em>还可以看看：${esc(ideas.join("、"))}</em>` : ""}</span></button>${place && !planned ? `<button type="button" class="planner-add-region" data-preview-module="${esc(module.module_id)}">加入行程</button>` : ""}</article>`;
    }).join("")}`;
  }
  function clearRegionalMarkers() {
    regionalMarkers.forEach(marker => { if (mapProvider === "google") marker.setMap(null); else marker.remove(); });
    regionalMarkers = [];
  }
  function renderRegionalMarkers() {
    clearRegionalMarkers();
    if (!state.showAreas) return;
    researchModules().forEach(module => {
      const place = regionCatalogPlace(module);
      if (!place || modulePlanned(module)) return;
      if (mapProvider === "google") {
        const marker = new google.maps.Marker({ position: { lat: place.lat, lng: place.lon }, map, title: module.name_zh || module.region, zIndex: 420, label: { text: "☆", fontSize: "24px", color: "#725c42", fontWeight: "700" }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#fffaf0", fillOpacity: .94, strokeColor: "#b8a17d", strokeWeight: 1.5 } });
        marker.addListener("click", () => focusResearchModule(module.module_id)); regionalMarkers.push(marker);
      } else if (window.L) {
        const marker = L.marker([place.lat, place.lon], { icon: L.divIcon({ className: "planner-research-star-marker", html: "☆", iconSize: [32,32], iconAnchor: [16,16] }) });
        marker.bindTooltip((module.name_zh || module.region || "研究地区").replace(/区域模块$/, "")); marker.on("click", () => focusResearchModule(module.module_id)); marker.addTo(map); regionalMarkers.push(marker);
      }
    });
  }
  function focusResearchModule(moduleId) {
    const module = researchModules().find(item => item.module_id === moduleId);
    if (!module) return;
    const place = regionCatalogPlace(module); const ideas = moduleFreeIdeas(module); const card = document.getElementById("mapFocusCard");
    if (place) { if (mapProvider === "google") { map.setCenter({ lat: place.lat, lng: place.lon }); map.setZoom(9); } else map.setView([place.lat, place.lon], 9, { animate: true }); }
    if (card) { card.innerHTML = `<div class="preview-top"><div class="preview-symbol">☆</div><div class="preview-copy"><p class="preview-meta">研究地区 · 尚未加入行程</p><h3>${esc((module.name_zh || module.region || module.module_id).replace(/区域模块$/, ""))}</h3><p>${esc(module.experience_summary || "")}</p></div></div>${ideas.length ? `<p class="focus-candidate-preview">还可以看看：${esc(ideas.join("、"))}</p>` : ""}${place ? `<div class="focus-actions"><button class="secondary-button" data-preview-module="${esc(module.module_id)}">加入行程</button></div>` : ""}`; card.hidden = false; }
  }

  function applySemanticCandidateMarkers() {
    state.candidates.forEach(item => {
      const marker = candidateMarkers?.get?.(item.id); if (!marker) return;
      const type = candidateType(item); const symbol = iconByType[type] || "●";
      if (mapProvider === "google" && marker.setLabel) {
        if (["lodging", "onsen", "event", "special_transport"].includes(type)) marker.setLabel({ text: symbol, color: "#ffffff", fontSize: type === "onsen" ? "12px" : "11px", fontWeight: "700" });
        else marker.setLabel(null);
      }
    });
  }

  function bindEvents() {
    document.addEventListener("click", event => {
      const itineraryTab = event.target.closest('[data-view="itinerary"]');
      if (itineraryTab) { event.preventDefault(); event.stopPropagation(); activateView("itinerary"); return; }
      if (event.target.closest("#openRouteWorkspace")) { activateView("routes"); return; }
      if (event.target.closest("#closeRouteWorkspace")) { activateView("itinerary"); return; }
      const rowCandidate = event.target.closest("[data-itinerary-candidate]");
      if (rowCandidate) { focusCandidate(rowCandidate.dataset.itineraryCandidate, { showDetails: true }); return; }
      const rowRoute = event.target.closest("[data-itinerary-route]");
      if (rowRoute) { activateSavedRoute(rowRoute.dataset.itineraryRoute); return; }
      const focusModuleButton = event.target.closest("[data-focus-module]");
      if (focusModuleButton) { focusResearchModule(focusModuleButton.dataset.focusModule); return; }
      const previewModuleButton = event.target.closest("[data-preview-module]");
      if (previewModuleButton) { const module = researchModules().find(item => item.module_id === previewModuleButton.dataset.previewModule); const place = module && regionCatalogPlace(module); if (place) showPlacePreview(place); return; }
      if (event.target.closest("[data-edit-plan]")) { document.querySelector("[data-plan-editor]")?.removeAttribute("hidden"); return; }
      if (event.target.closest("[data-cancel-plan]")) { document.querySelector("[data-plan-editor]")?.setAttribute("hidden", ""); return; }
      const savePlan = event.target.closest("[data-save-plan]");
      if (savePlan) {
        const id = savePlan.dataset.savePlan; const editor = document.querySelector(`[data-plan-editor="${CSS.escape(id)}"]`);
        state.candidatePlans[id] = { date: editor?.querySelector("[data-planner-date]")?.value || "", time: editor?.querySelector("[data-planner-time]")?.value || "" };
        saveUserState(); document.getElementById("detailContent").dataset.compactFor = ""; renderCompactDetail(); renderItinerary(); renderAll({ fitMap: false }); return;
      }
      if (event.target.closest("[data-edit-tags]")) { document.querySelector(".planner-tag-editor")?.removeAttribute("hidden"); return; }
      if (event.target.closest("[data-cancel-tags]")) { document.querySelector(".planner-tag-editor")?.setAttribute("hidden", ""); return; }
      if (event.target.closest("[data-save-tags]")) {
        const item = candidateById(state.selectedCandidateId); if (!item) return;
        const values = (document.querySelector("[data-tags-text]")?.value || "").split(/\n|,/).map(v => v.trim()).filter(Boolean).slice(0,4);
        const value = infoState(); value.tags[item.id] = values; saveEnhancementState(value); document.getElementById("detailContent").dataset.compactFor = ""; renderCompactDetail(); return;
      }
      if (event.target.closest("[data-add-info]")) {
        const editor = document.querySelector("[data-info-editor]");
        if (editor) { editor.hidden = false; editor.querySelector("[data-info-block-id]").value = ""; editor.querySelector("[data-info-content]").value = ""; editor.querySelector("[data-delete-info]").hidden = true; }
        return;
      }
      const editInfo = event.target.closest("[data-edit-info]");
      if (editInfo) {
        const item = candidateById(state.selectedCandidateId); const value = infoState(); const block = (value.infoBlocks[item.id] || []).find(v => v.id === editInfo.dataset.editInfo); const editor = document.querySelector("[data-info-editor]");
        if (block && editor) { editor.hidden = false; editor.querySelector("[data-info-block-id]").value = block.id; editor.querySelector("[data-info-content]").value = block.content; editor.querySelector("[data-delete-info]").hidden = false; const select = editor.querySelector("[data-info-title-select]"); const opt = [...select.options].find(o => o.value === block.title || o.text === block.title); if (opt) { select.value = opt.value; editor.querySelector("[data-custom-title-wrap]").hidden = true; } else { select.value = "__custom__"; editor.querySelector("[data-custom-title-wrap]").hidden = false; editor.querySelector("[data-info-custom-title]").value = block.title; } }
        return;
      }
      if (event.target.closest("[data-cancel-info]")) { document.querySelector("[data-info-editor]")?.setAttribute("hidden", ""); return; }
      if (event.target.closest("[data-save-info]")) {
        const item = candidateById(state.selectedCandidateId); const editor = document.querySelector("[data-info-editor]"); if (!item || !editor) return;
        const select = editor.querySelector("[data-info-title-select]"); const title = select.value === "__custom__" ? editor.querySelector("[data-info-custom-title]").value.trim() : select.value.trim(); const content = editor.querySelector("[data-info-content]").value.trim(); if (!title || !content) return;
        const value = infoState(); const blocks = value.infoBlocks[item.id] ||= []; const existingId = editor.querySelector("[data-info-block-id]").value; const existing = blocks.find(v => v.id === existingId); if (existing) { existing.title = title; existing.content = content; } else blocks.push({ id: `info-${Date.now()}`, title, content });
        saveEnhancementState(value); document.getElementById("detailContent").dataset.compactFor = ""; renderCompactDetail(); return;
      }
      if (event.target.closest("[data-delete-info]")) {
        const item = candidateById(state.selectedCandidateId); const editor = document.querySelector("[data-info-editor]"); const id = editor?.querySelector("[data-info-block-id]")?.value; if (!item || !id) return;
        const value = infoState(); value.infoBlocks[item.id] = (value.infoBlocks[item.id] || []).filter(v => v.id !== id); saveEnhancementState(value); document.getElementById("detailContent").dataset.compactFor = ""; renderCompactDetail(); return;
      }
    }, true);
    document.addEventListener("change", event => {
      if (event.target.matches("[data-info-title-select]")) { const editor = event.target.closest("[data-info-editor]"); const wrap = editor?.querySelector("[data-custom-title-wrap]"); if (wrap) wrap.hidden = event.target.value !== "__custom__"; }
    });
  }

  function patchCoreRenderers() {
    const baseFiltered = filteredCandidates;
    filteredCandidates = function plannerFilteredCandidates() { return baseFiltered().filter(item => !candidateIsRegionalModule(item)); };
    const baseRenderMap = renderMap;
    renderMap = function plannerRenderMap(options) { baseRenderMap(options); applySemanticCandidateMarkers(); renderRegionalMarkers(); };
    const baseRenderAreas = renderAreas;
    renderAreas = function plannerRenderAreas() { baseRenderAreas(); renderResearchRegions(); };
    const baseRenderAll = renderAll;
    renderAll = function plannerRenderAll(options) { baseRenderAll(options); updateTripDates(); if (state.view === "itinerary") renderItinerary(); renderResearchRegions(); };
  }

  async function init() {
    try {
      const response = await fetch("../data/planner_overlay_20260811.json", { cache: "no-store" });
      if (response.ok) overlay = await response.json();
    } catch (error) { console.warn("Planner overlay unavailable", error); }
    appendMissingCandidates(); updateTripDates(); ensureItineraryView(); patchCoreRenderers(); bindEvents();
    const detail = document.getElementById("detailContent");
    if (detail) new MutationObserver(() => { if (!renderingCompactDetail && document.getElementById("detailDialog")?.open) queueMicrotask(renderCompactDetail); }).observe(detail, { childList: true, subtree: false });
    renderAll({ fitMap: false });
  }

  if (document.readyState === "complete") init(); else window.addEventListener("load", init, { once: true });
})();
