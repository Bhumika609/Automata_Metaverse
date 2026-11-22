/* ============================================================================
 * UI LAYER · interactive machine editors
 *   GraphEditor   — states & transitions for DFA / NFA / ε-NFA / PDA / TM (SVG)
 *   GrammarEditor — productions for CFGs
 * The graph editor also owns the "orb" animation engine used to SHOW computation:
 * clones splitting (NFA), ε-portals, stack/tape tokens moving along edges.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, F = AM.F, G = AM.G;
  const h = UI.h, S = UI.svg;
  const isEps = F.isEps;
  const blankShow = (c) => (c === '_' || c === '' || c === undefined ? '□' : c);

  /* ---------- geometry helpers ---------- */
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const quadAt = (p0, c, p2, t) => ({ x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x, y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y });
  const cubicAt = (a, b, c, d, t) => { const u = 1 - t; return { x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y }; };
  const tween = (ms, fn) => new Promise((res) => { if (UI.reduceMotion()) { fn(1); return res(); } const t0 = performance.now(); const tick = (t) => { const k = Math.min(1, (t - t0) / ms); fn(k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); k < 1 ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });

  UI.GraphEditor = class GraphEditor {
    constructor(host, opts = {}) {
      this.opts = Object.assign({ model: 'FA', kind: 'DFA', allowedKinds: ['DFA', 'NFA', 'ENFA'], alphabet: null, readOnly: false, compact: false, onChange: null, hint: true }, opts);
      this.model = this.opts.model;
      this.ro = this.opts.readOnly;
      this.alphabet = this.opts.alphabet;
      this.m = this.fresh();
      this.mode = 'select';
      this.sel = null; // {state:id} | {edge:key}
      this.vb = { x: 0, y: 0, w: 900, h: 560 };
      this.undoStack = []; this.redoStack = [];
      this.edgeGeom = new Map(); this.edgeEls = new Map(); this.nodeEls = new Map();
      this.frameToken = 0; this.drag = null; this.showTable = false;
      this.build(host);
      this.render();
    }

    fresh() {
      const m = F.newMachine(this.model === 'FA' ? this.opts.kind : this.model);
      m.alphabet = this.alphabet ? [...this.alphabet] : [];
      return m;
    }

    /* ---------- DOM ---------- */
    build(host) {
      this.host = host;
      const svg = (this.svg = S('svg', { class: 'canvas' + (this.ro ? ' ro' : ''), viewBox: '0 0 900 560', preserveAspectRatio: 'xMidYMid meet', 'aria-label': 'Automaton canvas' }));
      const mk = (id, color) => S('marker', { id: id + this.uid(), viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, S('path', { d: 'M0 0L10 5L0 10z', fill: color }));
      this.markers = { arr: mk('arr', '#b8c4f5'), hot: mk('hot', '#ffffff'), eps: mk('eps', '#e879f9') };
      svg.appendChild(S('defs', null, this.markers.arr, this.markers.hot, this.markers.eps));
      this.world = S('g'); this.gEdges = S('g'); this.gNodes = S('g'); this.gOrbs = S('g', { style: { pointerEvents: 'none' } }); this.gTemp = S('g');
      this.world.append(this.gEdges, this.gNodes, this.gOrbs, this.gTemp); svg.appendChild(this.world);
      this.wrap = h('div.canvas-wrap', { tabindex: this.ro ? null : 0 }, svg);
      if (this.ro) { host.classList.add('mini'); host.appendChild(this.wrap); this.wrap.style.height = '100%'; this.wrap.style.background = 'none'; return; }
      this.hintEl = this.opts.hint ? h('div.canvas-hint', this.model === 'FA' ? 'Double-click empty space: add state · Double-click a state: toggle accepting · ➜ mode or Shift-drag: connect' : 'Double-click: add state · ➜ mode or Shift-drag: connect · click a label to edit rules') : null;
      this.selBar = h('div.sel-bar.hidden');
      this.wrap.append(this.selBar); if (this.hintEl) this.wrap.append(this.hintEl);
      this.status = h('div.status', { style: { margin: '.5rem .6rem', minHeight: '38px' } });
      this.tableWrap = h('div.hidden', { style: { padding: '0 .6rem .6rem', overflow: 'auto' } });
      this.toolbar = this.buildToolbar();
      this.panel = h('div.panel.editor', this.toolbar, this.wrap, this.status, this.tableWrap);
      host.appendChild(this.panel);
      this.bindEvents();
    }
    uid() { return (UI._gid = (UI._gid || 0) + 1); }

    buildToolbar() {
      const btn = (label, title, fn, cls = '') => h('button.tb' + (cls ? '.' + cls : ''), { type: 'button', title, 'aria-label': title, onclick: fn }, label);
      this.modeBtns = {
        select: btn('↖ Select', 'Select & move states (V)', () => this.setMode('select')),
        state: btn('◯ State', 'Click the canvas to add states (S)', () => this.setMode('state')),
        transition: btn('➜ Transition', 'Drag from one state to another (T)', () => this.setMode('transition')),
        delete: btn('🗑 Delete', 'Click a state or transition to delete it (D)', () => this.setMode('delete')),
      };
      this.undoBtn = btn('↶', 'Undo (Ctrl+Z)', () => this.undo()); this.redoBtn = btn('↷', 'Redo (Ctrl+Y)', () => this.redo());
      const els = [...Object.values(this.modeBtns), h('span.sep'), this.undoBtn, this.redoBtn, h('span.sep'),
        btn('⌖ Layout', 'Auto-arrange states', () => { F.autoLayout(this.m, 860, 520); this.commit(); this.fit(); }),
        btn('⤢ Fit', 'Fit view', () => this.fit()),
        btn('✖ Clear', 'Remove everything', () => { if (this.m.states.length) { this.m.states = []; this.m.transitions = []; this.sel = null; this.commit(); } })];
      if (this.model === 'FA') {
        if (this.opts.allowedKinds.length > 1) {
          this.kindSel = h('select', { 'aria-label': 'Machine type', onchange: () => { this.m.type = this.kindSel.value; this.commit(); } }, this.opts.allowedKinds.map((k) => h('option', { value: k }, G.TYPE_LABEL[k])));
          els.push(h('span.sep'), this.kindSel);
        }
        els.push(btn('δ', 'Show transition table', () => { this.showTable = !this.showTable; this.renderTable(); }));
      }
      if (this.model === 'PDA') {
        this.accSel = h('select', { 'aria-label': 'Acceptance mode', onchange: () => { this.m.acceptMode = this.accSel.value; this.commit(); } }, h('option', { value: 'final' }, 'accept: final state'), h('option', { value: 'empty' }, 'accept: empty stack'));
        els.push(h('span.sep'), this.accSel);
      }
      els.push(h('span.sp'), btn('⬇ .jff', 'Export as a JFLAP file', () => this.exportJff()), btn('⬆ .jff', 'Import a JFLAP file', () => this.importJff()));
      return h('div.toolbar', els);
    }

    setMode(m) { this.mode = m; for (const [k, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', k === m); this.wrap.style.cursor = m === 'state' ? 'copy' : m === 'delete' ? 'not-allowed' : 'default'; }

    /* ---------- machine access ---------- */
    getMachine() {
      const m = F.clone(this.m);
      if (this.model === 'FA') { m.alphabet = this.alphabet ? [...this.alphabet] : F.FA.symbols(m); }
      return m;
    }
    setMachine(m, { silent = true, fit = true } = {}) {
      this.m = F.clone(m);
      if (this.model === 'FA' && !this.opts.allowedKinds.includes(this.m.type)) this.m.type = this.opts.allowedKinds[0];
      this.sel = null; this.undoStack = []; this.redoStack = [];
      this.syncControls(); this.render(); if (fit) this.fit();
      if (!silent) this.emit();
      this.pushUndo();
    }
    syncControls() { if (this.kindSel) this.kindSel.value = this.m.type; if (this.accSel) this.accSel.value = this.m.acceptMode || 'final'; }
    emit() { this.updateStatus(); if (this.opts.onChange) this.opts.onChange(this.getMachine()); }
    pushUndo() { if (this.ro) return; const s = JSON.stringify(this.m); if (this.undoStack[this.undoStack.length - 1] !== s) { this.undoStack.push(s); if (this.undoStack.length > 80) this.undoStack.shift(); this.redoStack = []; } this.updUndo(); }
    updUndo() { if (this.undoBtn) { this.undoBtn.disabled = this.undoStack.length < 2; this.redoBtn.disabled = !this.redoStack.length; } }
    undo() { if (this.undoStack.length < 2) return; this.redoStack.push(this.undoStack.pop()); this.m = JSON.parse(this.undoStack[this.undoStack.length - 1]); this.sel = null; this.syncControls(); this.render(); this.updUndo(); this.emit(); }
    redo() { if (!this.redoStack.length) return; const s = this.redoStack.pop(); this.undoStack.push(s); this.m = JSON.parse(s); this.sel = null; this.syncControls(); this.render(); this.updUndo(); this.emit(); }
    commit() { this.pushUndo(); this.render(); this.emit(); }

    validate() {
      const m = this.getMachine();
      if (this.model === 'FA') return F.FA.validate(m, { kind: m.type, alphabet: this.alphabet });
      if (this.model === 'PDA') return F.PDA.validate(m, { alphabet: this.alphabet });
      return F.TM.validate(m, { alphabet: this.alphabet });
    }
    updateStatus() {
      if (!this.status) return;
      const v = this.validate();
      UI.clear(this.status);
      const m = this.m;
      const kind = this.model === 'FA' ? G.TYPE_LABEL[m.type] : this.model === 'PDA' ? 'PDA' : 'Turing machine';
      const info = `${m.states.length} state${m.states.length === 1 ? '' : 's'} · ${m.transitions.length} transition${m.transitions.length === 1 ? '' : 's'}`;
      this.status.className = 'status' + (v.errors.length ? ' reject' : '');
      if (v.errors.length) this.status.append(h('span', '⚠'), h('span', v.errors[0]), v.errors.length > 1 ? h('span.dim', `(+${v.errors.length - 1} more)`) : null);
      else this.status.append(h('span.good', '✔'), h('span', `Valid ${kind} — ${info}`), v.warnings.length ? h('span.warn', { title: v.warnings.join('\n'), style: { marginLeft: 'auto', fontSize: '.76rem' } }, '⚠ ' + v.warnings[0].slice(0, 90)) : null);
      if (this.showTable) this.renderTable();
    }

    /* ---------- coordinates ---------- */
    metrics() { const r = this.svg.getBoundingClientRect(), vb = this.vb; const sc = Math.min(r.width / vb.w, r.height / vb.h) || 1; return { r, sc, ox: (r.width - vb.w * sc) / 2, oy: (r.height - vb.h * sc) / 2 }; }
    pt(e) { const { r, sc, ox, oy } = this.metrics(); return { x: this.vb.x + (e.clientX - r.left - ox) / sc, y: this.vb.y + (e.clientY - r.top - oy) / sc }; }
    toScreen(x, y) { const { r, sc, ox, oy } = this.metrics(); const wr = this.wrap.getBoundingClientRect(); return { x: r.left - wr.left + ox + (x - this.vb.x) * sc, y: r.top - wr.top + oy + (y - this.vb.y) * sc }; }
    setVB() { this.svg.setAttribute('viewBox', `${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}`); this.placeSelBar(); }
    fit() {
      const st = this.m.states;
      if (!st.length) { this.vb = { x: 0, y: 0, w: 900, h: 560 }; return this.setVB(); }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of st) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
      const pad = this.opts.compact ? 55 : 95;
      let w = Math.max(380, x1 - x0 + pad * 2), hh = Math.max(240, y1 - y0 + pad * 2);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const r = this.svg.getBoundingClientRect(); const asp = r.width && r.height ? r.width / r.height : 900 / 560;
      if (w / hh < asp) w = hh * asp; else hh = w / asp;
      this.vb = { x: cx - w / 2, y: cy - hh / 2 - (this.opts.compact ? 0 : 10), w, h: hh }; this.setVB();
    }

    /* ---------- editing operations ---------- */
    nextName() { const used = new Set(this.m.states.map((s) => s.name)); let i = 0; while (used.has('q' + i)) i++; return 'q' + i; }
    addState(x, y, opts = {}) {
      const id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      const s = { id, name: this.nextName(), x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, initial: !this.m.states.some((q) => q.initial), final: false, ...opts };
      this.m.states.push(s); this.sel = { state: id }; UI.sfx.place(); this.commit(); return s;
    }
    removeState(id) { this.m.states = this.m.states.filter((s) => s.id !== id); this.m.transitions = this.m.transitions.filter((t) => t.from !== id && t.to !== id); this.sel = null; UI.sfx.click(); this.commit(); }
    removeEdge(key) { const [a, b] = key.split('>'); this.m.transitions = this.m.transitions.filter((t) => !(t.from === a && t.to === b)); this.sel = null; this.commit(); }
    toggleInitial(id) { const s = this.m.states.find((q) => q.id === id); const was = s.initial; for (const q of this.m.states) q.initial = false; s.initial = !was; this.commit(); }
    toggleFinal(id) { const s = this.m.states.find((q) => q.id === id); s.final = !s.final; UI.sfx.click(); this.commit(); }
    async renameState(id) {
      const s = this.m.states.find((q) => q.id === id); const v = await UI.prompt('Rename state', s.name);
      if (v === null) return; const n = v.trim(); if (!n) return;
      s.name = n.slice(0, 12); this.commit();
    }
    select(sel) { this.sel = sel; this.render(); }

    /* ---------- events ---------- */
    bindEvents() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', (e) => {
        if (this.ro) return;
        this.wrap.focus({ preventScroll: true });
        const nodeEl = e.target.closest('[data-state]'), edgeEl = e.target.closest('[data-edge]');
        const p = this.pt(e);
        if (nodeEl) {
          const id = nodeEl.dataset.state; const s = this.m.states.find((q) => q.id === id);
          if (this.mode === 'delete') return this.removeState(id);
          if (this.mode === 'transition' || e.shiftKey) { this.drag = { type: 'link', from: id }; svg.setPointerCapture(e.pointerId); return; }
          this.sel = { state: id }; this.drag = { type: 'move', id, dx: p.x - s.x, dy: p.y - s.y, moved: false }; svg.setPointerCapture(e.pointerId); this.render(); return;
        }
        if (edgeEl) {
          const key = edgeEl.dataset.edge;
          if (this.mode === 'delete') return this.removeEdge(key);
          this.sel = { edge: key }; this.render(); const [a, b] = key.split('>'); this.openTransitionDialog(a, b); return;
        }
        if (this.mode === 'state') { this.addState(p.x, p.y); return; }
        this.sel = null; this.render();
        this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vb: { ...this.vb } }; svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', (e) => {
        const d = this.drag; if (!d) return;
        if (d.type === 'move') { const p = this.pt(e); const s = this.m.states.find((q) => q.id === d.id); s.x = Math.round((p.x - d.dx) / 10) * 10; s.y = Math.round((p.y - d.dy) / 10) * 10; d.moved = true; if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); }
        else if (d.type === 'link') {
          const p = this.pt(e), s = this.m.states.find((q) => q.id === d.from);
          UI.clear(this.gTemp); this.gTemp.appendChild(S('path', { class: 'temp-link', d: `M${s.x} ${s.y}L${p.x} ${p.y}` }));
          const over = document.elementFromPoint(e.clientX, e.clientY); const tgt = over && over.closest && over.closest('[data-state]');
          for (const [id, el] of this.nodeEls) el.classList.toggle('link-target', !!tgt && tgt.dataset.state === id);
        } else if (d.type === 'pan') { const { sc } = this.metrics(); this.vb = { ...d.vb, x: d.vb.x - (e.clientX - d.sx) / sc, y: d.vb.y - (e.clientY - d.sy) / sc }; this.setVB(); }
      });
      const end = (e) => {
        const d = this.drag; if (!d) return; this.drag = null;
        try { svg.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        if (d.type === 'move' && d.moved) this.commit();
        if (d.type === 'link') {
          UI.clear(this.gTemp);
          const over = document.elementFromPoint(e.clientX, e.clientY); const tgt = over && over.closest && over.closest('[data-state]');
          if (tgt) this.openTransitionDialog(d.from, tgt.dataset.state); else this.render();
        }
      };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
      svg.addEventListener('dblclick', (e) => {
        if (this.ro) return;
        const nodeEl = e.target.closest('[data-state]'); if (nodeEl) { this.toggleFinal(nodeEl.dataset.state); return; }
        if (e.target.closest('[data-edge]')) return;
        const p = this.pt(e); this.addState(p.x, p.y);
      });
      svg.addEventListener('wheel', (e) => {
        if (this.ro) return; e.preventDefault();
        const f = e.deltaY > 0 ? 1.12 : 0.89, p = this.pt(e);
        const w = Math.min(2400, Math.max(200, this.vb.w * f)), k = w / this.vb.w;
        this.vb = { x: p.x - (p.x - this.vb.x) * k, y: p.y - (p.y - this.vb.y) * k, w, h: this.vb.h * k }; this.setVB();
      }, { passive: false });
      this.wrap.addEventListener('keydown', (e) => {
        if (e.target !== this.wrap) return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); this.undo(); return; }
        if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); this.redo(); return; }
        if (k === 'v') this.setMode('select'); else if (k === 's') this.setMode('state'); else if (k === 't') this.setMode('transition'); else if (k === 'd') this.setMode('delete');
        if (k === 'escape') { this.sel = null; this.render(); }
        if (this.sel && this.sel.state) { if (k === 'delete' || k === 'backspace') this.removeState(this.sel.state); if (k === 'i') this.toggleInitial(this.sel.state); if (k === 'f') this.toggleFinal(this.sel.state); if (k === 'r') this.renameState(this.sel.state); }
        if (this.sel && this.sel.edge && (k === 'delete' || k === 'backspace')) this.removeEdge(this.sel.edge);
      });
      if (window.ResizeObserver) { const ro = new ResizeObserver(() => this.placeSelBar()); ro.observe(this.wrap); UI.onCleanup(() => ro.disconnect()); }
      this.setMode('select');
    }

    placeSelBar() {
      if (!this.selBar) return;
      if (!this.sel || !this.sel.state) { this.selBar.classList.add('hidden'); return; }
      const s = this.m.states.find((q) => q.id === this.sel.state); if (!s) { this.selBar.classList.add('hidden'); return; }
      UI.clear(this.selBar);
      const b = (t, title, fn, on) => h('button.tb' + (on ? '.on' : ''), { type: 'button', title, onclick: (e) => { e.stopPropagation(); fn(); } }, t);
      this.selBar.append(b('▶ Initial', 'Make initial (I)', () => this.toggleInitial(s.id), s.initial), b('◎ Accepting', 'Toggle accepting (F)', () => this.toggleFinal(s.id), s.final), b('✎ Rename', 'Rename (R)', () => this.renameState(s.id)), b('🗑', 'Delete (Del)', () => this.removeState(s.id)));
      this.selBar.classList.remove('hidden');
      const p = this.toScreen(s.x, s.y); const w = this.wrap.clientWidth;
      this.selBar.style.left = Math.max(6, Math.min(w - 330, p.x - 130)) + 'px'; this.selBar.style.top = Math.max(6, p.y - 78) + 'px';
    }

    /* ---------- rendering ---------- */
    rad(s) { return Math.max(26, Math.min(46, 14 + (s.name || '').length * 3.6)); }
    labelRows(ts) {
      if (this.model === 'FA') return [[...new Set(ts.map((t) => (isEps(t.read) ? 'ε' : t.read)))].join(',')];
      if (this.model === 'PDA') return ts.map((t) => `${UI.sym(t.read)},${UI.sym(t.pop)}→${UI.sym(t.push)}`);
      return ts.map((t) => `${blankShow(F.TM.norm(t.read))}→${blankShow(F.TM.norm(t.write))},${t.move}`);
    }
    render() {
      const m = this.m;
      UI.clear(this.gEdges); UI.clear(this.gNodes); this.edgeGeom.clear(); this.edgeEls.clear(); this.nodeEls.clear();
      const st = new Map(m.states.map((s) => [s.id, s]));
      const groups = new Map();
      for (const t of m.transitions) { if (!st.has(t.from) || !st.has(t.to)) continue; const k = t.from + '>' + t.to; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
      for (const [k, ts] of groups) this.drawEdge(k, ts, st, groups.has(ts[0].to + '>' + ts[0].from));
      for (const s of m.states) this.drawNode(s);
      this.placeSelBar(); this.updUndo();
      if (this.activeStates) this.applyActive();
    }
    drawEdge(key, ts, st, hasReverse) {
      const a = st.get(ts[0].from), b = st.get(ts[0].to);
      const eps = this.model === 'FA' && ts.every((t) => isEps(t.read));
      const rows = this.labelRows(ts);
      let d, lx, ly, geom;
      if (a === b) {
        const r = this.rad(a);
        const p0 = { x: a.x - r * 0.45, y: a.y - r * 0.9 }, c1 = { x: a.x - r * 1.5, y: a.y - r * 3 }, c2 = { x: a.x + r * 1.5, y: a.y - r * 3 }, p3 = { x: a.x + r * 0.45, y: a.y - r * 0.9 };
        d = `M${p0.x} ${p0.y}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p3.x} ${p3.y}`; lx = a.x; ly = a.y - r * 2.45 - (rows.length - 1) * 7; geom = { loop: true, p0, c1, c2, p3 };
      } else {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const [ux, uy] = norm(b.x - a.x, b.y - a.y), nx = -uy, ny = ux;
        const off = hasReverse ? 34 : 0;
        const c = { x: mid.x + nx * off * 2, y: mid.y + ny * off * 2 };
        const [d1x, d1y] = norm(c.x - a.x, c.y - a.y), [d2x, d2y] = norm(b.x - c.x, b.y - c.y);
        const ra = this.rad(a), rb = this.rad(b);
        const p0 = { x: a.x + d1x * ra, y: a.y + d1y * ra }, p2 = { x: b.x - d2x * (rb + 3), y: b.y - d2y * (rb + 3) };
        d = off ? `M${p0.x} ${p0.y}Q${c.x} ${c.y} ${p2.x} ${p2.y}` : `M${p0.x} ${p0.y}L${p2.x} ${p2.y}`;
        const q = quadAt(p0, off ? c : { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 }, p2, 0.5);
        const side = off ? Math.sign(off) : 1;
        lx = q.x + nx * (off ? 16 : 14) * side * (ny < 0 || (ny === 0 && nx < 0) ? 1 : 1); ly = q.y + ny * (off ? 16 : 14) * side - (rows.length - 1) * 7;
        geom = { p0, c: off ? c : { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 }, p2 };
      }
      this.edgeGeom.set(key, geom);
      const g = S('g', { class: 'edge' + (eps ? ' eps' : '') + (this.sel && this.sel.edge === key ? ' sel' : ''), 'data-edge': key });
      g.appendChild(S('path', { class: 'line', d, 'marker-end': `url(#${(eps ? this.markers.eps : this.markers.arr).id})` }));
      if (!this.ro) g.appendChild(S('path', { class: 'hit', d }));
      if (!this.opts.compact) {
        const wch = Math.max(...rows.map((r) => r.length));
        const bw = wch * 7.4 + 12, bh = rows.length * 14 + 6;
        g.appendChild(S('rect', { class: 'lbl-bg', x: lx - bw / 2, y: ly - bh / 2 - 1, width: bw, height: bh, rx: 6 }));
        const tx = S('text', { x: lx, y: ly - (rows.length - 1) * 7 + 4 });
        rows.forEach((r, i) => tx.appendChild(S('tspan', { x: lx, dy: i ? 14 : 0 }, r)));
        g.appendChild(tx);
      }
      this.gEdges.appendChild(g); this.edgeEls.set(key, g);
    }
    drawNode(s) {
      const r = this.rad(s);
      const g = S('g', { class: 'node' + (s.final ? ' final' : '') + (this.sel && this.sel.state === s.id ? ' sel' : ''), 'data-state': s.id, transform: `translate(${s.x} ${s.y})` });
      if (s.initial) g.appendChild(S('path', { class: 'init-arrow', d: `M${-r - 38} 0H${-r - 4}`, 'marker-end': `url(#${this.markers.arr.id})` }));
      g.appendChild(S('circle', { class: 'body', r }));
      if (s.final) g.appendChild(S('circle', { class: 'ring', r: r - 6 }));
      const nm = s.name || ''; const fs = nm.length > 9 ? 9 : nm.length > 6 ? 11 : 13;
      g.appendChild(S('text', { class: 'nm', style: { fontSize: fs + 'px' } }, nm.length > 14 ? nm.slice(0, 13) + '…' : nm));
      g.appendChild(S('title', null, nm));
      this.gNodes.appendChild(g); this.nodeEls.set(s.id, g);
    }

    /* ---------- tables ---------- */
    renderTable() {
      if (!this.tableWrap) return;
      this.tableWrap.classList.toggle('hidden', !this.showTable);
      if (!this.showTable) return;
      const m = this.getMachine(), alpha = (this.alphabet && this.alphabet.length ? this.alphabet : F.FA.symbols(m)).slice();
      const hasEps = F.FA.hasEps(m);
      const cols = hasEps ? [...alpha, 'ε'] : alpha;
      const st = new Map(m.states.map((s) => [s.id, s]));
      UI.clear(this.tableWrap);
      this.tableWrap.append(h('table.tbl', h('tr', h('th', 'δ'), cols.map((c) => h('th', c))),
        m.states.map((s) => h('tr', h('td', (s.initial ? '→ ' : '') + (s.final ? '* ' : '') + s.name), cols.map((c) => { const to = m.transitions.filter((t) => t.from === s.id && (c === 'ε' ? isEps(t.read) : t.read === c)).map((t) => st.get(t.to).name); return h('td', to.length ? (to.length > 1 ? '{' + to.join(',') + '}' : to[0]) : '—'); })))));
    }

    /* ---------- transition dialog ---------- */
    openTransitionDialog(from, to) {
      const m = this.m, fs = m.states.find((s) => s.id === from), ts = m.states.find((s) => s.id === to);
      if (!fs || !ts) return this.render();
      const existing = m.transitions.filter((t) => t.from === from && t.to === to);
      const title = `Transition  ${fs.name} → ${ts.name}`;
      let body, collect;
      if (this.model === 'FA') {
        const kind = this.kindSel ? this.kindSel.value : m.type;
        const input = h('input.text.mono', { value: existing.map((t) => (isEps(t.read) ? 'ε' : t.read)).join(','), placeholder: kind === 'ENFA' ? 'a,b   or   ε' : 'a,b', 'aria-label': 'Symbols' });
        const syms = [...(this.alphabet || [])];
        const toggle = (sym) => { const cur = new Set(input.value.split(/[\s,]+/).filter(Boolean)); if (cur.has(sym)) cur.delete(sym); else cur.add(sym); input.value = [...cur].join(','); chips.forEach((c) => c.classList.toggle('on', cur.has(c.dataset.s))); };
        const chips = (kind === 'ENFA' ? [...syms, 'ε'] : syms).map((s) => h('button.chip', { type: 'button', 'data-s': s, onclick: () => toggle(s) }, s));
        const sync = () => { const cur = new Set(input.value.split(/[\s,]+/).filter(Boolean)); chips.forEach((c) => c.classList.toggle('on', cur.has(c.dataset.s))); };
        input.addEventListener('input', sync); sync();
        body = h('div.col', h('p.muted', 'Symbols this transition reads (comma separated).', kind === 'ENFA' ? ' Use ε for an epsilon-portal that consumes no input.' : ''), chips.length ? h('div.chips', chips) : null, input);
        collect = () => {
          const toks = [...new Set(input.value.split(/[\s,]+/).filter(Boolean))];
          const out = [];
          for (const tk of toks) {
            if (/^(ε|eps|epsilon|λ)$/i.test(tk)) { if (kind !== 'ENFA' && this.opts.allowedKinds.length) return { error: 'ε-transitions need the ε-NFA type.' }; out.push({ read: '' }); continue; }
            if ([...tk].length !== 1) return { error: `“${tk}” is not a single symbol.` };
            out.push({ read: tk });
          }
          return { rows: out };
        };
      } else {
        const rows = (existing.length ? existing : [{}]).map((t) => ({ ...t }));
        const list = h('div.col');
        const draw = () => {
          UI.clear(list);
          rows.forEach((r, i) => {
            const f = (key, ph, w, val) => h('input.text.mono', { value: val, placeholder: ph, maxlength: key === 'push' ? 6 : 1, style: { width: w }, 'aria-label': ph, oninput: (e) => { r[key] = e.target.value; } });
            if (this.model === 'PDA') list.append(h('div.row', f('read', 'read ε', '84px', isEps(r.read) ? '' : r.read || ''), f('pop', 'pop ε', '84px', r.pop || ''), f('push', 'push ε', '110px', r.push || ''), h('button.icon-btn', { type: 'button', 'aria-label': 'Remove rule', onclick: () => { rows.splice(i, 1); if (!rows.length) rows.push({}); draw(); } }, '✕')));
            else list.append(h('div.row', f('read', 'read □', '84px', F.TM.norm(r.read) === '_' ? '' : r.read || ''), h('span', '→'), f('write', 'write □', '84px', F.TM.norm(r.write) === '_' ? '' : r.write || ''),
              h('select', { 'aria-label': 'Move', onchange: (e) => { r.move = e.target.value; } }, ['R', 'L', 'S'].map((mv) => h('option', { value: mv, selected: (r.move || 'R') === mv }, mv === 'R' ? 'R →' : mv === 'L' ? 'L ←' : 'S ·'))), h('button.icon-btn', { type: 'button', 'aria-label': 'Remove rule', onclick: () => { rows.splice(i, 1); if (!rows.length) rows.push({}); draw(); } }, '✕')));
          });
        };
        draw();
        body = h('div.col', h('p.muted', this.model === 'PDA' ? 'Each rule: read input symbol, pop stack symbol, push string (leftmost = new top). Leave a field empty for ε.' : 'Each rule: read symbol → write symbol, then move the head. Empty = blank □. Move R/L/S.'), list, h('button.btn.sm', { type: 'button', onclick: () => { rows.push({}); draw(); } }, '＋ add rule'));
        collect = () => {
          const out = [];
          for (const r of rows) {
            if (this.model === 'PDA') { const rd = (r.read || '').trim(), pp = (r.pop || '').trim(), pu = (r.push || '').trim().replace(/ε/g, ''); if ([...rd].length > 1 || [...pp].length > 1) return { error: 'read and pop are single symbols (or empty = ε).' }; out.push({ read: rd === 'ε' ? '' : rd, pop: pp === 'ε' ? '' : pp, push: pu }); }
            else { const rd = (r.read || '').trim() || '_', wr = (r.write || '').trim() || '_'; if ([...rd].length > 1 || [...wr].length > 1) return { error: 'Tape symbols are single characters.' }; out.push({ read: rd === '□' ? '_' : rd, write: wr === '□' ? '_' : wr, move: r.move || 'R' }); }
          }
          return { rows: out };
        };
      }
      const err = h('div.gram-err');
      const wrapBody = h('div', body, err);
      UI.modal({ title, body: wrapBody, buttons: [
        { label: 'Delete transition', danger: true, onClick: () => { m.transitions = m.transitions.filter((t) => !(t.from === from && t.to === to)); this.sel = null; this.commit(); } },
        { label: 'Cancel', onClick: () => { this.render(); } },
        { label: 'Save', primary: true, onClick: () => { const r = collect(); if (r.error) { err.textContent = r.error; return false; } m.transitions = m.transitions.filter((t) => !(t.from === from && t.to === to)); for (const row of r.rows) m.transitions.push({ id: F.nextTransitionId(), from, to, ...row }); UI.sfx.place(); this.commit(); } },
      ], onClose: () => { this.render(); } });
    }

    /* ---------- JFLAP bridge ---------- */
    exportJff() { const m = this.getMachine(); UI.download(`machine_${UI.safeName(m.type)}.jff`, F.JFLAP.exportMachine(m), 'application/xml'); UI.toast('Exported a JFLAP-compatible .jff file — open it in JFLAP.', { icon: '⬇' }); }
    async importJff() {
      const f = await UI.pickFile('.jff,.xml'); if (!f) return;
      try {
        const m = F.JFLAP.importXML(f.text);
        const want = this.model === 'FA' ? ['DFA', 'NFA', 'ENFA'] : [this.model];
        if (!want.includes(m.type)) throw new Error(`This editor holds ${this.model === 'FA' ? 'finite automata' : this.model}; the file is a ${m.type}.`);
        if (this.model === 'FA' && !this.opts.allowedKinds.includes(m.type)) m.type = this.opts.allowedKinds[this.opts.allowedKinds.length - 1];
        if (this.alphabet) m.alphabet = [...this.alphabet];
        this.setMachine(m, { silent: false }); UI.toast(`Imported ${f.name}`, { icon: '⬆', kind: 'good' });
      } catch (e) { UI.toast('Import failed: ' + e.message, { kind: 'bad', icon: '⚠' }); }
    }

    /* ======================= computation animation ======================= */
    stPos(id) { const s = this.m.states.find((q) => q.id === id); return s ? { x: s.x, y: s.y } : { x: 0, y: 0 }; }
    clearFrame() { this.frameToken++; this.activeStates = null; UI.clear(this.gOrbs); for (const el of this.nodeEls.values()) el.classList.remove('active', 'good', 'bad'); for (const el of this.edgeEls.values()) { el.classList.remove('hot'); const p = el.querySelector('path.line'); if (p) p.setAttribute('marker-end', `url(#${(el.classList.contains('eps') ? this.markers.eps : this.markers.arr).id})`); } }
    applyActive() { for (const [id, el] of this.nodeEls) el.classList.toggle('active', this.activeStates.includes(id)); }
    /** colour states as accepting/rejecting at the end of a run */
    markResult(stateIds, accepted) { for (const [id, el] of this.nodeEls) { el.classList.remove('good', 'bad'); if (stateIds.includes(id)) el.classList.add(accepted ? 'good' : 'bad'); } }
    markDivergence(stateId) { const el = this.nodeEls.get(stateId); if (el) el.classList.add('bad'); }
    hotEdge(tid) {
      const t = this.m.transitions.find((x) => x.id === tid); if (!t) return;
      const el = this.edgeEls.get(t.from + '>' + t.to); if (!el) return;
      el.classList.add('hot'); setTimeout(() => el.classList.remove('hot'), 900);
    }
    pointOn(key, k, reverse) {
      const g = this.edgeGeom.get(key); if (!g) return null;
      const t = reverse ? 1 - k : k;
      return g.loop ? cubicAt(g.p0, g.c1, g.c2, g.p3, t) : quadAt(g.p0, g.c, g.p2, t);
    }
    makeOrb(kind, label) {
      const g = S('g', { class: 'orb ' + kind }, S('circle', { class: 'halo', r: 15 }), S('circle', { class: 'core', r: 10 }));
      if (label) g.appendChild(S('text', null, label));
      this.gOrbs.appendChild(g); return g;
    }
    /** show one simulation frame. `prev` lets clones travel along edges from their parents. */
    async showFrame(frame, prev, { animate = true, label } = {}) {
      const token = ++this.frameToken;
      UI.clear(this.gOrbs);
      this.activeStates = [...new Set(frame.clones.map((c) => c.state))]; this.applyActive();
      const byId = new Map([...(prev ? prev.clones : []), ...frame.clones].map((c) => [c.id, c]));
      const jobs = [];
      for (const d of frame.dead || []) {
        const p = this.stPos(d.state); const o = this.makeOrb('dead', '✕'); o.setAttribute('transform', `translate(${p.x} ${p.y})`);
        o.style.transition = 'opacity .8s'; requestAnimationFrame(() => (o.style.opacity = 0)); setTimeout(() => o.remove(), 900);
      }
      let splitDone = false;
      for (const c of frame.clones) {
        const dest = this.stPos(c.state);
        const orb = this.makeOrb(c.kind || 'move', label ? label(c) : null);
        const par = c.parent !== null && c.parent !== undefined ? byId.get(c.parent) : null;
        const start = par ? this.stPos(par.state) : dest;
        orb.setAttribute('transform', `translate(${dest.x} ${dest.y})`);
        if (!animate || !par || par.state === c.state && c.kind !== 'move' && c.kind !== 'split') { if (c.kind === 'eps' && animate) { this.burst(dest); UI.sfx.portal(); } continue; }
        if (c.via) this.hotEdge(c.via);
        const t = this.m.transitions.find((x) => x.id === c.via);
        const key = t ? t.from + '>' + t.to : null;
        if (c.kind === 'eps') {
          this.burst(start); UI.sfx.portal();
          orb.style.opacity = 0; orb.setAttribute('transform', `translate(${start.x} ${start.y})`);
          jobs.push(tween(420, (k) => { orb.style.opacity = k < .5 ? 0 : (k - .5) * 2; orb.setAttribute('transform', `translate(${start.x + (dest.x - start.x) * k} ${start.y + (dest.y - start.y) * k})`); }).then(() => { if (token === this.frameToken) this.burst(dest); }));
        } else {
          if (c.kind === 'split' && !splitDone) { UI.sfx.split(); splitDone = true; } else if (!splitDone) UI.sfx.step();
          jobs.push(tween(c.kind === 'split' ? 640 : 520, (k) => { const p = key ? this.pointOn(key, k, false) : null; const x = p ? p.x : start.x + (dest.x - start.x) * k, y = p ? p.y : start.y + (dest.y - start.y) * k; const kk = k > .85 && p ? { x: x + (dest.x - x) * ((k - .85) / .15), y: y + (dest.y - y) * ((k - .85) / .15) } : { x, y }; orb.setAttribute('transform', `translate(${kk.x} ${kk.y})`); }));
        }
      }
      await Promise.all(jobs);
    }
    burst(p) { const b = S('circle', { class: 'burst', cx: p.x, cy: p.y, r: 22 }); this.gOrbs.appendChild(b); setTimeout(() => b.remove(), 800); }
  };

  /* ====================================================================== */
  /*                           GRAMMAR EDITOR                               */
  /* ====================================================================== */
  const hueOf = (ch) => (ch.charCodeAt(0) * 47) % 360;
  UI.GrammarEditor = class GrammarEditor {
    constructor(host, opts = {}) {
      this.opts = Object.assign({ alphabet: [], onChange: null, text: '', given: null }, opts);
      this.parsed = null;
      this.ta = h('textarea.mono', { spellcheck: 'false', 'aria-label': 'Grammar productions', placeholder: 'S -> aSb | ε\n# one rule per line · UPPER-CASE = nonterminal · ε = empty string', oninput: () => this.schedule() }, this.opts.text);
      this.errs = h('div'); this.seeds = h('div.seed-list'); this.info = h('div.status', { style: { margin: '0' } });
      const ins = (t) => h('button.chip', { type: 'button', onclick: () => { const s = this.ta.selectionStart; this.ta.setRangeText(t, s, this.ta.selectionEnd, 'end'); this.ta.focus(); this.parse(); } }, t);
      this.symBar = h('div.sym-bar', ins('→'), ins('|'), ins('ε'), ...[...(this.opts.alphabet || [])].map(ins), h('span.sp'),
        h('button.tb', { type: 'button', onclick: () => this.exportJff() }, '⬇ .jff'), h('button.tb', { type: 'button', onclick: () => this.importJff() }, '⬆ .jff'));
      this.panel = h('div.panel.editor', h('div.toolbar', h('b.sub', 'Grammar editor'), h('span.sp'), h('span.muted', { style: { fontSize: '.74rem' } }, 'Nonterminals are UPPER-CASE letters (S, A, S\') · everything else is a terminal')),
        h('div', { style: { padding: '.7rem' } }, this.symBar, this.ta, this.errs, h('div.sub', { style: { margin: '.7rem 0 .4rem' } }, 'Seeds (production rules)'), this.seeds, h('div', { style: { marginTop: '.7rem' } }, this.info)));
      host.appendChild(this.panel);
      this.parse(true);
    }
    schedule() { clearTimeout(this._t); this._t = setTimeout(() => this.parse(), 140); }
    parse(silent) {
      const r = F.CFG.parseText(this.ta.value);
      this.parsed = r;
      UI.clear(this.errs); UI.clear(this.seeds); UI.clear(this.info);
      r.errors.forEach((e) => this.errs.append(h('div.gram-err', '✘ ' + e)));
      r.warnings.forEach((e) => this.errs.append(h('div.gram-warn', '⚠ ' + e)));
      for (const p of r.grammar.productions) this.seeds.append(h('span.seed', { style: { borderColor: `hsl(${hueOf(p.left)} 70% 60% / .6)`, background: `hsl(${hueOf(p.left)} 70% 50% / .1)` } }, F.CFG.prodText(p)));
      const nts = F.CFG.nonterminals(r.grammar).length, ts = F.CFG.terminals(r.grammar);
      this.info.className = 'status' + (r.errors.length ? ' reject' : '');
      this.info.append(r.errors.length ? h('span', '⚠ Fix the highlighted problems') : h('span.good', '✔'), r.errors.length ? null : h('span', `Valid CFG — start ${r.grammar.start}, ${r.grammar.productions.length} productions, ${nts} nonterminal${nts === 1 ? '' : 's'}, terminals {${ts.join(', ')}}`), r.errors.length ? null : h('span.dim', { style: { marginLeft: 'auto' } }, F.CFG.isCNF(r.grammar) ? 'In Chomsky Normal Form ✓' : 'Not in CNF'));
      if (!silent && this.opts.onChange) this.opts.onChange(this.getMachine());
    }
    getMachine() { return this.parsed && !this.parsed.errors.length ? this.parsed.grammar : this.parsed ? { ...this.parsed.grammar, invalid: true, productions: this.parsed.errors.length ? [] : this.parsed.grammar.productions } : null; }
    getText() { return this.ta.value; }
    setMachine(g) { this.ta.value = F.CFG.toText(g); this.parse(true); }
    setText(t) { this.ta.value = t; this.parse(true); }
    validate() { const r = this.parsed || F.CFG.parseText(this.ta.value); return { errors: r.errors, warnings: r.warnings, ok: !r.errors.length }; }
    exportJff() { const g = this.getMachine(); if (!g || !g.productions.length) return UI.toast('Write a grammar first.', { kind: 'warn' }); UI.download('grammar.jff', F.JFLAP.exportMachine(g), 'application/xml'); UI.toast('Exported grammar.jff for JFLAP.', { icon: '⬇' }); }
    async importJff() { const f = await UI.pickFile('.jff,.xml'); if (!f) return; try { const g = F.JFLAP.importXML(f.text); if (g.type !== 'CFG') throw new Error('That file is not a grammar.'); this.setMachine(g); this.parse(); UI.toast('Grammar imported', { kind: 'good', icon: '⬆' }); } catch (e) { UI.toast(e.message, { kind: 'bad' }); } }
  };
})();
