import assert from "node:assert/strict";

globalThis.window = { addEventListener() {} };
globalThis.document = { readyState: "loading", addEventListener() {} };

await import("../web/planner-round2-regression-fixes.js");

const helpers = window.PlannerRound2RegressionTestables;
assert.ok(helpers, "round 2 regression helpers should be exposed");

// Saved custom-route times are stored as ISO instants; display them in Japan local time.
assert.equal(helpers.plannerTimeFromValue("2026-09-10T00:30:00Z"), "09:30");
assert.equal(helpers.plannerTimeFromValue("2026-09-10T01:10:00Z"), "10:10");
assert.equal(helpers.plannerDateFromValue("2026-09-09T15:30:00Z"), "2026-09-10");

// Naive datetime-local values must remain unchanged.
assert.equal(helpers.plannerTimeFromValue("2026-09-10T09:30"), "09:30");
assert.equal(helpers.plannerDateFromValue("2026-09-10T09:30"), "2026-09-10");

// Connector-driven custom routes inherit the connector date and useful default times.
assert.deepEqual(
  helpers.connectionCustomTimes("2026-09-10", "09:00", "10:30"),
  { departure: "2026-09-10T09:00", arrival: "2026-09-10T10:30" },
);
assert.deepEqual(
  helpers.connectionCustomTimes("2026-09-10", "09:00", ""),
  { departure: "2026-09-10T09:00", arrival: "2026-09-10T12:00" },
);
assert.equal(helpers.addMinutesToLocalDateTime("2026-09-10T23:30", 180), "2026-09-11T02:30");

// Saved-route connector refreshes must be idempotent so MutationObserver cannot self-trigger forever.
const route = {
  title: "测试路线",
  dateTime: "2026-09-10T00:30:00Z",
  selectedOption: {
    departureTime: "2026-09-10T00:30:00Z",
    arrivalTime: "2026-09-10T01:10:00Z",
  },
};
assert.equal(helpers.savedConnectorLabel(route), "09:30 → 10:10 · 测试路线");
let writes = 0;
const node = {
  _text: "09:30 → 10:10 · 测试路线",
  get textContent() { return this._text; },
  set textContent(value) { writes += 1; this._text = value; },
};
assert.equal(helpers.setTextIfChanged(node, "09:30 → 10:10 · 测试路线"), false);
assert.equal(writes, 0, "same connector label must not write to the DOM");
assert.equal(helpers.setTextIfChanged(node, "09:35 → 10:15 · 测试路线"), true);
assert.equal(writes, 1);
assert.equal(helpers.setTextIfChanged(node, "09:35 → 10:15 · 测试路线"), false);
assert.equal(writes, 1, "second identical refresh must not write again");

// Observe only itinerary root child replacement. Descendant text writes must not feed back into the observer.
assert.deepEqual(helpers.ITINERARY_OBSERVER_OPTIONS, { childList: true });
assert.equal("subtree" in helpers.ITINERARY_OBSERVER_OPTIONS, false);

console.log("planner round 2 regression helpers: ok");
