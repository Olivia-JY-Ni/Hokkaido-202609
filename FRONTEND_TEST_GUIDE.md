# Frontend test guide — Trip Planner UI v1

Target branch: `agent/trip-planner-ui-v1`

This branch changes the planner interaction model without replacing the existing map, Google Places, or NAVITIME engines. Test in a real browser with the same Google Maps / NAVITIME setup used by the current app.

## 0. Blocker regression retest

These three regressions were found in the first browser pass and must all be retested before merge:

1. **Tab isolation:** start on `行程`, switch repeatedly among `我的地区` and `全部候选地点`. Exactly one `.panel-view` may remain visible/active; `行程` must never remain underneath another view.
2. **Candidate count consistency:** the header Candidate count, the `全部` category chip, and the unfiltered Candidate list must use the same atomic-Candidate population. Regional Modules must not be included in any of those three counts.
3. **Candidate map focus:** from `全部候选地点`, click several Candidates with verified coordinates. After clicking, wait at least 1 second. The map must still be centered on the Candidate at close zoom (target 13, never silently returning to the Hokkaido-wide bounds). Repeat with a Candidate opened through `详情` and through an area's expanded Candidate row.

Do not merge if any of these three regressions remains.

## 1. Startup and data safety

- App loads without console errors in both Google Maps mode and Leaflet fallback if practical.
- Existing browser-local areas, custom Candidates, visit times, and saved routes remain present.
- Header shows `9月5日—19日`.
- The Candidate count is not hard-coded and Regional Modules are not counted as normal Candidate places.
- R3/R4 additions from `data/planner_overlay_20260811.json` appear in the place library when missing from the old canonical.
- No existing canonical Candidate is deleted or overwritten by the planner overlay.

## 2. Navigation model

Expected visible tabs:

- `行程`
- `我的地区`
- `全部候选地点`

The old persistent `交通路线` tab should not be visible.

From `行程`, click `＋ 查交通`:

- Existing route planner opens.
- NAVITIME / Google route behavior remains unchanged.
- `← 返回行程` returns to the itinerary.

## 3. Itinerary

- A Candidate with a planned date appears under that date.
- Planned time controls ordering within the day.
- A saved route with departure time appears on the corresponding date.
- Clicking an itinerary Candidate opens/focuses that Candidate.
- Clicking a saved route activates its existing map route.
- If nothing has a date, the empty state is concise and understandable.

## 4. Regional Modules

In `我的地区`:

- A `研究地区` section appears with Regional Modules.
- Research-only regions use an outline star `☆`.
- A region already added to the trip uses a filled star.
- Regional Modules never appear as ordinary Candidate rows, picker rows, or Candidate map dots.
- Secondary research ideas with no `candidate_id` appear only as `还可以看看：…` text.
- Those text-only ideas do not create map markers automatically.
- Clicking a research region focuses the verified matching region when one exists.
- `加入行程` uses the existing region preview/add flow rather than silently adding it.

Important: if a module has no unique verified match in `google_maps_area_catalog.json`, do not expect a guessed map star. The UI should still keep the module in the research-region list.

## 5. Candidate detail

Open several existing Candidates and a browser-created Candidate.

Expected default detail presentation:

- type/icon + name
- `我什么时候去` as a compact planned-time control
- up to four editable Tags
- one short summary
- collapsed `怎么玩`
- collapsed `现场信息`
- `我的信息` section

The old research-status/source/provenance-heavy presentation should not be the normal foreground UI.

### Planned time

- Edit date and time.
- Save.
- Close/reopen detail: value persists.
- Candidate appears at the correct position in `行程`.
- Date picker accepts 2026-09-19.

### Tags

- Add, rename, and delete Tags.
- Maximum foreground display remains compact.
- Close/reopen: changes persist.

### My Info blocks

Click `＋ 添加`:

- Choose a suggested title such as `门票`, `预约`, `取票`, `备注`.
- Enter free text and save.
- Short content displays compactly; longer content remains readable without becoming a form grid.
- Edit an existing block.
- Delete an existing block.
- Use `自定义…` title and verify it persists.

For different map types, check that suggested titles differ appropriately (e.g. lodging vs restaurant vs transport).

### Google live detail refresh

For a Candidate with a Google Place ID:

- Let live Google details load/refresh.
- Confirm the compact planner detail remains in place and does not revert to the old dense detail layout.

## 6. Custom Candidate map types

Create a Candidate from Google Maps.

- The existing research `候选类型` field still works.
- A new `地图类型` field is available.
- Test at least: `住宿`, `日归温泉`, `餐厅`, `甜品 / 咖啡`, `自然 / 景观`, `自定义…`.
- Save, reopen editor, and confirm the selected map type persists.
- Changing map type must not destroy the original broad research category.

## 7. Map markers

- Formal trip regions remain star markers.
- Research-only matched Regional Modules appear as outline stars.
- Lodging Candidates use the lodging semantic marker treatment.
- Day-use onsen uses `♨` treatment.
- Events / special transport use their semantic labels.
- Other existing category colors still work.
- No Regional Module is duplicated as both a star and a Candidate dot.

## 8. Existing route functionality regression

Retest the existing route engine rather than redesigning it:

- NAVITIME search
- Google fallback where available
- departure / arrival time
- alternative routes
- transfer count
- walking duration
- fare display
- segment detail
- custom route creation
- saved route activation on map

Saving a route should make it visible in `行程` when it has a dated departure time.

## 9. Browser persistence

After making edits:

- refresh page
- close/reopen Candidate detail
- switch between tabs

Verify persistence for:

- planned Candidate date/time
- custom Candidates
- custom Candidate map type
- editable Tags
- My Info blocks
- existing areas
- existing saved routes

## Known intentional constraints

- `data/planner_overlay_20260811.json` is additive. It does not destructively replace the old 77-record canonical because old Candidate IDs/history must be preserved.
- New R3/R4 Candidates without separately verified coordinates remain valid library records but should not get fabricated map points.
- Regional Module map stars require a unique verified region match; unresolved modules remain visible in the region list rather than receiving guessed coordinates.
- Research provenance/status remains stored in the underlying data but is intentionally not foregrounded in the planner UI.
