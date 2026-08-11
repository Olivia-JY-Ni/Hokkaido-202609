import assert from "node:assert/strict";

globalThis.window = { addEventListener() {} };
globalThis.document = { readyState: "loading", addEventListener() {} };

await import("../web/planner-itinerary-ui.js");

const helpers = window.PlannerItineraryUITestables;
assert.ok(helpers, "planner itinerary helpers should be exposed for tests");

const dates = helpers.dateRange();
assert.equal(dates.length, 15, "trip date range should include 15 days");
assert.equal(dates[0], "2026-09-05");
assert.equal(dates.at(-1), "2026-09-19");
assert.match(helpers.dayLabel("2026-09-05"), /9月5日 · 周六/);
assert.equal(helpers.dateFromISO("2026-09-12T08:30:00+09:00"), "2026-09-12");
assert.equal(helpers.timeFromISO("2026-09-12T08:30:00+09:00"), "08:30");

const candidate = {
  name: "旭岳",
  names: { ja: "旭岳" },
  location: { lat: 43.663, lon: 142.854 },
};
assert.equal(helpers.endpointMatchesCandidate({ name: "旭岳" }, candidate), true);
assert.equal(helpers.endpointMatchesCandidate({ name: "別の場所", lat: 43.6635, lon: 142.8544 }, candidate), true);
assert.equal(helpers.endpointMatchesCandidate({ name: "別の場所", lat: 44.2, lon: 143.2 }, candidate), false);

console.log("planner itinerary UI helpers: ok");
