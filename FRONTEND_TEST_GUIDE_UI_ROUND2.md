# Frontend test guide — itinerary UI round 2

Target: PR #1 / `agent/trip-planner-ui-v1`

This round adds only itinerary/map UI on top of the existing planner. Do not merge until the checks below pass in a real browser.

## 0. Second browser-pass regressions — must retest

These four issues were found against PR head `94cf92d` and must all pass before merge:

1. **Saved custom-route Japan time:** create/save a custom route for `2026-09-10 09:30–10:10`. Return to `行程`. The connector must show `09:30 → 10:10`, never `00:30 → 01:10` or another UTC-shifted time.
2. **Custom-route date inheritance:** click a `＋ 添加交通` connector on `2026-09-10` with the previous Candidate at `09:00`. Open `＋ 自定义路线`. Its departure must already be on `2026-09-10` (normally `09:00`), and arrival must also default to `2026-09-10` rather than the old `2026-09-05` HTML defaults. If the next Candidate has a later planned time, that time may be used as the arrival default; otherwise a same-connection-day fallback is acceptable.
3. **Mobile sidebar controls:** first save the desktop sidebar as fully collapsed. Then open/reload at `390×844`. The planner panel must remain usable and **no** `‹ / › / ⇤` sidebar width controls may be visible on mobile.
4. **Return-to-itinerary route state:** enter the route workspace from an itinerary connector, then click `← 返回行程`. Confirm `document.body` no longer has `route-view-active` or `route-details-visible`. At mobile width, the itinerary must immediately return to the normal itinerary panel height rather than retaining the route-page `58%` layout.

Do not merge if any of these four regressions remains.

## A. Itinerary transport connectors

1. Give one day at least 3 Candidates with different visit times.
2. With no saved route between two consecutive stops, confirm a light `＋ 添加交通` connector appears between them.
3. Click it. The existing route workspace should open with the previous Candidate as origin, the next Candidate as destination, and that day/time prefilled.
4. Save a route for the pair and return to `行程`.
5. The connector should now display the saved transport duration/time instead of `＋ 添加交通`.
6. Click the saved connector and confirm the existing saved-route behavior/map polyline still works.
7. Existing NAVITIME / Google fallback / custom route functions must remain unchanged.

## B. Compact / expanded itinerary

1. Switch between `紧凑` and `展开` in the itinerary heading.
2. Compact mode should suppress long Candidate summaries and reduce row height.
3. Expanded mode should show the short Candidate summary without turning the day into a dense form.
4. Refresh the page and confirm the chosen density persists.

## C. Day header

1. Day headers show `9月X日 · 周X` plus a concise location/stop summary.
2. Scroll a long itinerary: the current day header should remain sticky inside the left panel.
3. `只看今天` should clear any selected formal area and make the map show only Candidates planned for that date.
4. `＋安排` should open the Candidate library without modifying Candidate data automatically.

## D. Unified map layers

The old three map-layer pills should be hidden. A single `图层` button should open the new panel.

Verify:

- `⭐ 地区` toggles formal/research area stars through the existing area layer.
- `已安排行程地点` can be hidden/shown when no single-day filter is active.
- `未安排地点` can be hidden/shown when no single-day filter is active.
- Date chips cover 9/5 through 9/19; selecting one day shows only that day's planned Candidates.
- While a specific date is selected, planned/unplanned toggles are disabled because the date filter is authoritative.
- Type checkboxes hide/show Candidate types without deleting or editing Candidate records.
- `重置图层` restores areas + planned + unplanned + all dates + all types.
- Close/reopen the layer panel and refresh the page; filters should persist.
- Candidate map-focus regression must remain fixed: clicking a Candidate still holds close zoom after at least 1 second.

## E. Left sidebar width

Desktop only:

1. Toggle normal → narrow → normal. Map should resize without changing the selected Candidate or route.
2. Collapse the sidebar completely. Only the small restore control should remain; the map should expand.
3. Restore the sidebar and confirm it returns to the previous normal/narrow width.
4. Refresh in narrow and collapsed states; preference should persist.
5. Test Google Maps and Leaflet fallback if practical; both should resize correctly.

Mobile safety:

- A desktop-persisted collapsed/narrow preference must not hide the planner on screens <= 720px.
- Sidebar collapse controls are intentionally hidden on mobile in this round.

## F. Regression checks from round 1

Re-run the three previous blockers:

1. No view stacking when switching `行程 / 我的地区 / 全部候选地点`.
2. Candidate counts remain consistent and exclude Regional Modules.
3. Candidate focus remains at close zoom after 1 second.

Also smoke-test Tag persistence, My Info persistence, custom map types, area Candidate expansion, and route query return-to-itinerary.
