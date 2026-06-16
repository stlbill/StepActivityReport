'use strict';

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val.includes('T') ? val : val + 'T00:00:00');
  if (isNaN(d)) return val;
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
}
function fmtCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(val);
}
function fmtHours(val) {
  if (val == null || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits:1 }).format(val);
}
function fmtPct(val) {
  if (val == null || isNaN(val)) return '—';
  return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function extractCurrency(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && 'Value' in val) return val.Value ?? null;
  return null;
}
// .NET TimeSpan "HH:MM:SS" or "d.HH:MM:SS" → decimal hours
function parseTimeSpan(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return null;
  let days = 0, ts = val;
  const dot = val.indexOf('.');
  if (dot >= 0 && val.indexOf(':') > dot) { days = parseInt(val.slice(0, dot), 10) || 0; ts = val.slice(dot + 1); }
  const [h, m, s] = ts.split(':');
  const hh = parseInt(h,10), mm = parseInt(m,10), ss = parseFloat(s||'0');
  if (isNaN(hh)||isNaN(mm)) return null;
  return days * 24 + hh + mm/60 + ss/3600;
}
function toD(str) {
  if (!str) return null;
  return new Date(str.includes('T') ? str : str + 'T00:00:00');
}

// ── Labor totals — dynamic, respects selectedLaborTypes ──────────────────────
function calcLaborTotals(row) {
  if (selectedLaborTypes === null) {
    const items = row.laborItems;
    return {
      estHrs:          row.nativeLaborEstHrs  ?? (items.length ? items.reduce((s,i) => s+(parseTimeSpan(i.EstimatedHours) ??0),0) : null),
      actualHrs:       row.nativeLaborActHrs  ?? (items.length ? items.reduce((s,i) => s+(parseTimeSpan(i.ActualHours)    ??0),0) : null),
      estLaborCost:    row.nativeLaborEstCost ?? (items.length ? items.reduce((s,i) => s+(extractCurrency(i.EstimatedCost)??0),0) : null),
      actualLaborCost: row.nativeLaborActCost ?? (items.length ? items.reduce((s,i) => s+(extractCurrency(i.ActualCost)   ??0),0) : null),
    };
  }
  const filtered = row.laborItems.filter(i => selectedLaborTypes.has(i.Name));
  return {
    estHrs:          filtered.reduce((s,i) => s+(parseTimeSpan(i.EstimatedHours) ??0),0),
    actualHrs:       filtered.reduce((s,i) => s+(parseTimeSpan(i.ActualHours)    ??0),0),
    estLaborCost:    filtered.reduce((s,i) => s+(extractCurrency(i.EstimatedCost)??0),0),
    actualLaborCost: filtered.reduce((s,i) => s+(extractCurrency(i.ActualCost)   ??0),0),
  };
}

// ── Column definitions ────────────────────────────────────────────────────────
const ALL_COLS = [
  { key:'project',        label:'Project',         align:'left',   width:260,
    getValue:  r => r.project.Name,
    sortValue: r => r.project.Name||'' },
  { key:'woNum',          label:'WO #',            align:'left',   width:90,
    getValue:  r => r.wo.Number||'—',
    sortValue: r => r.wo.Number||'' },
  { key:'woName',         label:'WO Name',         align:'left',   width:200,
    getValue:  r => r.wo.Name||'—',
    sortValue: r => r.wo.Name||'' },
  { key:'currentStep',    label:'Entry Step',      align:'left',   width:160,
    getValue:  r => r.currentStepIndex ? `${r.currentStepIndex} — ${r.currentStepName}` : '—',
    sortValue: r => r.currentStepIndex ?? -Infinity },
  { key:'stepDate',       label:'Entry Date',      align:'center', width:110,
    getValue:  r => r.stepStartDate ? fmtDate(r.stepStartDate) : '—',
    sortValue: r => r.stepStartDate||'' },
  { key:'curStep',        label:'Current Step',    align:'left',   width:160,
    getValue:  r => r.curStepIndex != null ? `${r.curStepIndex} — ${r.curStepName||''}` : '—',
    sortValue: r => r.curStepIndex ?? -Infinity },
  { key:'grandTotal',     label:'Grand Total',     align:'right',  width:115,
    getValue:  r => r.grandTotal != null ? fmtCurrency(r.grandTotal) : '—',
    sortValue: r => r.grandTotal ?? -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r) => s+(r.grandTotal??0),0)) },
  { key:'totalActualCost',label:'Total Actual Cost',align:'right',  width:130,
    getValue:  r => r.totalActualCost != null ? fmtCurrency(r.totalActualCost) : '—',
    sortValue: r => r.totalActualCost ?? -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r) => s+(r.totalActualCost??0),0)) },
  { key:'totalVar',       label:'Total Var $',     align:'right',  width:110, varCol:true,
    getValue:  r => r.grandTotal==null||r.totalActualCost==null ? '—' : fmtCurrency(r.grandTotal - r.totalActualCost),
    sortValue: r => r.grandTotal!=null&&r.totalActualCost!=null ? r.grandTotal-r.totalActualCost : -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r)=>s+(r.grandTotal??0),0)-rows.reduce((s,r)=>s+(r.totalActualCost??0),0)) },
  { key:'totalVarPct',    label:'Total Var %',     align:'right',  width:85,  varCol:true,
    getValue:  r => !r.grandTotal||r.totalActualCost==null ? '—' : fmtPct((r.grandTotal-r.totalActualCost)/r.grandTotal*100),
    sortValue: r => r.grandTotal&&r.totalActualCost!=null ? (r.grandTotal-r.totalActualCost)/r.grandTotal*100 : -Infinity },
  { key:'estHrs',         label:'Est Hrs',         align:'right',  width:85,
    getValue:  r => { const {estHrs}    = calcLaborTotals(r); return estHrs    != null ? fmtHours(estHrs)    : '—'; },
    sortValue: r => calcLaborTotals(r).estHrs    ?? -Infinity,
    footerFn:  rows => fmtHours(rows.reduce((s,r) => s+(calcLaborTotals(r).estHrs    ??0),0)) },
  { key:'actualHrs',      label:'Actual Hrs',      align:'right',  width:85,
    getValue:  r => { const {actualHrs} = calcLaborTotals(r); return actualHrs != null ? fmtHours(actualHrs) : '—'; },
    sortValue: r => calcLaborTotals(r).actualHrs ?? -Infinity,
    footerFn:  rows => fmtHours(rows.reduce((s,r) => s+(calcLaborTotals(r).actualHrs ??0),0)) },
  { key:'hrsVar',         label:'Hrs Var',         align:'right',  width:80,  varCol:true,
    getValue:  r => { const {estHrs,actualHrs} = calcLaborTotals(r); return estHrs==null||actualHrs==null?'—':fmtHours(estHrs-actualHrs); },
    sortValue: r => { const {estHrs,actualHrs} = calcLaborTotals(r); return estHrs!=null&&actualHrs!=null?estHrs-actualHrs:-Infinity; },
    footerFn:  rows => fmtHours(rows.reduce((s,r)=>s+(calcLaborTotals(r).estHrs??0),0)-rows.reduce((s,r)=>s+(calcLaborTotals(r).actualHrs??0),0)) },
  { key:'estLaborCost',   label:'Est Labor',       align:'right',  width:110, defaultHidden:true,
    getValue:  r => { const {estLaborCost}    = calcLaborTotals(r); return estLaborCost    != null ? fmtCurrency(estLaborCost)    : '—'; },
    sortValue: r => calcLaborTotals(r).estLaborCost    ?? -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r) => s+(calcLaborTotals(r).estLaborCost    ??0),0)) },
  { key:'actualLaborCost',label:'Actual Labor',    align:'right',  width:110, defaultHidden:true,
    getValue:  r => { const {actualLaborCost} = calcLaborTotals(r); return actualLaborCost != null ? fmtCurrency(actualLaborCost) : '—'; },
    sortValue: r => calcLaborTotals(r).actualLaborCost ?? -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r) => s+(calcLaborTotals(r).actualLaborCost??0),0)) },
  { key:'laborVar',       label:'Labor Var $',     align:'right',  width:105, varCol:true, defaultHidden:true,
    getValue:  r => { const {estLaborCost,actualLaborCost} = calcLaborTotals(r); return estLaborCost==null||actualLaborCost==null?'—':fmtCurrency(estLaborCost-actualLaborCost); },
    sortValue: r => { const {estLaborCost,actualLaborCost} = calcLaborTotals(r); return estLaborCost!=null&&actualLaborCost!=null?estLaborCost-actualLaborCost:-Infinity; },
    footerFn:  rows => fmtCurrency(rows.reduce((s,r)=>s+(calcLaborTotals(r).estLaborCost??0),0)-rows.reduce((s,r)=>s+(calcLaborTotals(r).actualLaborCost??0),0)) },
  { key:'mtlEst',         label:'Mtl Est',         align:'right',  width:105, defaultHidden:true,
    getValue:  r => r.mtlEst    != null ? fmtCurrency(r.mtlEst)    : '—',
    sortValue: r => r.mtlEst    ?? -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r)=>s+(r.mtlEst??0),0)) },
  { key:'mtlActual',      label:'Mtl Actual',      align:'right',  width:105, defaultHidden:true,
    getValue:  r => r.mtlActual != null ? fmtCurrency(r.mtlActual) : '—',
    sortValue: r => r.mtlActual ?? -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r)=>s+(r.mtlActual??0),0)) },
  { key:'mtlVar',         label:'Mtl Var $',       align:'right',  width:100, varCol:true, defaultHidden:true,
    getValue:  r => r.mtlEst==null||r.mtlActual==null?'—':fmtCurrency(r.mtlEst-r.mtlActual),
    sortValue: r => r.mtlEst!=null&&r.mtlActual!=null?r.mtlEst-r.mtlActual:-Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r)=>s+(r.mtlEst??0),0)-rows.reduce((s,r)=>s+(r.mtlActual??0),0)) },
  { key:'expActual',      label:'Actual Expense',  align:'right',  width:115, defaultHidden:true,
    getValue:  r => r.expActual != null ? fmtCurrency(r.expActual) : '—',
    sortValue: r => r.expActual ?? -Infinity,
    footerFn:  rows => fmtCurrency(rows.reduce((s,r)=>s+(r.expActual??0),0)) },
  { key:'pm',             label:'Project Manager', align:'left',   width:155,
    getValue:  r => r.pm||'—',        sortValue: r => r.pm||'' },
  { key:'city',           label:'City',            align:'left',   width:110, defaultHidden:true,
    getValue:  r => r.city||'—',      sortValue: r => r.city||'' },
  { key:'state',          label:'State',           align:'center', width:65,
    getValue:  r => r.state||'—',     sortValue: r => r.state||'' },
  { key:'estimator',      label:'Estimator',       align:'left',   width:150,
    getValue:  r => r.estimator||'—', sortValue: r => r.estimator||'' },
  { key:'woType',         label:'Type',            align:'left',   width:110, defaultHidden:true,
    getValue:  r => r.woType||'—',    sortValue: r => r.woType||'' },
];

const COL_MAP = Object.fromEntries(ALL_COLS.map(c => [c.key, c]));
const DEFAULT_COL_ORDER = ALL_COLS.map(c => c.key);

// ── State ─────────────────────────────────────────────────────────────────────
const PREFS_VERSION   = 8;
const PREFS_KEY       = 'sar_prefs';
const API_KEY_STORAGE = 'sar_api_key';

let apiKey      = localStorage.getItem(API_KEY_STORAGE) || '';
let allProjects = [];
let rawRows     = [];
let dmCache     = new Map(); // projectId → WO[] from dateManagement

let colOrder   = [...DEFAULT_COL_ORDER];
let hiddenCols = new Set(ALL_COLS.filter(c => c.defaultHidden).map(c => c.key));
let colWidths  = {}; // per-key width overrides, persisted in prefs
let sortCol    = 'grandTotal';
let sortDir    = -1; // descending — highest Grand Total Price first

let selectedPMs        = null;
let selectedEstimators = null;
let selectedStates     = null;
let selectedTypes      = null;
let selectedLaborTypes = null;
let selectedProjects   = null;

let resultDateRanges = []; // [{from, to, label}] — OR'd together
let loadDateRanges   = []; // same shape, used by buildRows at load time
let _clearResultDate = null;

let fbFilterFn  = null; // active filter function (null = no filter)
let fbRootGroup = null; // saved tree for re-opening the dialog

const expandedRows = new Set();
let viewMode = 'summary';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const apiKeyInput   = document.getElementById('api-key-input');
const saveKeyBtn    = document.getElementById('save-key-btn');
const keyStatus     = document.getElementById('key-status');
const stepFromInput = document.getElementById('step-from');
const stepToInput   = document.getElementById('step-to');
const searchInput   = document.getElementById('search-input');
const excludeInput  = document.getElementById('exclude-input');
const refreshBtn    = document.getElementById('refresh-btn');
const resetBtn      = document.getElementById('reset-btn');
const colsBtn       = document.getElementById('cols-btn');
const colsDropdown  = document.getElementById('cols-dropdown');
const colsList      = document.getElementById('cols-list');
const filterStrip   = document.getElementById('filter-strip');
const filterBtn     = document.getElementById('filter-btn');
const statusBar     = document.getElementById('status-bar');
const noDataMsg     = document.getElementById('no-data-msg');
const tableScroll   = document.getElementById('table-scroll');
const mainColgroup  = document.getElementById('main-colgroup');
const mainThead     = document.getElementById('main-thead');
const mainTbody     = document.getElementById('main-tbody');
const mainTfoot     = document.getElementById('main-tfoot');
const viewBar       = document.getElementById('view-bar');
const dashboard     = document.getElementById('dashboard');
const btnSummary    = document.getElementById('btn-summary');
const btnCombined   = document.getElementById('btn-combined');
const btnDetail     = document.getElementById('btn-detail');

// ── Prefs ─────────────────────────────────────────────────────────────────────
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({
    version:PREFS_VERSION, colOrder, hiddenCols:[...hiddenCols], colWidths, sortCol, sortDir
  }));
}
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY)||'{}');
    if (p.version !== PREFS_VERSION) return;
    if (Array.isArray(p.colOrder) && p.colOrder.length) {
      const saved   = p.colOrder.filter(k => COL_MAP[k]);
      const newKeys = DEFAULT_COL_ORDER.filter(k => !saved.includes(k));
      colOrder = [...saved, ...newKeys];
    }
    if (Array.isArray(p.hiddenCols)) hiddenCols = new Set(p.hiddenCols.filter(k => COL_MAP[k]));
    if (p.colWidths && typeof p.colWidths === 'object') colWidths = p.colWidths;
    if (p.sortCol && COL_MAP[p.sortCol]) sortCol = p.sortCol;
    if (typeof p.sortDir === 'number')   sortDir  = p.sortDir;
  } catch { /* ignore invalid saved prefs */ }
}

// ── Project field extraction ──────────────────────────────────────────────────
function getField(obj, ...paths) {
  for (const path of paths) {
    let v = obj;
    for (const p of path.split('.')) v = v?.[p];
    if (v != null && v !== '') return String(v);
  }
  return '';
}
function getPM(p)        { return getField(p, 'ProjectManager.FullName', 'ProjectManager'); }
function getCity(p)      { return getField(p, 'City', 'Address.City', 'JobCity'); }
function getState(p)     { return getField(p, 'State', 'Address.State', 'JobState'); }
function getEstimator(p) {
  const arr = p.Estimators || [];
  if (arr.length) return arr.map(e => e.FullName||e.Name||'').filter(Boolean).join(', ');
  return getField(p, 'Estimator.FullName', 'Estimator', 'LeadEstimator.FullName');
}

// ── Step date logic ───────────────────────────────────────────────────────────
// step.ActualDate = when that step was COMPLETED (WO moved to next step).
// Entry into step N = ActualDate of the step IMMEDIATELY BEFORE N in this WO's workflow.
// If that preceding step has no ActualDate the WO hasn't reached N yet → return null.
function getStepEntryDate(wo, targetIdx) {
  const sorted = [...(wo.Steps||[])].sort((a,b) => a.StepIndex - b.StepIndex);
  const prevStep = sorted.filter(s => s.StepIndex < targetIdx).at(-1);
  if (!prevStep) {
    // targetIdx is the first step in this workflow — use WO start date
    return wo.ActualStartDate || wo.PlannedStartDate || null;
  }
  // WO has entered targetIdx only if the immediately preceding step is completed
  return prevStep.ActualDate || null;
}

// Historical filter: WOs that ENTERED any step in [stepFrom,stepTo] during any of dateRanges.
// Includes WOs that have since moved past those steps.
function buildRows(stepFrom, stepTo, dateRanges) {
  const rows = [];
  for (const [projectId, wos] of dmCache) {
    const project = allProjects.find(p => p.Id === projectId);
    if (!project) continue;
    for (const wo of wos) {
      if (!wo.Steps?.length) continue;

      // Find the FIRST step in [stepFrom,stepTo] that exists in this WO's workflow.
      // Date filter applies only to that entry gate — a WO that entered step 17 in
      // February is excluded even if it progressed to step 18 during the date range.
      let firstStep = null;
      for (let n = stepFrom; n <= stepTo; n++) {
        const step = wo.Steps.find(s => s.StepIndex === n);
        if (step) { firstStep = { n, step }; break; }
      }
      if (!firstStep) continue;

      const entryStr = getStepEntryDate(wo, firstStep.n);
      if (!entryStr) continue;

      if (dateRanges.length) {
        const d = toD(entryStr);
        if (!d || !dateRanges.some(r => (!r.from || d >= r.from) && (!r.to || d <= r.to))) continue;
      }

      const matched = { idx: firstStep.n, name: firstStep.step.Name || '', entryStr };
      if (!matched) continue;

      rows.push({
        project,
        wo:               { Number: wo.Number, Name: wo.Name || '' },
        laborItems:       wo.LaborItems || [],
        stepStartDate:    matched.entryStr,
        currentStepIndex: matched.idx,
        currentStepName:  matched.name,
        grandTotal:       null,
        totalActualCost:  null,
        mtlEst:           null,
        mtlActual:        null,
        nativeLaborEstCost: null,
        nativeLaborActCost: null,
        nativeLaborEstHrs:  null,
        nativeLaborActHrs:  null,
        woType:           null,
        curStepIndex:     null,
        curStepName:      '',
        expActual:        null,
        pm:        getPM(project),
        city:      getCity(project),
        state:     getState(project),
        estimator: getEstimator(project),
      });
    }
  }
  return rows;
}

// ── View toggle ───────────────────────────────────────────────────────────────
function setViewMode(mode) {
  viewMode = mode;
  btnSummary.classList.toggle('active',  mode === 'summary');
  btnCombined.classList.toggle('active', mode === 'combined');
  btnDetail.classList.toggle('active',   mode === 'detail');
  // Remove HTML hidden attrs so style.display takes full control (hidden attr persists across toggles)
  dashboard.removeAttribute('hidden');
  tableScroll.removeAttribute('hidden');
  dashboard.style.display   = (mode === 'detail')  ? 'none' : 'flex';
  tableScroll.style.display = (mode === 'summary') ? 'none' : '';
  document.getElementById('table-wrap').classList.toggle('combined-mode', mode === 'combined');
  if (mode !== 'detail') noDataMsg.hidden = true;
}
function renderCurrentView() {
  if (!rawRows.length) return;
  if (viewMode !== 'detail') noDataMsg.hidden = true;
  // Always render both so switching modes instantly shows current filters.
  renderDashboard();
  renderTable();
}
btnSummary.addEventListener('click',  () => { setViewMode('summary');  renderDashboard(); });
btnCombined.addEventListener('click', () => { setViewMode('combined'); renderDashboard(); renderTable(); });
btnDetail.addEventListener('click',   () => { setViewMode('detail');   renderTable(); });

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const rows = applyFilters(rawRows);
  dashboard.innerHTML = '';

  // ── Row 1: Key metrics ────────────────────────────────────────────────────
  const totBid    = rows.reduce((s,r) => s+(r.grandTotal??0),0);
  const totAct    = rows.reduce((s,r) => s+(r.totalActualCost??0),0);
  const totVar    = totBid - totAct;
  const totVarPct = totBid ? totVar/totBid*100 : null;

  const metricsRow = document.createElement('div');
  metricsRow.className = 'dash-metrics';
  [
    { label:'Work Orders',       value: rows.length,  fmt: v => v.toLocaleString(), isVar:false },
    { label:'Grand Total Price', value: totBid,       fmt: fmtCurrency,              isVar:false },
    { label:'Total Actual Cost', value: totAct,       fmt: fmtCurrency,              isVar:false },
    { label:'Variance',          value: totVar,       fmt: fmtCurrency,              isVar:true  },
    { label:'Variance %',        value: totVarPct,    fmt: fmtPct,                   isVar:true  },
  ].forEach(m => metricsRow.appendChild(makeMetricCard(m)));
  dashboard.appendChild(metricsRow);

  // ── Row 2: Labor / Material / Expense ─────────────────────────────────────
  const totEstHrs = rows.reduce((s,r) => s+(calcLaborTotals(r).estHrs        ??0),0);
  const totActHrs = rows.reduce((s,r) => s+(calcLaborTotals(r).actualHrs     ??0),0);
  const totEstLbr = rows.reduce((s,r) => s+(calcLaborTotals(r).estLaborCost  ??0),0);
  const totActLbr = rows.reduce((s,r) => s+(calcLaborTotals(r).actualLaborCost??0),0);
  const totMtlEst = rows.reduce((s,r) => s+(r.mtlEst   ??0),0);
  const totMtlAct = rows.reduce((s,r) => s+(r.mtlActual??0),0);
  const totExpAct = rows.reduce((s,r) => s+(r.expActual??0),0);

  const costsRow = document.createElement('div');
  costsRow.className = 'dash-costs';
  costsRow.appendChild(makeCostCard('Labor', [
    { label:'Est Hours',      value: totEstHrs,          fmt: fmtHours    },
    { label:'Act Hours',      value: totActHrs,          fmt: fmtHours    },
    { label:'Hours Variance', value: totEstHrs-totActHrs, fmt: fmtHours,    isVar:true },
    { label:'Est Cost',       value: totEstLbr,          fmt: fmtCurrency  },
    { label:'Act Cost',       value: totActLbr,          fmt: fmtCurrency  },
    { label:'Cost Variance',  value: totEstLbr-totActLbr, fmt: fmtCurrency, isVar:true },
  ]));
  costsRow.appendChild(makeCostCard('Material', [
    { label:'Estimated', value: totMtlEst,             fmt: fmtCurrency },
    { label:'Actual',    value: totMtlAct,             fmt: fmtCurrency },
    { label:'Variance',  value: totMtlEst-totMtlAct,  fmt: fmtCurrency, isVar:true },
  ]));
  costsRow.appendChild(makeCostCard('Expense', [
    { label:'Actual', value: totExpAct, fmt: fmtCurrency },
  ]));
  dashboard.appendChild(costsRow);

  // ── Row 3: Breakdown tables ───────────────────────────────────────────────
  const breakRow = document.createElement('div');
  breakRow.className = 'dash-breakdowns';
  breakRow.appendChild(makeBreakdownTable('By Project Manager', rows, r => r.pm));
  breakRow.appendChild(makeBreakdownTable('By Estimator',       rows, r => r.estimator));
  breakRow.appendChild(makeBreakdownTable('By State',           rows, r => r.state));
  dashboard.appendChild(breakRow);
}

function makeMetricCard({ label, value, fmt, isVar }) {
  const card = document.createElement('div');
  card.className = 'dash-metric-card';
  const lbl = document.createElement('div'); lbl.className = 'dash-metric-label'; lbl.textContent = label;
  const val = document.createElement('div'); val.className = 'dash-metric-value';
  val.textContent = value != null ? fmt(value) : '—';
  if (isVar && value != null) val.classList.add(value >= 0 ? 'var-pos' : 'var-neg');
  card.appendChild(lbl); card.appendChild(val);
  return card;
}

function makeCostCard(title, lines) {
  const card = document.createElement('div'); card.className = 'dash-cost-card';
  const hdr  = document.createElement('div'); hdr.className = 'dash-cost-title'; hdr.textContent = title;
  card.appendChild(hdr);
  for (const { label, value, fmt, isVar } of lines) {
    const row = document.createElement('div'); row.className = 'dash-cost-row';
    const lbl = document.createElement('span'); lbl.className = 'dash-cost-label'; lbl.textContent = label;
    const val = document.createElement('span'); val.className = 'dash-cost-val';
    val.textContent = value != null ? fmt(value) : '—';
    if (isVar && value != null) val.classList.add(value >= 0 ? 'var-pos' : 'var-neg');
    row.appendChild(lbl); row.appendChild(val); card.appendChild(row);
  }
  return card;
}

function makeBreakdownTable(title, rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r) || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const groups = [...map.entries()].map(([name, gr]) => {
    const bid    = gr.reduce((s,r) => s+(r.grandTotal??0),0);
    const actual = gr.reduce((s,r) => s+(r.totalActualCost??0),0);
    const vari   = bid - actual;
    const varPct = bid ? vari/bid*100 : null;
    return { name, count: gr.length, bid, actual, vari, varPct };
  }).sort((a,b) => b.bid - a.bid);

  const wrap = document.createElement('div'); wrap.className = 'dash-breakdown';
  const hdr  = document.createElement('div'); hdr.className = 'dash-breakdown-title'; hdr.textContent = title;
  wrap.appendChild(hdr);

  const tbl = document.createElement('table'); tbl.className = 'dash-breakdown-table';
  tbl.innerHTML = `<thead><tr><th>Name</th><th class="r">WOs</th><th class="r">Grand Total Price</th><th class="r">Actual</th><th class="r">Var $</th><th class="r">Var %</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  for (const g of groups) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(g.name)}</td><td class="r">${g.count}</td><td class="r">${fmtCurrency(g.bid)}</td><td class="r">${fmtCurrency(g.actual)}</td><td class="r ${g.vari>=0?'var-pos':'var-neg'}">${fmtCurrency(g.vari)}</td><td class="r ${g.varPct!=null&&g.varPct>=0?'var-pos':'var-neg'}">${g.varPct!=null?fmtPct(g.varPct):'—'}</td>`;
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
  return wrap;
}

// ── Filter Builder ────────────────────────────────────────────────────────────
const fb = new FilterBuilder({
  onApply({ rootGroup, filterFn }) {
    fbRootGroup = rootGroup;
    fbFilterFn  = filterFn;
    filterBtn.classList.toggle('active', !!fbFilterFn);
    const count = filterFn ? fb._countActive(rootGroup) : 0;
    filterBtn.textContent = count ? `Filter (${count}) ▾` : 'Filter ▾';
    if (rawRows.length) renderCurrentView();
  },
});

filterBtn.addEventListener('click', () => {
  fb.open(FilterBuilder.buildFields(rawRows), fbRootGroup);
});

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters(rows) {
  const q  = searchInput.value.trim().toLowerCase();
  const ex = excludeInput.value.trim().toLowerCase();
  return rows.filter(r => {
    const projStr = (r.project.Number+' '+r.project.Name).toLowerCase();
    const woStr   = (r.wo.Number+' '+(r.wo.Name||'')).toLowerCase();
    if (q  && !projStr.includes(q)  && !woStr.includes(q))  return false;
    if (ex && (projStr.includes(ex) || woStr.includes(ex)))  return false;
    if (selectedProjects   && !selectedProjects.has(r.project.Name))             return false;
    if (selectedPMs        && !selectedPMs.has(r.pm))                            return false;
    if (selectedEstimators && !selectedEstimators.has(r.estimator))              return false;
    if (selectedStates     && !selectedStates.has(r.state))                      return false;
    if (selectedTypes      && r.woType && !selectedTypes.has(r.woType))          return false;
    if (selectedLaborTypes && !r.laborItems.some(i => selectedLaborTypes.has(i.Name))) return false;
    if (resultDateRanges.length) {
      const d = r.stepStartDate ? toD(r.stepStartDate) : null;
      if (!d || !resultDateRanges.some(rng =>
        (!rng.from || d >= rng.from) && (!rng.to || d <= rng.to)
      )) return false;
    }
    if (fbFilterFn && !fbFilterFn(r)) return false;
    return true;
  });
}

function sortRows(rows) {
  const col = COL_MAP[sortCol];
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const av = col.sortValue(a), bv = col.sortValue(b);
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTable() {
  const rows = sortRows(applyFilters(rawRows));
  if (!rows.length) {
    if (viewMode === 'detail' || viewMode === 'combined') {
      tableScroll.removeAttribute('hidden');
      tableScroll.style.display = 'none';
      noDataMsg.hidden = false;
      noDataMsg.textContent = 'No work orders match the current filters.';
    }
    return;
  }
  if (viewMode === 'detail' || viewMode === 'combined') {
    noDataMsg.hidden = true;
    tableScroll.removeAttribute('hidden');
    tableScroll.style.display = '';
  }
  renderColgroup(); renderHeader(); renderBody(rows); renderFooter(rows);
}

function visibleCols() { return colOrder.filter(k => COL_MAP[k] && !hiddenCols.has(k)); }

function renderColgroup() {
  mainColgroup.innerHTML = '';
  const e = document.createElement('col'); e.style.width = '28px'; mainColgroup.appendChild(e);
  for (const key of visibleCols()) {
    const col = document.createElement('col');
    col.style.width = (colWidths[key] ?? COL_MAP[key].width) + 'px';
    mainColgroup.appendChild(col);
  }
}

let draggedColKey = null;
let isResizing    = false;

function makeResizeHandler(key) {
  return function(e) {
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;
    const startX  = e.clientX;
    const startW  = colWidths[key] ?? COL_MAP[key].width;
    const colIdx  = visibleCols().indexOf(key) + 1; // +1 for expand col
    const colEl   = mainColgroup.querySelectorAll('col')[colIdx];
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev) {
      const w = Math.max(40, startW + (ev.clientX - startX));
      colWidths[key] = w;
      if (colEl) colEl.style.width = w + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      savePrefs();
      // defer reset so the th click handler can check it first
      requestAnimationFrame(() => { isResizing = false; });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
}

function renderHeader() {
  mainThead.innerHTML = '';
  const tr = document.createElement('tr');
  const thX = document.createElement('th'); thX.style.cssText = 'cursor:default;width:28px'; tr.appendChild(thX);
  for (const key of visibleCols()) {
    const def = COL_MAP[key]; const th = document.createElement('th');
    th.dataset.col = key; th.draggable = true;
    if (def.align==='right')  th.style.textAlign = 'right';
    if (def.align==='center') th.style.textAlign = 'center';

    const label = document.createElement('span');
    label.textContent = def.label + (sortCol===key ? (sortDir===1?' ▲':' ▼') : '');
    label.draggable = false; // prevent text-drag interfering with column-drag
    th.appendChild(label);

    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    handle.draggable = false;
    handle.addEventListener('mousedown', makeResizeHandler(key));
    handle.addEventListener('click',  e => e.stopPropagation());
    handle.addEventListener('dblclick', e => {
      e.stopPropagation();
      delete colWidths[key];
      savePrefs();
      renderTable();
    });
    th.appendChild(handle);

    th.addEventListener('click', () => {
      if (draggedColKey || isResizing) return;
      sortDir = sortCol===key ? sortDir*-1 : 1; sortCol = key;
      savePrefs(); renderTable();
    });
    th.addEventListener('dragstart', e => {
      if (isResizing) { e.preventDefault(); return; }
      draggedColKey = key; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key);
      setTimeout(() => th.classList.add('dragging'), 0);
    });
    th.addEventListener('dragend', () => {
      draggedColKey = null; th.classList.remove('dragging');
      mainThead.querySelectorAll('th').forEach(t => t.classList.remove('drag-over'));
    });
    th.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      mainThead.querySelectorAll('th').forEach(t => t.classList.remove('drag-over'));
      if (key !== draggedColKey) th.classList.add('drag-over');
    });
    // only clear highlight when the drag truly leaves this th, not just moves to a child
    th.addEventListener('dragleave', e => {
      if (!th.contains(e.relatedTarget)) th.classList.remove('drag-over');
    });
    th.addEventListener('drop', e => {
      e.preventDefault(); th.classList.remove('drag-over');
      const from = e.dataTransfer.getData('text/plain');
      if (!from || from === key) return;
      const fi = colOrder.indexOf(from), ti = colOrder.indexOf(key);
      if (fi<0||ti<0) return;
      colOrder.splice(fi,1); colOrder.splice(ti,0,from);
      savePrefs(); renderTable();
    });
    tr.appendChild(th);
  }
  mainThead.appendChild(tr);
}

function renderBody(rows) {
  mainTbody.innerHTML = '';
  const cols = visibleCols();
  for (const row of rows) {
    const key = row.wo.Number; const isExp = expandedRows.has(key);
    const tr = document.createElement('tr'); tr.dataset.woKey = key;
    if (isExp) tr.classList.add('row-expanded');
    const tdX = document.createElement('td'); tdX.className = 'expand-cell'; tdX.textContent = isExp ? '▼' : '▶';
    tr.appendChild(tdX);
    for (const colKey of cols) {
      const def = COL_MAP[colKey]; const td = document.createElement('td');
      let cls = '';
      if (def.align==='right')  cls += ' r';
      if (def.align==='center') cls += ' c';
      if (def.varCol) {
        const sv = def.sortValue(row);
        if (sv !== -Infinity) cls += sv >= 0 ? ' var-pos' : ' var-neg';
      }
      td.className = cls.trim(); td.textContent = def.getValue(row); tr.appendChild(td);
    }
    tr.addEventListener('click', () => {
      if (expandedRows.has(key)) expandedRows.delete(key); else expandedRows.add(key);
      renderTable();
    });
    mainTbody.appendChild(tr);
    if (isExp) {
      const expTr = document.createElement('tr'); expTr.className = 'expand-row'; expTr.dataset.woKey = key;
      const expTd = document.createElement('td'); expTd.colSpan = cols.length+1; expTd.className = 'expand-td';
      expTd.appendChild(buildLaborDetailTable(row)); expTr.appendChild(expTd); mainTbody.appendChild(expTr);
    }
  }
}

function buildLaborDetailTable(row) {
  const allItems = row.laborItems;
  if (!allItems.length) {
    const p = document.createElement('p'); p.className = 'no-labor-msg';
    p.textContent = 'No labor item detail available for this work order.'; return p;
  }
  const items = selectedLaborTypes === null ? allItems : allItems.filter(i => selectedLaborTypes.has(i.Name));
  const table = document.createElement('table'); table.className = 'labor-detail-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Labor Type</th><th class="r">Est Hrs</th><th class="r">Act Hrs</th><th class="r">Hrs Var</th><th class="r">Est Cost</th><th class="r">Act Cost</th><th class="r">Cost Var</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let tEH=0,tAH=0,tEC=0,tAC=0;
  for (const item of items) {
    const eH=parseTimeSpan(item.EstimatedHours)??0, aH=parseTimeSpan(item.ActualHours)??0;
    const eC=extractCurrency(item.EstimatedCost)??0, aC=extractCurrency(item.ActualCost)??0;
    tEH+=eH; tAH+=aH; tEC+=eC; tAC+=aC;
    const hV=eH-aH, cV=eC-aC; const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(item.Name||'')}</td><td class="r">${fmtHours(eH)}</td><td class="r">${fmtHours(aH)}</td><td class="r ${hV>=0?'var-pos':'var-neg'}">${fmtHours(hV)}</td><td class="r">${fmtCurrency(eC)}</td><td class="r">${fmtCurrency(aC)}</td><td class="r ${cV>=0?'var-pos':'var-neg'}">${fmtCurrency(cV)}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const hV=tEH-tAH, cV=tEC-tAC; const tfoot = document.createElement('tfoot');
  tfoot.innerHTML = `<tr><td>Total</td><td class="r">${fmtHours(tEH)}</td><td class="r">${fmtHours(tAH)}</td><td class="r ${hV>=0?'var-pos':'var-neg'}">${fmtHours(hV)}</td><td class="r">${fmtCurrency(tEC)}</td><td class="r">${fmtCurrency(tAC)}</td><td class="r ${cV>=0?'var-pos':'var-neg'}">${fmtCurrency(cV)}</td></tr>`;
  table.appendChild(tfoot); return table;
}

function renderFooter(rows) {
  mainTfoot.innerHTML = '';
  const cols = visibleCols(); const tr = document.createElement('tr');
  const tdB = document.createElement('td'); tdB.className = 'foot-label'; tr.appendChild(tdB);
  cols.forEach((key, i) => {
    const def = COL_MAP[key]; const td = document.createElement('td');
    if (def.footerFn) {
      td.textContent = def.footerFn(rows);
      if (def.varCol) {
        const t = rows.reduce((s,r) => { const v=def.sortValue(r); return s+(v===-Infinity?0:v); },0);
        td.classList.add(t>=0?'var-pos':'var-neg');
      }
    } else if (i===0) { td.textContent = `${rows.length} work order${rows.length!==1?'s':''}`; td.className='foot-label'; }
    else td.className = 'foot-label';
    tr.appendChild(td);
  });
  mainTfoot.appendChild(tr);
}

// ── Columns dropdown ──────────────────────────────────────────────────────────
function buildColsDropdown() {
  colsList.innerHTML = '';
  for (const {key} of ALL_COLS) {
    const def = COL_MAP[key]; const item = document.createElement('label'); item.className = 'col-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !hiddenCols.has(key);
    cb.addEventListener('change', () => {
      if (cb.checked) hiddenCols.delete(key); else hiddenCols.add(key);
      savePrefs(); if (rawRows.length) renderCurrentView();
    });
    const span = document.createElement('span'); span.textContent = def.label;
    item.appendChild(cb); item.appendChild(span); colsList.appendChild(item);
  }
}
colsBtn.addEventListener('click', e => {
  e.stopPropagation(); if (colsDropdown.classList.toggle('open')) buildColsDropdown();
});

// ── Filter strip ──────────────────────────────────────────────────────────────
function buildFilterStrip() {
  filterStrip.innerHTML = '';
  _clearResultDate = null;
  const defs = [
    { label:'Project',    values:[...new Set(rawRows.map(r=>r.project.Name).filter(Boolean))].sort(),  setter:v=>{selectedProjects=v;},   searchable:true },
    { label:'Type',       values:[...new Set(rawRows.map(r=>r.woType).filter(Boolean))].sort(),        setter:v=>{selectedTypes=v;} },
    { label:'PM',         values:[...new Set(rawRows.map(r=>r.pm).filter(Boolean))].sort(),            setter:v=>{selectedPMs=v;} },
    { label:'Estimator',  values:[...new Set(rawRows.map(r=>r.estimator).filter(Boolean))].sort(),     setter:v=>{selectedEstimators=v;} },
    { label:'State',      values:[...new Set(rawRows.map(r=>r.state).filter(Boolean))].sort(),         setter:v=>{selectedStates=v;} },
    { label:'Labor Type', values:[...new Set(rawRows.flatMap(r=>r.laborItems.map(i=>i.Name).filter(Boolean)))].sort(), setter:v=>{selectedLaborTypes=v;} },
  ];
  for (const f of defs) {
    if (f.values.length > 0) filterStrip.appendChild(makeFilterDropdown(f.label, f.values, f.setter, { searchable: !!f.searchable }));
  }
  const { element: rdEl, clear: clearRd } = makeDateFilterDropdown('Entry Date', ranges => {
    resultDateRanges = ranges;
    if (rawRows.length) renderCurrentView();
  });
  _clearResultDate = clearRd;
  filterStrip.appendChild(rdEl);
  filterStrip.hidden = false;
}

function makeFilterDropdown(label, options, setter, { searchable = false } = {}) {
  let selected = null;
  let visibleOptions = options;
  const wrap = document.createElement('div'); wrap.className = 'filter-wrap';
  const btn  = document.createElement('button'); btn.className = 'filter-btn'; btn.textContent = `${label} ▾`;
  const panel = document.createElement('div');
  panel.className = 'dropdown-panel filter-panel' + (searchable ? ' filter-panel-search' : '');

  if (searchable) {
    const searchBox = document.createElement('input');
    searchBox.type = 'text'; searchBox.className = 'filter-search-input';
    searchBox.placeholder = `Search ${label}…`;
    searchBox.addEventListener('input', () => {
      const q = searchBox.value.trim().toLowerCase();
      visibleOptions = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
      rebuildList();
    });
    searchBox.addEventListener('click', e => e.stopPropagation());
    panel.appendChild(searchBox);
  }

  const acts  = document.createElement('div'); acts.className = 'dropdown-actions';
  ['All','None'].forEach(text => {
    const b = document.createElement('button'); b.textContent = text;
    b.addEventListener('click', () => {
      selected = text==='None' ? new Set() : null;
      setter(selected); updateBtn(); rebuildList(); if (rawRows.length) renderCurrentView();
    });
    acts.appendChild(b);
  });
  panel.appendChild(acts);
  const listEl = document.createElement('div'); listEl.className = 'filter-list'; panel.appendChild(listEl);
  function updateBtn() {
    btn.textContent = selected ? `${label} (${selected.size}/${options.length}) ▾` : `${label} ▾`;
    btn.classList.toggle('filtered', !!selected && selected.size < options.length);
  }
  function rebuildList() {
    listEl.innerHTML = '';
    for (const opt of visibleOptions) {
      const item = document.createElement('label'); item.className = 'labor-item';
      const cb   = document.createElement('input'); cb.type='checkbox'; cb.checked=!selected||selected.has(opt);
      cb.addEventListener('change', () => {
        if (!selected) selected = new Set(options);
        if (cb.checked) selected.add(opt); else selected.delete(opt);
        if (selected.size===options.length) selected=null;
        setter(selected); updateBtn(); if (rawRows.length) renderCurrentView();
      });
      const span = document.createElement('span'); span.textContent = opt;
      item.appendChild(cb); item.appendChild(span); listEl.appendChild(item);
    }
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.filter-panel.open, #cols-dropdown.open').forEach(p => { if (p!==panel) p.classList.remove('open'); });
    if (panel.classList.toggle('open')) rebuildList();
  });
  wrap.appendChild(btn); wrap.appendChild(panel); return wrap;
}

// Reusable date-range picker — multi-select, OR logic.
// btnLabel: default button text. onRangesChange([{from,to,label}]) fires on every change.
// Returns { element, clear }.
function makeDateFilterDropdown(btnLabel, onRangesChange) {
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const curYear = today.getFullYear();
  const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const eod     = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  // Declare custom inputs early so clearAll() can reference them
  const fromCustInput = document.createElement('input');
  fromCustInput.type = 'date'; fromCustInput.className = 'edf-date-input';
  fromCustInput.addEventListener('click', e => e.stopPropagation());
  const toCustInput = document.createElement('input');
  toCustInput.type = 'date'; toCustInput.className = 'edf-date-input';
  toCustInput.addEventListener('click', e => e.stopPropagation());

  const wrap  = document.createElement('div'); wrap.className = 'filter-wrap';
  const btn   = document.createElement('button'); btn.className = 'filter-btn';
  const panel = document.createElement('div'); panel.className = 'dropdown-panel filter-panel edf-panel';

  let activeRanges = []; // [{from, to, label, chipEl}]

  function updateBtn() {
    if (!activeRanges.length) {
      btn.textContent = btnLabel + ' ▾'; btn.classList.remove('filtered');
    } else if (activeRanges.length === 1) {
      btn.textContent = activeRanges[0].label + ' ▾'; btn.classList.add('filtered');
    } else {
      btn.textContent = activeRanges.length + ' selected ▾'; btn.classList.add('filtered');
    }
  }

  function notify() {
    onRangesChange(activeRanges.map(r => ({ from: r.from, to: r.to, label: r.label })));
  }

  function clearAll() {
    activeRanges.forEach(r => r.chipEl && r.chipEl.classList.remove('edf-active'));
    activeRanges = [];
    fromCustInput.value = ''; toCustInput.value = '';
    updateBtn(); notify();
    panel.classList.remove('open');
  }

  function toggleChip(from, to, label, chipEl) {
    const idx = activeRanges.findIndex(r => r.label === label);
    if (idx >= 0) {
      activeRanges.splice(idx, 1);
      chipEl.classList.remove('edf-active');
    } else {
      activeRanges.push({ from: from ? new Date(from) : null, to: to ? eod(to) : null, label, chipEl });
      chipEl.classList.add('edf-active');
    }
    updateBtn(); notify();
  }

  function chip(display, from, to, rangeLabel) {
    const label = rangeLabel || display;
    const el = document.createElement('button');
    el.className = 'edf-chip'; el.type = 'button'; el.textContent = display;
    el.addEventListener('click', e => { e.stopPropagation(); toggleChip(from, to, label, el); });
    return el;
  }

  // ── Clear ──────────────────────────────────────────────────────────────────
  const clearBtn = document.createElement('button');
  clearBtn.className = 'edf-clear-btn'; clearBtn.type = 'button'; clearBtn.textContent = '✕ Clear filter';
  clearBtn.addEventListener('click', e => { e.stopPropagation(); clearAll(); });
  panel.appendChild(clearBtn);

  // ── Rolling ────────────────────────────────────────────────────────────────
  const rollSec   = document.createElement('div'); rollSec.className = 'edf-section';
  const rollTitle = document.createElement('div'); rollTitle.className = 'edf-section-title'; rollTitle.textContent = 'Rolling';
  const rollChips = document.createElement('div'); rollChips.className = 'edf-chips';
  [['Last 7 Days', 6], ['Last 30 Days', 29], ['Last 90 Days', 89]].forEach(([label, back]) => {
    rollChips.appendChild(chip(label, addDays(today, -back), today));
  });
  rollSec.appendChild(rollTitle); rollSec.appendChild(rollChips); panel.appendChild(rollSec);

  // ── Year sections (current + 2 prior) ─────────────────────────────────────
  for (let yr = curYear; yr >= curYear - 2; yr--) {
    const sec    = document.createElement('div'); sec.className = 'edf-year-section';
    const hdr    = document.createElement('div'); hdr.className = 'edf-year-header';
    const yrLbl  = document.createElement('span'); yrLbl.className = 'edf-year-label'; yrLbl.textContent = yr;
    const qChips = document.createElement('div'); qChips.className = 'edf-q-chips';
    [1,2,3,4].forEach(q => {
      qChips.appendChild(chip(`Q${q}`, new Date(yr,(q-1)*3,1), new Date(yr,q*3,0), `Q${q} ${yr}`));
    });
    hdr.appendChild(yrLbl); hdr.appendChild(qChips); sec.appendChild(hdr);
    const mGrid = document.createElement('div'); mGrid.className = 'edf-m-grid';
    MONTHS.forEach((m, mi) => {
      mGrid.appendChild(chip(m, new Date(yr,mi,1), new Date(yr,mi+1,0), `${m} ${yr}`));
    });
    sec.appendChild(mGrid); panel.appendChild(sec);
  }

  // ── Custom range ───────────────────────────────────────────────────────────
  const custDiv   = document.createElement('div'); custDiv.className = 'edf-custom';
  const custTitle = document.createElement('div'); custTitle.className = 'edf-section-title'; custTitle.textContent = 'Custom Range';
  const fromRow = document.createElement('div'); fromRow.className = 'edf-custom-row';
  const fromLbl = document.createElement('span'); fromLbl.className = 'edf-custom-lbl'; fromLbl.textContent = 'From';
  const toRow   = document.createElement('div'); toRow.className   = 'edf-custom-row';
  const toLbl   = document.createElement('span'); toLbl.className   = 'edf-custom-lbl'; toLbl.textContent   = 'To';
  fromRow.appendChild(fromLbl); fromRow.appendChild(fromCustInput);
  toRow.appendChild(toLbl);     toRow.appendChild(toCustInput);
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button'; applyBtn.className = 'edf-apply-btn'; applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', e => {
    e.stopPropagation();
    const f = fromCustInput.value ? new Date(fromCustInput.value + 'T00:00:00') : null;
    const t = toCustInput.value   ? new Date(toCustInput.value   + 'T00:00:00') : null;
    if (!f && !t) return;
    const label = (fromCustInput.value ? fmtDate(fromCustInput.value) : '') + ' – ' + (toCustInput.value ? fmtDate(toCustInput.value) : '');
    // Replace any existing custom entry
    const ci = activeRanges.findIndex(r => r.label.includes(' – '));
    if (ci >= 0) activeRanges.splice(ci, 1);
    activeRanges.push({ from: f, to: t ? eod(t) : null, label, chipEl: null });
    updateBtn(); notify();
    panel.classList.remove('open');
  });
  custDiv.appendChild(custTitle); custDiv.appendChild(fromRow); custDiv.appendChild(toRow); custDiv.appendChild(applyBtn);
  panel.appendChild(custDiv);

  // ── Button toggle ──────────────────────────────────────────────────────────
  updateBtn();
  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.filter-panel.open, #cols-dropdown.open').forEach(p => { if (p !== panel) p.classList.remove('open'); });
    panel.classList.toggle('open');
  });

  wrap.appendChild(btn); wrap.appendChild(panel);
  return { element: wrap, clear: clearAll };
}

document.addEventListener('click', e => {
  if (!colsDropdown.contains(e.target) && e.target !== colsBtn) colsDropdown.classList.remove('open');
  document.querySelectorAll('.filter-panel.open').forEach(p => {
    if (!p.contains(e.target) && e.target !== p.previousElementSibling) p.classList.remove('open');
  });
});

// ── API helpers ───────────────────────────────────────────────────────────────
let authEnabled = false;

async function apiFetch(path) {
  const headers = authEnabled ? {} : { 'x-api-key': apiKey };
  const res = await fetch(path, { headers });
  if (!res.ok) { const b = await res.json().catch(()=>({})); throw new Error(b.error||`HTTP ${res.status}`); }
  return res.json();
}
async function fetchConcurrent(items, fn, limit) {
  let next = 0;
  async function worker() { while (next < items.length) { const i = next++; await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ── Load Report ───────────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', loadReport);

async function loadReport() {
  if (!authEnabled && !apiKey) { setStatus('Enter your API key first.'); return; }

  refreshBtn.disabled = true; refreshBtn.innerHTML = '<span class="spinner"></span>Loading…';
  rawRows = []; allProjects = []; dmCache = new Map();
  selectedPMs = selectedEstimators = selectedStates = selectedTypes = selectedLaborTypes = selectedProjects = null;
  resultDateRanges = []; _clearResultDate = null;
  fbFilterFn = null; fbRootGroup = null;
  filterBtn.hidden = true; filterBtn.classList.remove('active'); filterBtn.textContent = 'Filter ▾';
  expandedRows.clear();
  filterStrip.hidden = true; filterStrip.innerHTML = '';
  tableScroll.hidden = true; noDataMsg.hidden = false; noDataMsg.textContent = 'Loading…';

  const stepFrom = parseInt(stepFromInput.value, 10) || 17;
  const stepTo   = parseInt(stepToInput.value,   10) || 19;

  try {
    // 1. Project list
    setStatus('Loading project list…');
    const projData = await apiFetch('/api/projects');
    allProjects = projData.Items || [];
    setStatus(`${allProjects.length} projects found. Loading date management data…`);

    // 2. dateManagement for ALL projects → Steps + LaborItems (the source of step history)
    let dmLoaded = 0;
    await fetchConcurrent(allProjects, async project => {
      try {
        const data = await apiFetch(`/api/dateManagement/${project.Id}`);
        dmCache.set(project.Id, data.WorkOrders || []);
      } catch {
        dmCache.set(project.Id, []);
      }
      dmLoaded++;
      if (dmLoaded % 10 === 0 || dmLoaded === allProjects.length)
        setStatus(`Loading date management… ${dmLoaded} / ${allProjects.length}`);
    }, 8);

    // 3. Historical filter: WOs that entered step N in [stepFrom,stepTo] during loadDateRanges
    rawRows = buildRows(stepFrom, stepTo, loadDateRanges);
    console.log(`[SAR] buildRows → ${rawRows.length} rows | steps ${stepFrom}–${stepTo} | dateRanges=${loadDateRanges.length}`);

    if (!rawRows.length) {
      const range = loadDateRanges.length ? ` during the selected date range` : '';
      setStatus(`No work orders found in steps ${stepFrom}–${stepTo}${range}.`);
      noDataMsg.textContent = 'No work orders found for these criteria.';
      refreshBtn.disabled = false; refreshBtn.textContent = 'Load Report'; return;
    }

    // 4. workOrders for matched projects only → financial fields + WO type
    const matchedPids = [...new Set(rawRows.map(r => r.project.Id))];
    setStatus(`Fetching financials for ${matchedPids.length} project${matchedPids.length!==1?'s':''}…`);
    await fetchConcurrent(matchedPids, async pid => {
      try {
        const data = await apiFetch(`/api/projects/${pid}/workOrders`);
        const woMap = new Map((data.Items||[]).map(w => [w.Number, w]));
        for (const row of rawRows.filter(r => r.project.Id === pid)) {
          const wo = woMap.get(row.wo.Number);
          if (!wo) continue;
          row.grandTotal         = extractCurrency(wo.GrandTotalPrice);
          row.totalActualCost    = extractCurrency(wo.ActualCost);
          row.mtlEst             = extractCurrency(wo.EstimatedMaterialCost);
          row.mtlActual          = extractCurrency(wo.ActualMaterialCost);
          row.nativeLaborEstCost = extractCurrency(wo.EstimatedLaborCost);
          row.nativeLaborActCost = extractCurrency(wo.ActualLaborCost);
          row.nativeLaborEstHrs  = parseTimeSpan(wo.EstimatedTotalLaborDuration ?? wo.EstimatedLaborDuration);
          row.nativeLaborActHrs  = typeof wo.ActualLaborHours === 'number'
                                   ? wo.ActualLaborHours
                                   : parseTimeSpan(wo.ActualTotalLaborDuration ?? wo.ActualLaborDuration);
          row.woType             = wo.Type || null;
          row.curStepIndex       = wo.StepIndex  ?? null;
          row.curStepName        = wo.Step       || '';
          row.expActual          = extractCurrency(wo.ActualExpensesCost);
          Object.assign(row.wo, wo); // merge full WO data (Name, Id, etc.)
        }
      } catch { /* ignore WO financial fetch failures */ }
    }, 8);

    // 5. Render
    buildFilterStrip();
    filterBtn.hidden = false;
    const rangeLabel = stepFrom===stepTo ? `Step ${stepFrom}` : `Steps ${stepFrom}–${stepTo}`;
    const dateRange  = loadDateRanges.length ? ' · ' + loadDateRanges.map(r => r.label).join(', ') : '';
    setStatus(`${rawRows.length} work order${rawRows.length!==1?'s':''} in ${rangeLabel}${dateRange} · ${new Date().toLocaleTimeString()}`);
    viewBar.hidden = false;
    setViewMode('summary');
    renderDashboard();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    noDataMsg.textContent = `Error: ${err.message}`;
    console.error('[SAR]', err);
  } finally {
    refreshBtn.disabled = false; refreshBtn.textContent = 'Load Report';
  }
}

// ── API Key ───────────────────────────────────────────────────────────────────
const signoutBtn = document.getElementById('signout-btn');

saveKeyBtn.addEventListener('click', async () => {
  const v = apiKeyInput.value.trim(); if (!v) return;
  if (authEnabled) {
    try {
      await fetch('/api/save-key', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: v }) });
      apiKeyInput.value = '';
      keyStatus.textContent = '✓ Key saved on server';
      refreshBtn.disabled = false;
    } catch { keyStatus.textContent = 'Error saving key'; }
  } else {
    apiKey = v; localStorage.setItem(API_KEY_STORAGE, apiKey);
    keyStatus.textContent = '✓ Saved'; refreshBtn.disabled = false;
  }
});
apiKeyInput.addEventListener('keydown', e => { if (e.key==='Enter') saveKeyBtn.click(); });

signoutBtn.addEventListener('click', () => {
  fetch('/logout', { method: 'POST' }).then(() => location.href = '/login');
});

// ── Live search + reset ───────────────────────────────────────────────────────
searchInput.addEventListener('input',  () => { if (rawRows.length) renderCurrentView(); });
excludeInput.addEventListener('input', () => { if (rawRows.length) renderCurrentView(); });
resetBtn.addEventListener('click', () => {
  searchInput.value = ''; excludeInput.value = '';
  if (_clearResultDate) _clearResultDate();
  if (rawRows.length) renderCurrentView();
  else noDataMsg.textContent = 'Enter your API key, set a step range and date range, then click Load Report.';
});

// ── Status bar ────────────────────────────────────────────────────────────────
function setStatus(msg) { statusBar.textContent = msg; }

// ── Init ──────────────────────────────────────────────────────────────────────
loadPrefs();
buildColsDropdown();

// Load-date filter in setup strip
(function() {
  const { element: el } = makeDateFilterDropdown('Load Date', ranges => { loadDateRanges = ranges; });
  document.getElementById('load-date-group').appendChild(el);
}());

(async () => {
  try {
    const status = await fetch('/api/auth-status').then(r => r.json());
    authEnabled = !!status.authEnabled;
  } catch { authEnabled = false; }

  if (authEnabled) {
    signoutBtn.hidden = false;
    apiKeyInput.placeholder = 'Update Innergy API Key';
    saveKeyBtn.textContent = 'Save Key on Server';
    try {
      const ks = await fetch('/api/my-key-status').then(r => r.json());
      if (ks.hasKey) {
        keyStatus.textContent = '✓ Key saved on server';
        refreshBtn.disabled = false;
      } else {
        keyStatus.textContent = 'Enter your Innergy API key';
      }
    } catch { /* ignore key-status fetch failure */ }
  } else {
    if (apiKey) { apiKeyInput.value = apiKey; keyStatus.textContent = '✓ Key loaded'; refreshBtn.disabled = false; }
  }
})();
