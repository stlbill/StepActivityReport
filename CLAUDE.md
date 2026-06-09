# Step Activity Report

> **Read the platform CLAUDE.md first** (`../CLAUDE.md`) — Innergy API, ComputerEase, Railway, auth, and styling are all documented there.

Historical bid-vs-actual report for work orders that entered Innergy workflow steps 17–19 during a date range — even if those WOs have since moved past those steps. Designed for pipeline snapshots: "which jobs were in Staging during May?"

**Live URL:** https://step-activity-report-production.up.railway.app  
**GitHub:** github.com/stlbill/StepActivityReport

## Running Locally

```
npm start   # http://localhost:3003
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

**Environment variables:**

| Variable | Value |
|---|---|
| `AUTH_USERS` | Same users as Job Status |
| `SESSION_SECRET` | Long random string |
| `NODE_ENV` | `production` |

**Volume:** mounted at `/app/data` — keeps `apikeys.json` across redeploys.

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
3. `buildRows()` — historical filter: WOs whose entry date into the first in-range step falls in [fromDate, toDate]
4. Fetch `workOrders` for **matched projects only** — financial fields + WO type
5. Build filter strip → show dashboard (summary view by default)

With ~150 projects, initial load takes 20–40 seconds. Filters and view toggle are instant (client-side).

## Views

Both views stay in sync — applying a filter updates Summary and Detail simultaneously regardless of which is active.

**Summary (default on load):** Dashboard with three rows:
- Row 1: Work Orders count, Grand Total Price, Total Actual Cost, Variance $, Variance %
- Row 2: Labor card (Est Hrs, Act Hrs, Hrs Var, Est Cost, Act Cost, Cost Var), Material card (Est, Act, Var), Expense card (Actual only)
- Row 3: By PM table, By Estimator table, By State table — each with WOs, Grand Total Price, Actual, Var $, Var %

**Detail:** Full sortable/resizable/reorderable table with expandable labor rows per WO. Default sort: Grand Total Price descending.

Toggle with Summary / Detail buttons shown after load.

## UI Features

- **Sort** — click any column header; click again to reverse
- **Reorder columns** — drag column header left or right
- **Resize columns** — drag right edge of header; double-click handle to reset
- **Columns ▾** — show/hide individual columns
- **Filter strip** — dropdowns for Project, Type, PM, Estimator, State, Labor Type (built after load)
- **Filter Builder** — Innergy-style nested group filter dialog (see `shared/filter-builder.js`). Opens via **Filter ▾** button after load. Supports And / Or / Not And / Not Or logic, arbitrarily nested groups, and Equals / Not Equals / Contains operators. Dialog is draggable and resizable; position and size persist per session via `sessionStorage`.
- **Search** — live text filter on project name/number and WO name/number
- **Exclude** — live text filter that hides WOs/projects whose name or number matches; sits next to Search in the top bar. Cleared by Reset.
- **Expand row** — click any WO row to see per-labor-type breakdown
- **Reset** — clears Search, Exclude, and date inputs (does not reload data or reset filter strip dropdowns)

## Shared Components

`server.js` serves `../shared/` at `/shared`, so the browser can load:

| File | Purpose |
|---|---|
| `shared/filter-builder.js` | `FilterBuilder` class — nested group filter dialog |
| `shared/filter-builder.css` | Styles for the filter dialog |

`FilterBuilder.buildFields(rawRows)` builds field definitions (PM, Estimator, State, Type, Project) from loaded data. Fields, operators, and values are all chip-based dropdowns. `onApply` returns `{ rootGroup, filterFn }`.

## Column Preferences

Stored in localStorage under `sar_prefs` (version 8):
- `colOrder`, `hiddenCols`, `colWidths`, `sortCol`, `sortDir`
- Version bump from 7→8 changed default sort to Grand Total Price descending
