'use strict';

// FilterBuilder — nested group filter builder (matches Innergy's Filter Builder UI).
//
// Data model:
//   GroupNode:     { type: 'group',     logic: 'and'|'or'|'not_and'|'not_or', children: Node[] }
//   ConditionNode: { type: 'condition', field, operator, value }
//
// Usage:
//   const fb = new FilterBuilder({ onApply: ({ rootGroup, filterFn }) => { ... } });
//   fb.open(fields, savedRootGroup);   // savedRootGroup is optional
//
// fields: [{ key, label, values: string[], getValue: row => string }]

const LOGIC_OPTIONS = [
  { value: 'and',     label: 'And'     },
  { value: 'or',      label: 'Or'      },
  { value: 'not_and', label: 'Not And' },
  { value: 'not_or',  label: 'Not Or'  },
];

const OPERATORS = [
  { label: 'Equals',     value: 'equals'     },
  { label: 'Not Equals', value: 'not_equals' },
  { label: 'Contains',   value: 'contains'   },
];

class FilterBuilder {
  constructor({ onApply } = {}) {
    this.onApply    = onApply || (() => {});
    this.fields     = [];
    this.root       = null;
    this.overlay    = null;
    this._clickAway = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  open(fields, savedRoot = null) {
    this.fields = fields;
    this.root   = savedRoot ? this._clone(savedRoot) : this._makeGroup('and');
    this._render();
  }

  close() { this._close(); }

  static buildFields(rawRows) {
    const uniq = arr => [...new Set(arr.filter(Boolean))].sort();
    return [
      { key: 'pm',        label: 'PM',        values: uniq(rawRows.map(r => r.pm)),                    getValue: r => r.pm              || '' },
      { key: 'estimator', label: 'Estimator', values: uniq(rawRows.map(r => r.estimator)),             getValue: r => r.estimator       || '' },
      { key: 'state',     label: 'State',     values: uniq(rawRows.map(r => r.state)),                 getValue: r => r.state           || '' },
      { key: 'woType',    label: 'Type',      values: uniq(rawRows.map(r => r.woType).filter(Boolean)),getValue: r => r.woType          || '' },
      { key: 'project',   label: 'Project',   values: uniq(rawRows.map(r => r.project?.Name)),         getValue: r => r.project?.Name   || '' },
    ].filter(f => f.values.length > 0);
  }

  // ── Node factories ──────────────────────────────────────────────────────────

  _makeGroup(logic = 'and') {
    return { type: 'group', logic, children: [] };
  }

  _makeCondition() {
    return { type: 'condition', field: this.fields[0]?.key || '', operator: 'equals', value: '' };
  }

  _clone(node) {
    if (node.type === 'condition') return { ...node };
    return { ...node, children: node.children.map(c => this._clone(c)) };
  }

  // ── Filter evaluation ───────────────────────────────────────────────────────

  _apply() {
    const fieldMap = Object.fromEntries(this.fields.map(f => [f.key, f]));

    const evalCond = (cond, row) => {
      const def = fieldMap[cond.field];
      if (!def || !cond.value) return true;
      const v = def.getValue(row);
      if (cond.operator === 'equals')     return v === cond.value;
      if (cond.operator === 'not_equals') return v !== cond.value;
      if (cond.operator === 'contains')   return v.toLowerCase().includes(cond.value.toLowerCase());
      return true;
    };

    const evalNode = (node, row) => {
      if (node.type === 'condition') return evalCond(node, row);
      if (!node.children.length) return true;
      const results = node.children.map(c => evalNode(c, row));
      if (node.logic === 'and')     return results.every(Boolean);
      if (node.logic === 'or')      return results.some(Boolean);
      if (node.logic === 'not_and') return !results.every(Boolean);
      if (node.logic === 'not_or')  return !results.some(Boolean);
      return true;
    };

    const rootGroup = this._clone(this.root);
    const hasRules  = this._countActive(rootGroup) > 0;
    const filterFn  = hasRules ? (row => evalNode(rootGroup, row)) : null;

    this.onApply({ rootGroup, filterFn });
    this._close();
  }

  _countActive(node) {
    if (node.type === 'condition') return (node.field && node.value) ? 1 : 0;
    return node.children.reduce((s, c) => s + this._countActive(c), 0);
  }

  // ── Dialog lifecycle ────────────────────────────────────────────────────────

  _close() {
    if (this.overlay)    { this.overlay.remove(); this.overlay = null; }
    if (this._clickAway) { document.removeEventListener('click', this._clickAway); this._clickAway = null; }
  }

  _closeAllDropdowns() {
    this.overlay?.querySelectorAll('.fb-chip-dropdown').forEach(d => { d.hidden = true; });
  }

  // ── Session prefs (position + size) ────────────────────────────────────────

  _loadPrefs() {
    try { return JSON.parse(sessionStorage.getItem('fb_dialog_prefs') || '{}'); } catch { return {}; }
  }
  _savePrefs(patch) {
    try { sessionStorage.setItem('fb_dialog_prefs', JSON.stringify({ ...this._loadPrefs(), ...patch })); } catch { /* ignore */ }
  }

  // ── Top-level render ────────────────────────────────────────────────────────

  _render() {
    if (this.overlay)    this.overlay.remove();
    if (this._clickAway) document.removeEventListener('click', this._clickAway);

    this.overlay = document.createElement('div');
    this.overlay.className = 'fb-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'fb-dialog';
    dialog.addEventListener('click', e => e.stopPropagation());

    // ── Position & size from session prefs ──
    const prefs = this._loadPrefs();
    const w = prefs.width  || 780;
    const h = prefs.height || 420;
    const defaultLeft = Math.round((window.innerWidth  - w) / 2);
    const defaultTop  = Math.round((window.innerHeight - h) / 2);
    const left = prefs.left ?? defaultLeft;
    const top  = prefs.top  ?? defaultTop;

    Object.assign(dialog.style, {
      width:  w + 'px',
      height: h + 'px',
      left:   Math.max(0, Math.min(left, window.innerWidth  - w)) + 'px',
      top:    Math.max(0, Math.min(top,  window.innerHeight - h)) + 'px',
    });

    // ── Resize observer — save size on change ──
    const ro = new ResizeObserver(() => {
      this._savePrefs({ width: dialog.offsetWidth, height: dialog.offsetHeight });
    });
    ro.observe(dialog);

    // ── Prevent overlay-click-to-close when releasing resize grip ──
    let mouseDownInsideDialog = false;
    dialog.addEventListener('mousedown', () => { mouseDownInsideDialog = true; });
    document.addEventListener('mouseup', () => { setTimeout(() => { mouseDownInsideDialog = false; }, 0); });
    this.overlay.addEventListener('click', e => {
      if (!mouseDownInsideDialog && e.target === this.overlay) this._close();
    });

    dialog.appendChild(this._buildHeader(dialog));

    const body = document.createElement('div');
    body.className = 'fb-body';
    body.appendChild(this._renderGroup(this.root, null, -1));
    dialog.appendChild(body);

    dialog.appendChild(this._buildFooter());

    this.overlay.appendChild(dialog);
    document.body.appendChild(this.overlay);

    this._clickAway = () => this._closeAllDropdowns();
    document.addEventListener('click', this._clickAway);
  }

  _buildHeader(dialog) {
    const hdr = document.createElement('div');
    hdr.className = 'fb-header';

    const title = document.createElement('span');
    title.className = 'fb-title';
    title.textContent = 'Filter Builder';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'fb-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this._close());

    hdr.appendChild(title);
    hdr.appendChild(closeBtn);

    // ── Drag to move ──
    hdr.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return; // let close button work normally
      e.preventDefault();
      hdr.style.cursor = 'grabbing';

      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startLeft   = dialog.offsetLeft;
      const startTop    = dialog.offsetTop;

      const onMove = ev => {
        const newLeft = Math.max(0, Math.min(startLeft + ev.clientX - startMouseX, window.innerWidth  - dialog.offsetWidth));
        const newTop  = Math.max(0, Math.min(startTop  + ev.clientY - startMouseY, window.innerHeight - dialog.offsetHeight));
        dialog.style.left = newLeft + 'px';
        dialog.style.top  = newTop  + 'px';
      };
      const onUp = () => {
        hdr.style.cursor = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        this._savePrefs({ left: dialog.offsetLeft, top: dialog.offsetTop });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    return hdr;
  }

  _buildFooter() {
    const footer    = document.createElement('div');    footer.className = 'fb-footer';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'fb-btn fb-btn-cancel'; cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this._close());
    const okBtn = document.createElement('button'); okBtn.className = 'fb-btn fb-btn-ok'; okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => this._apply());
    footer.appendChild(okBtn); footer.appendChild(cancelBtn);
    return footer;
  }

  // ── Recursive group rendering ───────────────────────────────────────────────

  _renderGroup(group, parentGroup, idxInParent) {
    const wrap = document.createElement('div');
    wrap.className = 'fb-group';

    // Group header: [×] [logic▾] [+▾]
    const header = document.createElement('div');
    header.className = 'fb-group-header';

    if (parentGroup !== null) {
      const x = document.createElement('button');
      x.className = 'fb-remove-btn';
      x.textContent = '×';
      x.addEventListener('click', () => { parentGroup.children.splice(idxInParent, 1); this._render(); });
      header.appendChild(x);
    }

    header.appendChild(this._makeLogicChip(group));
    header.appendChild(this._makeAddBtn(group));
    wrap.appendChild(header);

    // Children container — left padding provides the indent
    const childrenEl = document.createElement('div');
    childrenEl.className = 'fb-children';
    group.children.forEach((child, idx) => {
      childrenEl.appendChild(
        child.type === 'group'
          ? this._renderGroup(child, group, idx)
          : this._renderCondition(child, group, idx)
      );
    });
    wrap.appendChild(childrenEl);

    return wrap;
  }

  _renderCondition(cond, parentGroup, idxInParent) {
    const row = document.createElement('div');
    row.className = 'fb-condition-row';

    const x = document.createElement('button');
    x.className = 'fb-remove-btn';
    x.textContent = '×';
    x.addEventListener('click', () => { parentGroup.children.splice(idxInParent, 1); this._render(); });
    row.appendChild(x);

    // Field chip
    const fieldDef = this.fields.find(f => f.key === cond.field) || this.fields[0];
    row.appendChild(this._makeChipDropdown({
      label:     fieldDef?.label || '(field)',
      chipClass: 'fb-chip-field',
      options:   this.fields.map(f => ({ label: f.label, value: f.key })),
      current:   cond.field,
      onSelect:  key => { cond.field = key; cond.value = ''; this._render(); },
    }));

    // Operator chip
    row.appendChild(this._makeChipDropdown({
      label:     OPERATORS.find(o => o.value === cond.operator)?.label || 'Equals',
      chipClass: 'fb-chip-op',
      options:   OPERATORS,
      current:   cond.operator,
      onSelect:  op => { cond.operator = op; this._render(); },
    }));

    // Value chip
    const valueOpts = (this.fields.find(f => f.key === cond.field) || {}).values || [];
    row.appendChild(this._makeChipDropdown({
      label:     cond.value || '<enter a value>',
      chipClass: 'fb-chip-val' + (cond.value ? '' : ' fb-chip-val-empty'),
      options:   valueOpts.map(v => ({ label: v, value: v })),
      current:   cond.value,
      onSelect:  val => { cond.value = val; this._render(); },
    }));

    return row;
  }

  // ── Chip helpers ────────────────────────────────────────────────────────────

  _makeLogicChip(group) {
    return this._makeChipDropdown({
      label:     LOGIC_OPTIONS.find(o => o.value === group.logic)?.label || 'And',
      chipClass: 'fb-chip-logic',
      options:   LOGIC_OPTIONS,
      current:   group.logic,
      onSelect:  val => { group.logic = val; this._render(); },
    });
  }

  _makeAddBtn(group) {
    const wrap = document.createElement('div');
    wrap.className = 'fb-chip-wrap';

    const btn = document.createElement('button');
    btn.className = 'fb-add-btn';
    btn.textContent = '+';
    btn.title = 'Add condition or group';

    const dropdown = document.createElement('div');
    dropdown.className = 'fb-chip-dropdown fb-add-dropdown';
    dropdown.hidden = true;

    const addOpt = (label, fn) => {
      const item = document.createElement('div');
      item.className = 'fb-chip-option';
      item.textContent = label;
      item.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
      dropdown.appendChild(item);
    };
    addOpt('Add Condition', () => { group.children.push(this._makeCondition()); this._render(); });
    addOpt('Add Group',     () => { group.children.push(this._makeGroup('and')); this._render(); });

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = !dropdown.hidden;
      this._closeAllDropdowns();
      dropdown.hidden = wasOpen;
    });

    wrap.appendChild(btn);
    wrap.appendChild(dropdown);
    return wrap;
  }

  _makeChipDropdown({ label, chipClass, options, current, onSelect }) {
    const wrap = document.createElement('div');
    wrap.className = 'fb-chip-wrap';

    const chip = document.createElement('button');
    chip.className = `fb-chip ${chipClass}`;
    chip.textContent = label;

    const dropdown = document.createElement('div');
    dropdown.className = 'fb-chip-dropdown';
    dropdown.hidden = true;

    for (const opt of options) {
      const item = document.createElement('div');
      item.className = 'fb-chip-option';
      if (opt.value === current) item.classList.add('selected');
      item.textContent = opt.label;
      item.addEventListener('mousedown', e => { e.preventDefault(); onSelect(opt.value); });
      dropdown.appendChild(item);
    }

    chip.addEventListener('click', e => {
      e.stopPropagation();
      const wasOpen = !dropdown.hidden;
      this._closeAllDropdowns();
      dropdown.hidden = wasOpen;
    });

    wrap.appendChild(chip);
    wrap.appendChild(dropdown);
    return wrap;
  }
}

window.FilterBuilder = FilterBuilder;
