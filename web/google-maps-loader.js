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
  css.href = "planner-enhancements.css?v=20260811-1";
  document.head.append(css);

  window.addEventListener("load", () => {
    if (document.querySelector('script[data-planner-enhancements]')) return;
    const script = document.createElement("script");
    script.src = "planner-enhancements.js?v=20260811-1";
    script.dataset.plannerEnhancements = "true";
    document.body.append(script);
  }, { once: true });
})();
