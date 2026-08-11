(() => {
  const JAPAN_TIME_ZONE = "Asia/Tokyo";
  const ITINERARY_OBSERVER_OPTIONS = Object.freeze({ childList: true });
  let connectorRefreshQueued = false;

  function hasExplicitZone(value) {
    return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(value || ""));
  }

  function japanParts(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: JAPAN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year && values.month && values.day && values.hour && values.minute ? values : null;
  }

  function plannerDateFromValue(value) {
    const text = String(value || "");
    if (!text) return "";
    if (!hasExplicitZone(text)) return text.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || "";
    const parts = japanParts(text);
    return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
  }

  function plannerTimeFromValue(value) {
    const text = String(value || "");
    if (!text) return "";
    if (!hasExplicitZone(text)) return text.match(/T(\d{2}:\d{2})/)?.[1] || "";
    const parts = japanParts(text);
    return parts ? `${parts.hour}:${parts.minute}` : "";
  }

  function addMinutesToLocalDateTime(value, minutes) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return value || "";
    const [, year, month, day, hour, minute] = match;
    const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) + minutes * 60000;
    return new Date(stamp).toISOString().slice(0, 16);
  }

  function connectionCustomTimes(date, fromTime = "09:00", toTime = "") {
    const departure = `${date}T${fromTime || "09:00"}`;
    const arrival = toTime && toTime > (fromTime || "09:00") ? `${date}T${toTime}` : addMinutesToLocalDateTime(departure, 180);
    return { departure, arrival };
  }

  function routeByIdSafe(id) {
    if (typeof routeById === "function") return routeById(id);
    return typeof state !== "undefined" ? state.savedRoutes?.find(route => route.id === id) || null : null;
  }

  function savedConnectorLabel(route) {
    if (!route) return "";
    const option = route.selectedOption || {};
    const departure = plannerTimeFromValue(option.departureTime || route.dateTime);
    const arrival = plannerTimeFromValue(option.arrivalTime);
    const title = route.title || `${route.origin?.name || "起点"} → ${route.destination?.name || "终点"}`;
    return `${departure}${arrival ? ` → ${arrival}` : ""}${departure || arrival ? " · " : ""}${title}`;
  }

  function setTextIfChanged(node, nextText) {
    if (!node) return false;
    const next = String(nextText ?? "");
    if (node.textContent === next) return false;
    node.textContent = next;
    return true;
  }

  function refreshSavedConnectorTimes(root = document) {
    root.querySelectorAll?.(".planner-v2-connector.saved[data-itinerary-route]").forEach(button => {
      const route = routeByIdSafe(button.dataset.itineraryRoute);
      if (!route) return;
      setTextIfChanged(button.querySelector("small"), savedConnectorLabel(route));
    });
  }

  function scheduleSavedConnectorRefresh(itinerary) {
    if (connectorRefreshQueued) return;
    connectorRefreshQueued = true;
    queueMicrotask(() => {
      connectorRefreshQueued = false;
      refreshSavedConnectorTimes(itinerary);
    });
  }

  function syncCustomRouteDefaults(connectButton) {
    const fromId = connectButton?.dataset?.connectFrom;
    const toId = connectButton?.dataset?.connectTo;
    const date = connectButton?.dataset?.connectDate;
    if (!fromId || !toId || !date || typeof candidateById !== "function") return;
    const from = candidateById(fromId);
    const to = candidateById(toId);
    if (!from || !to) return;
    const fromTime = state.candidatePlans?.[fromId]?.time || "09:00";
    const toTime = state.candidatePlans?.[toId]?.time || "";
    const defaults = connectionCustomTimes(date, fromTime, toTime);
    const departureInput = document.getElementById("customDepartureTime");
    const arrivalInput = document.getElementById("customArrivalTime");
    if (departureInput) departureInput.value = defaults.departure;
    if (arrivalInput) arrivalInput.value = defaults.arrival;
  }

  function clearRouteViewState() {
    document.body?.classList?.remove("route-view-active", "route-details-visible");
  }

  function bindRegressionFixes() {
    document.addEventListener("click", event => {
      const connector = event.target.closest?.("[data-connect-from][data-connect-to][data-connect-date]");
      if (connector) queueMicrotask(() => syncCustomRouteDefaults(connector));

      if (event.target.closest?.("#closeRouteWorkspace,[data-view=\"itinerary\"]")) {
        queueMicrotask(clearRouteViewState);
      }
    }, true);

    const itinerary = document.getElementById("itineraryList");
    if (itinerary) {
      const observer = new MutationObserver(() => scheduleSavedConnectorRefresh(itinerary));
      observer.observe(itinerary, ITINERARY_OBSERVER_OPTIONS);
      refreshSavedConnectorTimes(itinerary);
    }
  }

  function init(attempt = 0) {
    if (typeof state === "undefined" || !document.getElementById("itineraryList")) {
      if (attempt < 100) setTimeout(() => init(attempt + 1), 80);
      return;
    }
    bindRegressionFixes();
  }

  if (typeof window !== "undefined") {
    window.PlannerRound2RegressionTestables = {
      plannerDateFromValue,
      plannerTimeFromValue,
      addMinutesToLocalDateTime,
      connectionCustomTimes,
      savedConnectorLabel,
      setTextIfChanged,
      ITINERARY_OBSERVER_OPTIONS,
    };
    if (document.readyState === "complete") init();
    else window.addEventListener("load", () => init(), { once: true });
  }
})();
