(() => {
  const config = window.GOOGLE_MAPS_CONFIG || {};
  window.googleMapsReady = new Promise(resolve => {
    if (!config.apiKey) {
      resolve(null);
      return;
    }

    const callbackName = "__initHokkaidoGoogleMaps";
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google?.maps || null);
    };

    const params = new URLSearchParams({
      key: config.apiKey,
      v: "weekly",
      loading: "async",
      libraries: "places",
      language: "zh-CN",
      region: "JP",
      callback: callbackName,
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
})();

(() => {
  [
    "planner-enhancements.css?v=20260811-6",
    "planner-itinerary-ui.css?v=20260811-2",
    "planner-round2-regression-fixes.css?v=20260811-1",
  ].forEach(href => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = href;
    document.head.append(css);
  });

  function appReady() {
    try {
      return typeof state !== "undefined" && Array.isArray(state.candidates) && state.candidates.length > 0 &&
        Array.isArray(state.catalog) && state.catalog.length > 0 && typeof map !== "undefined" && Boolean(map) &&
        typeof renderAll === "function" && typeof saveUserState === "function";
    } catch (_) {
      return false;
    }
  }
  function addScript(src, dataKey) {
    if (document.querySelector(`script[data-${dataKey}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset[dataKey.replace(/-([a-z])/g, (_,char) => char.toUpperCase())] = "true";
    document.body.append(script);
  }
  function loadPlannerEnhancements(attempt = 0) {
    if (!appReady()) {
      if (attempt < 120) setTimeout(() => loadPlannerEnhancements(attempt + 1), 100);
      else console.warn("Planner enhancements skipped because the base app did not finish booting.");
      return;
    }
    addScript("planner-enhancements.js?v=20260811-6", "planner-enhancements");
    addScript("planner-custom-types.js?v=20260811-6", "planner-custom-types");
    addScript("planner-runtime-fixes.js?v=20260811-6", "planner-runtime-fixes");
    addScript("planner-itinerary-ui.js?v=20260811-2", "planner-itinerary-ui");
    addScript("planner-round2-regression-fixes.js?v=20260811-2", "planner-round2-regression-fixes");
  }

  window.addEventListener("load", () => loadPlannerEnhancements(), { once: true });
})();
