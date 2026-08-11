import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../web/app.js", import.meta.url), "utf8").replace(/\nboot\(\);\s*$/, "\n");
let request;
const responsePayload = {
  items: [{
    summary: { move: { time: 37, distance: 42000, transit_count: 1, from_time: "2026-09-05T09:03:00+09:00", to_time: "2026-09-05T09:40:00+09:00", reference_fare: { lowest_total_ic: 1230 } } },
    sections: [
      { type: "point", name: "测试起点", coord: { lat: 43.0, lon: 141.0 } },
      { type: "move", move: "walk", time: 7, distance: 450, from_time: "2026-09-05T09:03:00+09:00", to_time: "2026-09-05T09:10:00+09:00" },
      { type: "point", name: "起点站", coord: { lat: 43.01, lon: 141.01 } },
      { type: "move", move: "rapid_train", time: 30, distance: 41550, from_time: "2026-09-05T09:10:00+09:00", to_time: "2026-09-05T09:40:00+09:00", line_name: "快速测试线", transport: { self_name: "快速测试号", color: "#0068b7", company: { name: "测试铁路" }, destination: { name: "终点方向" }, calling_at: { items: [{ name: "中间站一" }, { name: "中间站二" }] } } },
      { type: "point", name: "测试终点", coord: { lat: 43.3, lon: 141.4 } },
    ],
    shapes: { features: [{ geometry: { type: "LineString", coordinates: [[141.0,43.0],[141.2,43.15],[141.4,43.3]] } }] },
  }],
};
const storage = { getItem: key => key === "hokkaido-navitime-rapidapi-key" ? "synthetic-test-key" : null, setItem() {}, removeItem() {} };
const context = {
  window: { ResearchDataAdapter: { unknown: value => value == null } },
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: storage, sessionStorage: { ...storage, getItem: () => null },
  console, Intl, Date, URLSearchParams, Headers, structuredClone, setTimeout, clearTimeout,
  fetch: async (url, options) => { request = { url: String(url), options }; return { ok: true, status: 200, headers: new Headers({ "x-rate-limit-rapid-free-plans-hard-limit-limit": "500", "x-rate-limit-rapid-free-plans-hard-limit-remaining": "487", "x-rate-limit-rapid-free-plans-hard-limit-reset": "100000" }), json: async () => responsePayload }; },
};
vm.createContext(context);
vm.runInContext(`${source}\nstate.routeDraft.dateTime = "2026-09-05T09:00"; state.routeDraft.timeMode = "departure"; state.routeDraft.transitModes = ["RAIL"]; state.routeDraft.transitPreference = "FEWER_TRANSFERS"; this.resultPromise = computeNavitimeTransitRoutes({lat:43,lon:141},{lat:43.3,lon:141.4});`, context);
const routes = await context.resultPromise;
vm.runInContext("this.quotaSnapshot = structuredClone(state.navitimeQuota);", context);

assert.equal(routes.length, 1);
assert.equal(routes[0].provider, "navitime");
assert.equal(routes[0].durationMillis, 37 * 60000);
assert.equal(routes[0].walkingMillis, 7 * 60000);
assert.equal(routes[0].transfers, 1);
assert.equal(routes[0].segments[0].line, "快速测试号");
assert.equal(routes[0].segments[0].departureStop, "起点站");
assert.equal(routes[0].segments[0].arrivalStop, "测试终点");
assert.equal(routes[0].segments[0].stopCount, 2);
assert.match(routes[0].fare, /1,230/);
assert.deepEqual(JSON.parse(JSON.stringify(routes[0].path)), [{lat:43,lng:141},{lat:43.15,lng:141.2},{lat:43.3,lng:141.4}]);
assert.match(request.url, /\/route_transit\?/);
assert.match(request.url, /shape=true/);
assert.match(request.url, /term=1440/);
assert.match(request.url, /limit=5/);
assert.match(request.url, /options=railway_calling_at/);
assert.match(request.url, /order=transit/);
assert.match(request.url, /unuse=/);
assert.equal(request.options.headers["X-RapidAPI-Key"], "synthetic-test-key");
assert.equal(request.options.headers["X-RapidAPI-Host"], "navitime-route-totalnavi.p.rapidapi.com");
assert.ok(!request.url.includes("synthetic-test-key"));
assert.deepEqual(JSON.parse(JSON.stringify(context.quotaSnapshot)), { limit: 500, remaining: 487, resetSeconds: 100000, observedCalls: 13, authoritative: true, updatedAt: context.quotaSnapshot.updatedAt });
assert.match(context.quotaSnapshot.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

vm.runInContext(`state.navitimeQuota = { limit: 500, remaining: null, resetSeconds: null, observedCalls: 0, authoritative: false, updatedAt: null };
updateNavitimeQuota({ ok: true, headers: new Headers({ "x-ratelimit-requests-limit": "0", "x-ratelimit-requests-remaining": "0", "x-ratelimit-requests-reset": "3600" }) });
this.genericZeroQuotaSnapshot = structuredClone(state.navitimeQuota);`, context);
assert.equal(context.genericZeroQuotaSnapshot.authoritative, false);
assert.equal(context.genericZeroQuotaSnapshot.observedCalls, 1);
assert.equal(context.genericZeroQuotaSnapshot.limit, 500);
assert.equal(context.genericZeroQuotaSnapshot.remaining, null);

console.log("NAVITIME adapter test passed: request mapping, quota headers/fallback, fare, stops, timing, and route geometry.");
