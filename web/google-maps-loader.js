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
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "planner-enhancements.css?v=20260811-3";
  document.head.append(css);

  function appReady() {
    try {
      return typeof state !== "undefined" && Array.isArray(state.candidates) && state.candidates.length > 0 &&
        Array.isArray(state.catalog) && state.catalog.length > 0 && typeof map !== "undefined" && Boolean(map) &&
        typeof renderAll === "function" && typeof saveUserState === "function";
    } catch (_) {
      return false;
    }
  }
  function loadPlannerEnhancements(attempt = 0) {
    if (!appReady()) {
      if (attempt < 120) setTimeout(() => loadPlannerEnhancements(attempt + 1), 100);
      else console.warn("Planner enhancements skipped because the base app did not finish booting.");
      return;
    }
    if (!document.querySelector('script[data-planner-enhancements]')) {
      const planner = document.createElement("script");
      planner.src = "planner-enhancements.js?v=20260811-3";
      planner.dataset.plannerEnhancements = "true";
      document.body.append(planner);
    }
    if (!document.querySelector('script[data-planner-custom-types]')) {
      const types = document.createElement("script");
      types.src = "planner-custom-types.js?v=20260811-3";
      types.dataset.plannerCustomTypes = "true";
      document.body.append(types);
    }
  }

  window.addEventListener("load", () => loadPlannerEnhancements(), { once: true });
})();
