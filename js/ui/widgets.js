/* ============================================================================
 * UI LAYER · visualisation widgets and simulation decks
 *   Ribbon · StackView · TapeView · TreeView
 *   SimDeck     — run / step / back / reset a DFA, NFA, ε-NFA, PDA or TM
 *   GrammarDeck — test strings against a CFG, grow & inspect parse trees
 * Every visual effect is driven by the real formal engine (js/formal/*).
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, F = AM.F, G = AM.G;
  const h = UI.h, S = UI.svg;
  const FA = F.FA, PDA = F.PDA, TM = F.TM, CFG = F.CFG;

  /* ---------------- ribbon (input tape for FA / PDA) ---------------- */
  UI.Ribbon = class {
    constructor() { this.el = h('div.ribbon', { 'aria-label': 'Input string' }); }
    set(str, consumed, current) {
      UI.clear(this.el);
      const chars = [...str];
      if (!chars.length) this.el.append(h('div.rcell.end', { title: 'empty string' }, 'ε'));
      chars.forEach((c, i) => this.el.append(h('div.rcell' + (i < consumed ? '.read' : '') + (current === i ? '.now' : ''), c)));
      this.el.append(h('div.rcell.end', { title: 'end of input' }, '⊣'));
    }
  };

  /* ---------------- stack (PDA) ---------------- */
  UI.StackView = class {
    constructor() {
      this.box = h('div.stackview', { role: 'img', 'aria-label': 'Stack' });
      this.el = h('div', h('div.stack-label', 'Stack  (top ↑)'), this.box); this.prev = [];
    }
    set(stack, sound = true) {
      const prev = this.prev; let c = 0;
      while (c < prev.length && c < stack.length && prev[prev.length - 1 - c] === stack[stack.length - 1 - c]) c++;
      const added = stack.length - c, removed = prev.length - c;
      UI.clear(this.box);
      if (!stack.length) this.box.append(h('div.stack-empty', 'empty'));
      // column-reverse: first child is at the bottom
      for (let i = stack.length - 1; i >= 0; i--) {
        const isNew = i < added, bottom = i === stack.length - 1 && stack[i] === 'Z';
        const el = h('div.crate-s' + (bottom ? '.bottom' : ''), stack[i]);
        if (!isNew) el.style.animation = 'none';
        this.box.append(el);
      }
      if (sound && added > 0) UI.sfx.push(); else if (sound && removed > 0) UI.sfx.pop();
      this.prev = stack.slice();
    }
    reset() { this.prev = []; UI.clear(this.box); }
  };

  /* ---------------- tape (Turing machine) ---------------- */
  UI.TapeView = class {
    constructor() { this.row = h('div.tapeview', { role: 'img', 'aria-label': 'Tape' }); this.lbl = h('div.tape-state'); this.el = h('div', this.row, this.lbl); this.prev = null; }
    set(snap, label) {
      const cellAt = (i) => { const k = i - snap.off; return k >= 0 && k < snap.cells.length ? snap.cells[k] : '_'; };
      const prevAt = (i) => { if (!this.prev) return null; const k = i - this.prev.off; return k >= 0 && k < this.prev.cells.length ? this.prev.cells[k] : '_'; };
      UI.clear(this.row);
      for (let i = snap.head - 7; i <= snap.head + 7; i++) {
        const c = cellAt(i), p = prevAt(i);
        const el = h('div.tcell' + (i === snap.head ? '.head' : '') + (p !== null && p !== c ? '.wr' : ''), c === '_' ? h('span.blank', '□') : c);
        this.row.append(el);
      }
      this.lbl.textContent = label || `state ${snap.stateName || snap.state} · head at cell ${snap.head}`;
      this.prev = snap;
    }
    reset() { this.prev = null; UI.clear(this.row); this.lbl.textContent = ''; }
  };

  /* ---------------- derivation tree ---------------- */
  let _nid = 0;
  const idOf = (n) => n._nid || (n._nid = ++_nid);
  UI.TreeView = class {
    constructor() { this.el = h('div.treeview'); this.seen = new Set(); }
    clearSeen() { this.seen = new Set(); }
    /** root: {sym, term?, eps?, children?}. Open nonterminals (no children yet) glow. opts.onPick(node) makes them clickable. */
    set(root, opts = {}) {
      UI.clear(this.el);
      if (!root) { this.el.append(h('div.empty', 'The tree will grow here.')); return; }
      let leaf = 0, maxD = 0;
      const lay = (n, d) => {
        n._d = d; maxD = Math.max(maxD, d);
        if (!n.children || !n.children.length) { n._x = 34 + leaf++ * 46; return; }
        n.children.forEach((c) => lay(c, d + 1));
        n._x = (n.children[0]._x + n.children[n.children.length - 1]._x) / 2;
      };
      lay(root, 0);
      const W = Math.max(280, 40 + leaf * 46), H = 50 + maxD * 62;
      const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Derivation tree' });
      const lines = S('g'), nodes = S('g'); svg.append(lines, nodes);
      const draw = (n) => {
        const x = n._x, y = 28 + n._d * 62;
        (n.children || []).forEach((c) => { lines.append(S('path', { class: 'tl', d: `M${x} ${y + 17}C${x} ${y + 40} ${c._x} ${28 + c._d * 62 - 40} ${c._x} ${28 + c._d * 62 - 17}` })); draw(c); });
        const open = !n.term && (!n.children || !n.children.length);
        const isNew = !this.seen.has(idOf(n)); this.seen.add(idOf(n));
        const pick = open && opts.onPick;
        const g = S('g', { class: 'tn' + (n.term ? ' term' : '') + (open ? ' open' : '') + (n.eps ? ' eps' : '') + (pick ? ' pick' : '') + (isNew && !UI.reduceMotion() ? ' grow-in' : ''), style: { transformBox: 'fill-box', transformOrigin: 'center' } }, S('circle', { r: 17 }), S('text', null, n.sym));
        if (pick) { g.setAttribute('tabindex', 0); g.addEventListener('click', () => opts.onPick(n)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter') opts.onPick(n); }); }
        nodes.append(S('g', { transform: `translate(${x} ${y})` }, g));
      };
      draw(root);
      this.el.append(svg);
    }
  };
  /** the tree as it looks after k leftmost-derivation steps (nonterminals expand in pre-order) */
  UI.partialTree = function (tree, k) {
    let i = 0;
    const walk = (n) => {
      if (n.term) return { sym: n.sym, term: true, eps: n.eps, _nid: idOf(n) };
      const idx = i++;
      if (idx >= k) return { sym: n.sym, children: [], _nid: idOf(n) };
      return { sym: n.sym, children: n.children.map(walk), _nid: idOf(n) };
    };
    return walk(tree);
  };
  UI.countNT = (t) => (t.term ? 0 : 1 + t.children.reduce((a, c) => a + UI.countNT(c), 0));

  /* ====================================================================== */
  /*                               SimDeck                                   */
  /* ====================================================================== */
  UI.SimDeck = class SimDeck {
    /** opts: { model:'FA'|'PDA'|'TM', editor, getMachine(), onTest(w), world } */
    constructor(host, opts) {
      this.o = opts; this.model = opts.model; this.editor = opts.editor;
      this.frames = []; this.idx = -1; this.playing = false; this.speed = 1; this.runId = 0; this.cur = null;
      this.input = h('input.text.mono', { placeholder: this.model === 'TM' ? 'tape input (e.g. 0110)' : 'input string (empty = ε)', 'aria-label': 'Input string', onkeydown: (e) => { if (e.key === 'Enter') this.run(); }, maxlength: 40 });
      this.ribbon = new UI.Ribbon();
      this.stack = this.model === 'PDA' ? new UI.StackView() : null;
      this.tape = this.model === 'TM' ? new UI.TapeView() : null;
      this.supChip = h('span.supchip.hidden');
      this.status = h('div.status', 'Enter a string and press Run — or Step through it.');
      this.log = h('div.log', { 'aria-label': 'Computation trace' });
      this.sub = h('label.speed', h('span', 'speed'), h('input', { type: 'range', min: 0.4, max: 3, step: 0.1, value: 1, 'aria-label': 'Animation speed', oninput: (e) => (this.speed = +e.target.value) }));
      const btn = (t, title, fn, cls = '') => h('button.btn.sm' + (cls ? '.' + cls : ''), { type: 'button', title, onclick: fn }, t);
      this.playBtn = btn('▶ Run', 'Run the whole computation (Enter)', () => this.run(), 'primary');
      this.ctrl = h('div.sim-ctrl', this.playBtn, btn('⏮', 'Step back', () => this.stepBack()), btn('⏭ Step', 'Step forward', () => this.step()), btn('↺ Reset', 'Reset', () => this.reset()), btn('✓ Test String', 'Instantly test the string (counts as a test)', () => this.test()), this.sub);
      this.el = h('div.panel', h('h3', this.model === 'TM' ? 'Tape Simulator' : this.model === 'PDA' ? 'Stack Simulator' : 'Simulation Deck'), h('div.sim-input', this.input), this.ctrl,
        this.model === 'TM' ? this.tape.el : [this.ribbon.el, this.stack ? this.stack.el : null, this.supChip], this.status, h('div.sub', { style: { margin: '.6rem 0 .3rem' } }, 'Computation trace'), this.log);
      host.appendChild(this.el);
      this.ribbon.set('', 0, -1);
    }
    setInput(w) { this.input.value = w; this.reset(); }
    getInput() { return this.input.value.replace(/\s/g, ''); }

    /** build the frame list for the current machine & input */
    prepare() {
      const m = this.o.getMachine(), w = this.getInput();
      const v = this.o.validate ? this.o.validate() : { ok: true };
      if (!v.ok) { this.setStatus('Fix the machine first: ' + v.errors[0], 'reject'); return null; }
      this.cur = { w, m }; this.frames = [];
      if (this.model === 'FA') {
        const r = FA.simulate(m, w); this.result = { accepted: r.accepted };
        const nm = (id) => (m.states.find((s) => s.id === id) || {}).name;
        this.frames = r.frames.map((f, i) => ({ ...f, text: f.kind === 'start' ? `start → {${f.superSet.map(nm).join(',')}}` : f.kind === 'eps' ? `ε-portal → {${f.superSet.map(nm).join(',')}}` : `read “${f.symbol}” → {${f.superSet.map(nm).join(',') || '∅ — all clones died'}}${f.dead.length ? `  ✕${f.dead.length} died` : ''}${f.clones.some((c) => c.kind === 'split') ? '  ⑂ split' : ''}${f.merged.length ? '  ⧉ merged' : ''}`, pos: f.index, reading: f.kind === 'read' ? f.index - 1 : -1 }));
        this.finalStates = r.finalStates || [];
        this.note = r.accepted ? 'Accepted — at least one clone ended in an accepting state.' : r.stuckAt !== null && r.stuckAt !== undefined ? `Rejected — every clone died while reading “${[...w][r.stuckAt]}”.` : 'Rejected — no clone ended in an accepting state.';
      } else if (this.model === 'PDA') {
        const r = PDA.simulate(m, w, { maxNodes: 20000 }); this.result = { accepted: r.accepted };
        const path = r.accepted ? r.path : r.bestPath;
        const nm = (id) => (m.states.find((s) => s.id === id) || {}).name;
        const rest = [...w];
        this.frames = path.map((c, i) => ({ kind: i ? 'move' : 'start', index: c.pos, clones: [{ id: i, parent: i ? i - 1 : null, state: c.state, via: c.via, kind: i && c.via && (m.transitions.find((t) => t.id === c.via) || {}).read === '' ? 'eps' : 'move' }], dead: [], stack: c.stack, pos: c.pos, reading: i && c.pos > path[i - 1].pos ? c.pos - 1 : -1,
          text: `(${nm(c.state)}, ${rest.slice(c.pos).join('') || 'ε'}, ${c.stack.length ? c.stack.join('') : 'ε'})` }));
        this.finalStates = path.length ? [path[path.length - 1].state] : [];
        this.note = r.accepted ? `Accepted by ${m.acceptMode === 'empty' ? 'empty stack' : 'final state'} after exploring ${r.explored} configuration${r.explored === 1 ? '' : 's'}.` : `Rejected — all ${r.explored} reachable configurations fail${r.underflows ? ` (${r.underflows} stack-underflow attempt${r.underflows > 1 ? 's' : ''} blocked)` : ''}${r.truncated ? ' · search was truncated' : ''}. Showing the furthest branch.`;
      } else {
        const r = TM.run(m, w, { maxSteps: 3000, traceLimit: 3000 }); this.result = { accepted: r.status === 'accepted', tm: r };
        const nm = (id) => (m.states.find((s) => s.id === id) || {}).name;
        this.frames = r.trace.map((s, i) => ({ kind: i ? 'move' : 'start', index: i, clones: [{ id: i, parent: i ? i - 1 : null, state: s.state, via: s.via, kind: 'move' }], dead: [], snap: { ...s, stateName: nm(s.state) }, text: `step ${s.step}: ${nm(s.state)} · head ${s.head} · ${(s.cells.slice(0, 26))}` }));
        this.finalStates = [r.state];
        this.note = r.status === 'accepted' ? `Halted in a final state after ${r.steps} steps. Tape: ${TM.trimTape(r.output) || '(blank)'}` : r.status === 'rejected' ? `Halted without accepting after ${r.steps} steps (no transition applies).` : `Step limit reached (${r.steps}) — a running machine does NOT prove it never halts.`;
      }
      return true;
    }
    setStatus(t, kind = '') { this.status.className = 'status' + (kind ? ' ' + kind : ''); UI.clear(this.status); this.status.append(...(Array.isArray(t) ? t : [t])); }

    /* ---- playback ---- */
    async show(i, animate = true) {
      if (!this.frames.length) return;
      i = Math.max(0, Math.min(this.frames.length - 1, i));
      const f = this.frames[i], prev = i > 0 ? this.frames[i - 1] : null; this.idx = i;
      this.ribbon.set(this.cur.w, f.pos || 0, f.reading);
      if (this.stack) this.stack.set(f.stack || [], animate);
      if (this.tape && f.snap) this.tape.set(f.snap);
      if (this.model === 'FA') { this.supChip.classList.remove('hidden'); this.supChip.textContent = 'super-state ' + '{' + f.superSet.map((id) => (this.cur.m.states.find((s) => s.id === id) || {}).name).join(', ') + '}'; }
      [...this.log.children].forEach((c, k) => { c.className = k === i ? 'cur' : k < i ? 'past' : ''; if (k === i) c.scrollIntoView({ block: 'nearest' }); });
      this.setStatus(f.text, '');
      await this.editor.showFrame(f, prev, { animate });
    }
    ensure() {
      if (this.frames.length && this.cur && this.cur.w === this.getInput() && JSON.stringify(this.cur.m) === JSON.stringify(this.o.getMachine())) return true;
      this.editor.clearFrame();
      if (!this.prepare()) return false;
      UI.clear(this.log); this.frames.forEach((f) => this.log.append(h('div', f.text))); this.idx = -1; if (this.tape) this.tape.reset(); if (this.stack) this.stack.reset();
      return true;
    }
    reset() { this.runId++; this.playing = false; this.playBtn.textContent = '▶ Run'; this.frames = []; this.cur = null; this.idx = -1; UI.clear(this.log); this.editor.clearFrame(); this.ribbon.set(this.getInput(), 0, -1); if (this.stack) this.stack.reset(); if (this.tape) this.tape.reset(); this.supChip.classList.add('hidden'); this.setStatus('Enter a string and press Run — or Step through it.'); }
    async step() { if (!this.ensure()) return; this.runId++; this.playing = false; this.playBtn.textContent = '▶ Run'; if (this.idx >= this.frames.length - 1) return this.finish(); this.o.onTest && this.o.onTest(this.getInput()); await this.show(this.idx + 1); if (this.idx >= this.frames.length - 1) this.finish(); }
    async stepBack() { if (!this.frames.length || this.idx <= 0) return; this.runId++; this.playing = false; await this.show(this.idx - 1, false); }
    async run() {
      if (this.playing) { this.runId++; this.playing = false; this.playBtn.textContent = '▶ Run'; return; }
      if (!this.ensure()) return;
      this.o.onTest && this.o.onTest(this.getInput());
      const id = ++this.runId; this.playing = true; this.playBtn.textContent = '⏸ Pause';
      let i = this.idx >= this.frames.length - 1 ? 0 : this.idx + 1;
      if (this.idx >= this.frames.length - 1) { this.editor.clearFrame(); }
      for (; i < this.frames.length; i++) {
        await this.show(i);
        if (id !== this.runId) return;
        await UI.sleep(420 / this.speed);
        if (id !== this.runId) return;
      }
      this.playing = false; this.playBtn.textContent = '▶ Run'; this.finish();
    }
    finish() {
      const ok = this.result.accepted;
      this.editor.markResult(this.finalStates, ok);
      this.setStatus([h('b', ok ? '✔ ACCEPT' : '✘ REJECT'), h('span', { style: { fontWeight: 400 } }, '  ' + this.note)], ok ? 'accept' : 'reject');
      ok ? UI.sfx.ok() : UI.sfx.bad();
      if (this.o.onResult) this.o.onResult(this.cur.w, ok);
    }
    /** instant evaluation (no animation) — counts as a test string */
    test() {
      this.runId++; this.playing = false; this.playBtn.textContent = '▶ Run';
      this.editor.clearFrame(); this.frames = []; this.cur = null;
      if (!this.prepare()) return;
      UI.clear(this.log); this.frames.forEach((f, k) => this.log.append(h('div' + (k === this.frames.length - 1 ? '.cur' : '.past'), f.text)));
      this.o.onTest && this.o.onTest(this.getInput());
      const last = this.frames.length - 1; this.idx = last;
      if (last >= 0) { const f = this.frames[last]; this.ribbon.set(this.cur.w, f.pos || 0, -1); if (this.stack) this.stack.set(f.stack || [], false); if (this.tape && f.snap) this.tape.set(f.snap); this.editor.activeStates = [...new Set(f.clones.map((c) => c.state))]; this.editor.applyActive(); }
      this.finish();
    }
    /** replay a failing string, then highlight where the computation ended (debug overlay) */
    async debugReplay(w) { this.input.value = w; this.reset(); await this.run(); }
  };

  /* ====================================================================== */
  /*                             GrammarDeck                                 */
  /* ====================================================================== */
  UI.GrammarDeck = class GrammarDeck {
    /** opts: { getGrammar(), validate(), onTest(w), alphabet } */
    constructor(host, opts) {
      this.o = opts; this.trees = []; this.which = 0; this.step = 0; this.timer = null;
      this.input = h('input.text.mono', { placeholder: 'string to derive (empty = ε)', 'aria-label': 'Test string', maxlength: 40, onkeydown: (e) => { if (e.key === 'Enter') this.test(true); } });
      this.tree = new UI.TreeView();
      this.status = h('div.status', 'Type a string and press “Grow tree” to watch the derivation grow.');
      this.deriv = h('div.deriv'); this.tabs = h('div.row');
      const btn = (t, title, fn, cls = '') => h('button.btn.sm' + (cls ? '.' + cls : ''), { type: 'button', title, onclick: fn }, t);
      this.el = h('div.panel', h('h3', 'Derivation Garden'), h('div.sim-input', this.input),
        h('div.sim-ctrl', btn('🌱 Grow tree', 'Animate the derivation tree', () => this.test(true), 'primary'), btn('✓ Test String', 'Instant CYK membership test', () => this.test(false)), btn('↺ Reset', 'Clear', () => this.reset())),
        this.status, this.tabs, h('div', { style: { marginTop: '.5rem' } }, this.tree.el), h('div.sub', { style: { margin: '.6rem 0 .3rem' } }, 'Leftmost derivation'), this.deriv);
      host.appendChild(this.el); this.tree.set(null);
    }
    reset() { clearInterval(this.timer); this.trees = []; this.tree.set(null); this.tree.clearSeen(); UI.clear(this.deriv); UI.clear(this.tabs); this.status.className = 'status'; this.status.textContent = 'Type a string and press “Grow tree” to watch the derivation grow.'; }
    test(animate) {
      clearInterval(this.timer);
      const v = this.o.validate(); if (!v.ok) { this.status.className = 'status reject'; this.status.textContent = 'Fix the grammar first: ' + v.errors[0]; return; }
      const g = this.o.getGrammar(), w = this.input.value.replace(/\s/g, '');
      this.o.onTest && this.o.onTest(w);
      const ok = CFG.accepts(g, w);
      this.trees = ok ? CFG.parseTrees(g, w, 3) : []; this.which = 0; this.tree.clearSeen();
      UI.clear(this.tabs);
      if (!ok) { this.tree.set(null); UI.clear(this.deriv); this.status.className = 'status reject'; this.status.innerHTML = ''; this.status.append(h('b', '✘ REJECT'), `  “${w || 'ε'}” cannot be derived from ${g.start}.`); UI.sfx.bad(); if (this.o.onResult) this.o.onResult(w, false); return; }
      if (this.trees.length > 1) { this.tabs.append(h('span.badge.no', '⚠ AMBIGUOUS — ' + (this.trees.length >= 3 ? '3+' : this.trees.length) + ' parse trees'), ...this.trees.slice(0, 3).map((_, i) => h('button.chip' + (i === 0 ? '.on' : ''), { type: 'button', onclick: (e) => { this.which = i; UI.$$('.chip', this.tabs).forEach((c) => c.classList.remove('on')); e.target.classList.add('on'); this.draw(false); } }, 'tree ' + (i + 1)))); if (this.o.onAmbiguous) this.o.onAmbiguous(w); }
      this.status.className = 'status accept'; UI.clear(this.status); this.status.append(h('b', '✔ ACCEPT'), `  “${w || 'ε'}” ∈ L(G) — derived in ${UI.countNT(this.trees[0])} rule applications.`);
      UI.sfx.ok(); this.draw(animate); if (this.o.onResult) this.o.onResult(w, true);
    }
    draw(animate) {
      clearInterval(this.timer);
      const t = this.trees[this.which], g = this.o.getGrammar(), n = UI.countNT(t);
      const steps = CFG.leftmostDerivation(t, g);
      UI.clear(this.deriv); steps.forEach((s, i) => this.deriv.append(h('div', { dataset: { i } }, i ? h('span.arrow', '⇒ ') : '', s.form, s.prod ? h('span.dim', '   ' + s.prod) : '')));
      if (!animate || UI.reduceMotion()) { this.tree.set(t); return; }
      let k = 0; this.tree.set(UI.partialTree(t, 0));
      this.timer = setInterval(() => { k++; this.tree.set(UI.partialTree(t, k)); UI.sfx.step(); [...this.deriv.children].forEach((c, i) => (c.style.opacity = i <= k ? 1 : 0.25)); if (k >= n) { clearInterval(this.timer); this.tree.set(t); } }, 520);
      UI.onCleanup(() => clearInterval(this.timer));
    }
  };
})();
