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
