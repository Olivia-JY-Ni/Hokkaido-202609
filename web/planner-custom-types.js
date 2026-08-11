(() => {
  const TYPE_OPTIONS = [
    ["natural_experience", "自然 / 景观"], ["animal_experience", "动物"], ["event", "活动"],
    ["restaurant", "餐厅"], ["dessert_cafe", "甜品 / 咖啡"], ["lodging", "住宿"], ["onsen", "日归温泉"],
    ["museum", "博物馆"], ["shop", "商店 / 工坊"], ["special_transport", "交通"], ["place", "其他地点"], ["__custom__", "自定义…"],
  ];
  const KNOWN_TYPES = new Set(TYPE_OPTIONS.map(([value]) => value).filter(value => value !== "__custom__"));
  const fromCategory = category => ({
    natural_outdoor: "natural_experience", animal_marine: "animal_experience", event_festival: "event",
    food_market_drink: "restaurant", dessert_cafe_bakery: "dessert_cafe", lodging_onsen: "lodging",
    architecture_museum_shop_workshop: "place", special_transport: "special_transport",
  })[category] || "place";

  function ensureEditor() {
    const form = document.querySelector(".custom-candidate-form");
    if (!form || document.getElementById("plannerCandidateEntityType")) return;
    const categoryLabel = document.getElementById("customCandidateCategory")?.closest("label");
    const label = document.createElement("label");
    label.className = "planner-candidate-type-field";
    label.innerHTML = `<span>地图类型</span><select id="plannerCandidateEntityType">${TYPE_OPTIONS.map(([value,text]) => `<option value="${value}">${text}</option>`).join("")}</select><input id="plannerCandidateCustomType" type="text" placeholder="自定义类型名称" hidden></label>`;
    categoryLabel?.insertAdjacentElement("afterend", label);
  }
  function syncEditor() {
    ensureEditor();
    const select = document.getElementById("plannerCandidateEntityType");
    const custom = document.getElementById("plannerCandidateCustomType");
    if (!select || !custom) return;
    const current = typeof candidateById === "function" ? candidateById(state.candidateEditorId) : null;
    const value = current?.entity_type || fromCategory(document.getElementById("customCandidateCategory")?.value);
    if (KNOWN_TYPES.has(value)) { select.value = value; custom.value = ""; custom.hidden = true; }
    else { select.value = "__custom__"; custom.value = value || ""; custom.hidden = false; }
  }
  function rememberSelection() {
    const select = document.getElementById("plannerCandidateEntityType");
    const custom = document.getElementById("plannerCandidateCustomType");
    if (!select) return;
    const requested = select.value === "__custom__" ? custom?.value.trim() : select.value;
    queueMicrotask(() => {
      const item = typeof candidateById === "function" ? candidateById(state.selectedCandidateId) : null;
      if (!item?.userCreated || !requested) return;
      item.entity_type = requested;
      if (typeof saveUserState === "function") saveUserState();
      if (typeof renderAll === "function") renderAll({ fitMap: false });
    });
  }
  function init() {
    ensureEditor();
    const dialog = document.getElementById("customCandidateDialog");
    if (dialog) new MutationObserver(() => { if (dialog.open) syncEditor(); }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });

  document.addEventListener("change", event => {
    if (event.target.matches("#plannerCandidateEntityType")) {
      const custom = document.getElementById("plannerCandidateCustomType");
      if (custom) custom.hidden = event.target.value !== "__custom__";
    }
    if (event.target.matches("#customCandidateCategory")) {
      const select = document.getElementById("plannerCandidateEntityType");
      if (select && select.value !== "__custom__") select.value = fromCategory(event.target.value);
    }
  });
  document.addEventListener("click", event => {
    if (event.target.closest("#saveCustomCandidate")) rememberSelection();
  }, true);
})();
