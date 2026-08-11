(() => {
  const isRegionalModule = item => item?.candidate?.entity_type === "regional_module" || item?.candidate?.candidate_type === "regional_module";

  function patchCandidateSurfaces() {
    if (typeof renderCounts === "function" && !renderCounts.__plannerPatched) {
      const base = renderCounts;
      const wrapped = function plannerCounts() {
        base();
        const atomic = state.candidates.filter(item => !isRegionalModule(item));
        const library = document.getElementById("candidateLibraryCount");
        const rail = document.getElementById("candidateRailCount");
        if (library) library.textContent = atomic.length;
        if (rail && typeof filteredCandidates === "function") rail.textContent = filteredCandidates().length;
      };
      wrapped.__plannerPatched = true;
      renderCounts = wrapped;
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
    patchCandidateSurfaces();
    keepCompactDetailAfterLiveRefresh();
    if (typeof renderAll === "function") renderAll({ fitMap: false });
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();
