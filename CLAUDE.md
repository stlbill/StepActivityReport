# Step Activity Report

> **Read the platform CLAUDE.md first** (`../CLAUDE.md`) — Innergy API, ComputerEase, Railway, auth, and styling are all documented there.

Historical bid-vs-actual report for work orders that entered Innergy workflow steps 17–19 during a date range — even if those WOs have since moved past those steps. Designed for pipeline snapshots: "which jobs were in Staging during May?"

**Live URL:** https://step-activity-report-production.up.railway.app  
**GitHub:** github.com/stlbill/StepActivityReport

## Running Locally

```
node server.js   # http://localhost:3003
```

Or from the monorepo root to start all reports at once:
```
node start-all.js
```

No auth enforced locally (AUTH_USERS not set in dev). API key stored in browser localStorage.

## Files

| File | Purpose |
|---|---|
| `server.js` | Express server (port 3003), auth, Innergy proxy |
| `public/index.html` | UI shell |
| `public/login.html` | Login page (shown before auth middleware) |
| `public/app.js` | All client logic |
| `public/style.css` | Navy/gold styling |
| `data/apikeys.json` | Per-user Innergy API keys (runtime, not in git) |

## Auth

Same pattern as Job Status Report. See `../CLAUDE.md` for full auth docs.

- `express-session` with 8-hour sessions
- Credentials from `AUTH_USERS` env var: `"bill:pass,jane:pass"`
- When `AUTH_USERS` is set: login page enforced, API key stored server-side per user in `data/apikeys.json`, Sign Out button shown
- When `AUTH_USERS` is not set (local dev): no login, API key from browser localStorage

## Railway Deployment

```
railway up --service step-activity-report
```

**Important:** There are two similarly-named Railway projects — `step-activity-report` (correct) and `step-activity` (wrong/empty, can be deleted). Run `railway status` before deploying to confirm the linked project shows the URL `step-activity-report-production.up.railway.app`. If it shows `step-activity` with no URL, re-link: `railway link -p step-activity-report`.

**Environment variables:**

| Variable | Value |
|---|---|
| `AUTH_USERS` | Same users as Job Status |
| `SESSION_SECRET` | Long random string |
| `NODE_ENV` | `production` |

**Volume:** mounted at `/app/data` — keeps `apikeys.json` across redeploys.

**After a `git pull` or rebase:** always run `railway up` again — Railway holds the files from the last upload, not from GitHub, so pulling remote commits doesn't update the live deployment automatically.

## Innergy Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /api/projects` | Full project list (PM, city, state, estimator in custom fields) |
| `GET /api/dateManagement/:projectId` | WOs with step history and LaborItems |
| `GET /api/projects/:projectId/workOrders` | Financial data per WO |

## Step Date Logic (Critical)

**"Entry date" for step N** = the `ActualDate` of the step immediately preceding N in that WO's workflow.

- `step.ActualDate` = when that step was **completed** (WO moved to the next step)
- Steps array in dateManagement only contains steps actually in that WO's workflow — skipped steps are absent
- WOs can skip steps (e.g. step 2 → step 17 directly). If step 17 is the first step in [17–19] that exists, its entry date is the ActualDate of step 2.
- Step 19 is the final step — no steps come after it
- If the preceding step has no ActualDate, the WO hasn't reached step N yet → excluded
- Special case: if no prior steps exist at all, fall back to `wo.ActualStartDate` then `wo.PlannedStartDate`

```js
function getStepEntryDate(wo, targetIdx) {
  const sorted = [...(wo.Steps||[])].sort((a,b) => a.StepIndex - b.StepIndex);
  const prevStep = sorted.filter(s => s.StepIndex < targetIdx).at(-1);
  if (!prevStep) return wo.ActualStartDate || wo.PlannedStartDate || null;
  return prevStep.ActualDate || null;
}
```

**Filter logic:** for each WO, find the FIRST step in [stepFrom, stepTo] that exists in that WO's workflow. Apply the date filter only to that step's entry date. This prevents double-counting WOs that pass through multiple steps in range.

## Confirmed Innergy Field Names

These were verified against real API responses — do not guess alternatives:

| Displayed | Field |
|---|---|
| Grand Total (bid) | `wo.GrandTotalPrice` → `extractCurrency()` |
| Total Actual Cost | `wo.ActualCost` → `extractCurrency()` |
| Material Est | `wo.EstimatedMaterialCost` → `extractCurrency()` |
| Material Actual | `wo.ActualMaterialCost` → `extractCurrency()` |
| Labor Est Cost | `wo.EstimatedLaborCost` → `extractCurrency()` |
| Labor Actual Cost | `wo.ActualLaborCost` → `extractCurrency()` |
| Labor Est Hours | `wo.EstimatedTotalLaborDuration` or `wo.EstimatedLaborDuration` → `parseTimeSpan()` |
| Labor Actual Hours | `wo.ActualLaborHours` (plain decimal — no TimeSpan needed) |
| Expense Actual | `wo.ActualExpensesCost` → `extractCurrency()` (note the 's') |
| Current Step Index | `wo.StepIndex` |
| Current Step Name | `wo.Step` |
| WO Type | `wo.Type` |

**No EstimatedExpenseCost field exists** — expense is not estimated in Innergy. No expense Est or Var columns.

Cost fields return `{ Value, CurrencyCode }` objects — always pass through `extractCurrency()`.
`ActualLaborHours` is a plain decimal, not a TimeSpan string.

## Load Flow

1. Fetch all projects (`/api/projects`)
2. Fetch `dateManagement` for **all** projects — 8 concurrent, shows progress counter
3. `buildRows()` — historical filter: WOs whose entry date into the first in-range step falls in any of `loadDateRanges` (OR logic). Empty array = no date filter.
4. Fetch `workOrders` for **matched projects only** — financial fields + WO type
5. Build filter strip → show dashboard (summary view by default)

With ~150 projects, initial load takes 20–40 seconds. Filters and view toggle are instant (client-side).

## Views

All three views stay in sync — applying any filter updates all views simultaneously.

Three view buttons appear after load:

**Summary (default):** Dashboard with three rows:
- Row 1: Work Orders count, Grand Total Price, Total Actual Cost, Variance $, Variance %
- Row 2: Labor card (Est Hrs, Act Hrs, Hrs Var, Est Cost, Act Cost, Cost Var), Material card (Est, Act, Var), Expense card (Actual only)
- Row 3: By PM table, By Estimator table, By State table — each with WOs, Grand Total Price, Actual, Var $, Var %

**Summary/Detail:** Both panels stacked. Dashboard is capped at 40vh and scrolls within itself so the table is always visible below.

**Detail:** Full sortable/resizable/reorderable table with expandable labor rows per WO. Default sort: Grand Total Price descending.

**Implementation note:** `#dashboard` has `display:flex` in CSS which overrides the HTML `hidden` attribute. View switching uses `style.display` directly (not the `hidden` attribute) to avoid this.

## UI Features

- **Sort** — click any column header; click again to reverse
- **Reorder columns** — drag column header left or right
- **Resize columns** — drag right edge of header; double-click handle to reset
- **Columns ▾** — show/hide individual columns
- **Load Date ▾** (setup strip) — multi-select date panel: rolling (Last 7/30/90 Days), quarters, months, custom range. Selected ranges are OR'd. Controls which WOs `buildRows()` includes; requires clicking Load Report to apply. Preserves selection across loads.
- **Filter strip** — dropdowns for Project, Type, PM, Estimator, State, Labor Type, and Entry Date (all built after load)
  - **Project** dropdown has a search box at the top for quick filtering
  - **Entry Date** uses the same multi-select date panel as Load Date; filters client-side instantly without reloading
  - **Labor Type** only excludes WOs that have labor items but none matching the selection — WOs with zero labor items always pass through, regardless of which labor types are selected
- **Filter Builder** — Innergy-style nested group filter dialog (see `shared/filter-builder.js`). Opens via **Filter ▾** button after load. Supports And / Or / Not And / Not Or logic, arbitrarily nested groups, and Equals / Not Equals / Contains operators. Dialog is draggable and resizable; position and size persist per session via `sessionStorage`.
- **Search** — live text filter on project name/number and WO name/number
- **Exclude** — live text filter that hides WOs/projects whose name or number matches; sits next to Search in the top bar. Cleared by Reset.
- **Expand row** — click any WO row to see per-labor-type breakdown
- **Reset** — clears Search, Exclude, and Entry Date result filter (does not reload data or reset other filter strip dropdowns)

## Date Filter Panel (`makeDateFilterDropdown`)

Reusable function used by both Load Date (setup strip) and Entry Date (filter strip).

```js
const { element, clear } = makeDateFilterDropdown(btnLabel, onRangesChange);
// onRangesChange([{from, to, label}]) fires on every toggle
```

- Chips toggle on/off (gold = selected); panel stays open for multi-select
- Button shows single label if 1 selected, "N selected" for multiples
- Rolling ranges use `today` captured at panel-build time (i.e., at load)
- Custom range replaces any previous custom entry (identified by `label.includes(' – ')`)
- `clear()` deselects all chips and clears custom inputs

## Shared Components

`server.js` serves `./shared/` at `/shared`, so the browser can load:

| File | Purpose |
|---|---|
| `shared/filter-builder.js` | `FilterBuilder` class — nested group filter dialog |
| `shared/filter-builder.css` | Styles for the filter dialog |

The `shared/` directory is committed to this repo (not pulled from the monorepo root). When `reports-platform/shared/` files change, copy them here and commit.

`FilterBuilder.buildFields(rawRows)` builds field definitions (PM, Estimator, State, Type, Project) from loaded data. Fields, operators, and values are all chip-based dropdowns. `onApply` returns `{ rootGroup, filterFn }`.

## Column Preferences

Stored in localStorage under `sar_prefs` (version 8):
- `colOrder`, `hiddenCols`, `colWidths`, `sortCol`, `sortDir`
- Version bump from 7→8 changed default sort to Grand Total Price descending
