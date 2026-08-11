(() => {
  const isRegionalModule = item => item?.candidate?.entity_type === "regional_module" || item?.candidate?.candidate_type === "regional_module";

  function atomicCandidates() {
    return state.candidates.filter(item => !isRegionalModule(item));
  }

  function patchViewSwitching() {
    if (typeof switchView === "function" && !switchView.__plannerPatched) {
      const base = switchView;
      const wrapped = function plannerSwitchView(view) {
        const itinerary = document.getElementById("itineraryView");
        if (itinerary) itinerary.classList.remove("active");
        base(view);
      };
      wrapped.__plannerPatched = true;
      switchView = wrapped;
    }
    document.addEventListener("click", event => {
      const tab = event.target.closest?.('.panel-tab[data-view]');
      if (!tab || tab.dataset.view === "itinerary") return;
      document.getElementById("itineraryView")?.classList.remove("active");
    }, true);
  }

  function patchCandidateSurfaces() {
    if (typeof filteredCandidates === "function" && !filteredCandidates.__plannerAtomicPatched) {
      const base = filteredCandidates;
      const wrapped = function plannerAtomicFilteredCandidates() { return base().filter(item => !isRegionalModule(item)); };
      wrapped.__plannerAtomicPatched = true;
      filteredCandidates = wrapped;
    }
    if (typeof renderCounts === "function" && !renderCounts.__plannerPatched) {
      const base = renderCounts;
      const wrapped = function plannerCounts() {
        base();
        const atomic = atomicCandidates();
        const library = document.getElementById("candidateLibraryCount");
        const rail = document.getElementById("candidateRailCount");
        if (library) library.textContent = atomic.length;
        if (rail && typeof filteredCandidates === "function") rail.textContent = filteredCandidates().length;
      };
      wrapped.__plannerPatched = true;
      renderCounts = wrapped;
    }
    if (typeof renderCategoryChips === "function" && !renderCategoryChips.__plannerPatched) {
      const wrapped = function plannerCategoryChips() {
        const items = atomicCandidates();
        const counts = new Map();
        items.forEach(item => counts.set(item.category, (counts.get(item.category) || 0) + 1));
        const chips = [["", "全部", items.length], ...Object.entries(CATEGORY_LABELS)
          .filter(([value]) => value !== "regional_challenger_module")
          .map(([value,label]) => [value,label,counts.get(value) || 0])];
        const host = document.getElementById("candidateCategoryChips");
        if (host) host.innerHTML = chips.map(([value,label,count]) => `<button data-category-chip="${esc(value)}" class="category-chip${state.candidateCategory === value ? " active" : ""}"><span${value ? ` class="type-dot" style="background:${COLORS[value]}"` : ""}></span>${esc(label)} <small>${count}</small></button>`).join("");
      };
      wrapped.__plannerPatched = true;
      renderCategoryChips = wrapped;
    }
    if (typeof mapCandidates === "function" && !mapCandidates.__plannerPatched) {
      const base = mapCandidates;
      const wrapped = function plannerMapCandidates() { return base().filter(item => !isRegionalModule(item)); };
      wrapped.__plannerPatched = true;
      mapCandidates = wrapped;
    }
    if (typeof pickerCandidates === "function" && !pickerCandidates.__plannerPatched) {
      const base = pickerCandidates;
      const wrapped = function plannerPickerCandidates() { return base().filter(item => !isRegionalModule(item)); };
      wrapped.__plannerPatched = true;
      pickerCandidates = wrapped;
    }
    document.querySelectorAll('[data-category-chip="regional_challenger_module"]').forEach(node => node.hidden = true);
    document.querySelectorAll('select option[value="regional_challenger_module"]').forEach(option => option.hidden = true);
  }

  function keepCandidateFocus(id) {
    const item = typeof candidateById === "function" ? candidateById(id) : null;
    if (!item || typeof validCoordinates !== "function" || !validCoordinates(item)) return;
    const apply = () => {
      if (state.selectedCandidateId !== id) return;
      if (mapProvider === "google") {
        map.panTo({ lat: item.location.lat, lng: item.location.lon });
        if (!Number.isFinite(map.getZoom?.()) || map.getZoom() < 12) map.setZoom(13);
      } else if (mapProvider === "leaflet" || window.L) {
        const zoom = typeof map.getZoom === "function" ? map.getZoom() : 0;
        if (zoom < 12) map.setView([item.location.lat, item.location.lon], 13, { animate: false });
        else map.panTo([item.location.lat, item.location.lon], { animate: false });
      }
    };
    requestAnimationFrame(apply);
    setTimeout(apply, 120);
    setTimeout(apply, 420);
  }

  function patchCandidateFocus() {
    if (typeof focusCandidate !== "function" || focusCandidate.__plannerPatched) return;
    const base = focusCandidate;
    const wrapped = function plannerFocusCandidate(id, options = {}) {
      base(id, options);
      keepCandidateFocus(id);
    };
    wrapped.__plannerPatched = true;
    focusCandidate = wrapped;
  }

  function keepCompactDetailAfterLiveRefresh() {
    const host = document.getElementById("detailContent");
    const dialog = document.getElementById("detailDialog");
    if (!host || !dialog) return;
    let nudging = false;
    new MutationObserver(() => {
      if (nudging) { nudging = false; return; }
      if (!dialog.open || !state.selectedCandidateId || host.querySelector(".planner-detail-shell")) return;
      if (!host.dataset.compactFor) return;
      host.dataset.compactFor = "";
      nudging = true;
      const marker = document.createComment("planner-detail-refresh");
      host.append(marker);
      marker.remove();
    }).observe(host, { childList: true, subtree: false });
  }

  function init() {
    patchViewSwitching();
    patchCandidateSurfaces();
    patchCandidateFocus();
    keepCompactDetailAfterLiveRefresh();
    if (typeof renderAll === "function") renderAll({ fitMap: false });
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();
