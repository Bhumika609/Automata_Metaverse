/* ============================================================================
 * FORMAL LAYER · Pushdown automata  (nondeterministic, final-state or empty-stack)
 * Transition: read (symbol or ε) · pop (stack symbol or ε = don't pop) · push (string,
 * leftmost character ends up on TOP — the JFLAP convention).
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F;
  const PDA = (F.PDA = {});
  const isEps = F.isEps;

  PDA.validate = function (m, { alphabet = null } = {}) {
    const errors = [], warnings = [];
    if (!m.states.length) errors.push('Add at least one state.');
    const names = new Map();
    for (const s of m.states) { const n = (s.name || '').trim(); if (!n) errors.push('A state has an empty name.'); names.set(n, (names.get(n) || 0) + 1); }
    for (const [n, c] of names) if (n && c > 1) errors.push(`Duplicate state name "${n}".`);
    const inits = m.states.filter((s) => s.initial);
    if (m.states.length && inits.length !== 1) errors.push(inits.length ? 'More than one initial state.' : 'Mark exactly one state as initial.');
    if ((m.acceptMode || 'final') === 'final' && m.states.length && !m.states.some((s) => s.final)) warnings.push('Acceptance is by FINAL STATE but no state is final — nothing will be accepted.');
    const ids = new Set(m.states.map((s) => s.id));
    const alpha = alphabet ? new Set(alphabet) : null;
    for (const t of m.transitions) {
      if (!ids.has(t.from) || !ids.has(t.to)) { errors.push('A transition points to a missing state.'); continue; }
      const r = isEps(t.read) ? '' : t.read;
      if (r.length > 1) errors.push(`Input symbol "${r}" must be a single character or ε.`);
      if (r && alpha && !alpha.has(r)) errors.push(`Input symbol "${r}" is not in the alphabet {${[...alpha].join(', ')}}.`);
      if ((t.pop || '').length > 1) errors.push(`Pop "${t.pop}" must be a single stack symbol or ε.`);
    }
    return { errors, warnings, ok: errors.length === 0 };
  };
  PDA.alphabetOf = (m) => [...new Set(m.transitions.map((t) => t.read).filter((r) => !isEps(r)))].sort();

  /** Breadth-first search over configurations (state, input position, stack). */
  PDA.simulate = function (m, w, opts = {}) {
    const maxNodes = opts.maxNodes || 40000, maxStack = opts.maxStack || 80;
    const mode = m.acceptMode || 'final';
    const init = m.states.find((s) => s.initial);
    if (!init) return { accepted: false, path: [], bestPath: [], explored: 0, error: 'No initial state', underflows: 0 };
    const finals = new Set(m.states.filter((s) => s.final).map((s) => s.id));
    const out = new Map(m.states.map((s) => [s.id, []]));
    for (const t of m.transitions) if (out.has(t.from)) out.get(t.from).push(t);
    const z = m.initialStack === undefined ? 'Z' : m.initialStack;
    const s0 = z ? [...z] : [];
    const input = [...w];
    const nodes = [{ state: init.id, pos: 0, stack: s0, parent: -1, via: null }];
    const seen = new Set([init.id + '|0|' + s0.join('')]);
    let head = 0, truncated = false, underflows = 0, best = 0;
    const isAcc = (n) => n.pos === input.length && (mode === 'empty' ? n.stack.length === 0 : finals.has(n.state));
    const pathTo = (i) => { const p = []; while (i >= 0) { const n = nodes[i]; p.push({ state: n.state, pos: n.pos, stack: n.stack, via: n.via }); i = n.parent; } return p.reverse(); };
    while (head < nodes.length) {
      const idx = head++;
      const n = nodes[idx];
      if (isAcc(n)) return { accepted: true, path: pathTo(idx), explored: nodes.length, truncated, underflows };
      if (n.pos > nodes[best].pos || (n.pos === nodes[best].pos && n.stack.length < nodes[best].stack.length)) best = idx;
      for (const t of out.get(n.state)) {
        const r = isEps(t.read) ? '' : t.read;
        if (r && (n.pos >= input.length || input[n.pos] !== r)) continue;
        const pop = t.pop || '';
        if (pop) {
          if (n.stack.length === 0) { underflows++; continue; }
          if (n.stack[0] !== pop) continue;
        }
        const rest = pop ? n.stack.slice(1) : n.stack;
        const ns = [...(t.push || '')].concat(rest);
        if (ns.length > maxStack) { truncated = true; continue; }
        const nn = { state: t.to, pos: n.pos + (r ? 1 : 0), stack: ns, parent: idx, via: t.id };
        const k = nn.state + '|' + nn.pos + '|' + ns.join('');
        if (seen.has(k)) continue;
        seen.add(k);
        if (nodes.length >= maxNodes) { truncated = true; continue; }
        nodes.push(nn);
      }
    }
    return { accepted: false, path: [], bestPath: pathTo(best), explored: nodes.length, truncated, underflows };
  };
  PDA.accepts = (m, w, o) => PDA.simulate(m, w, o).accepted;
  PDA.isDeterministic = function (m) {
    const g = new Map();
    for (const t of m.transitions) { const k = t.from + '|' + (t.read || '') + '|' + (t.pop || ''); g.set(k, (g.get(k) || 0) + 1); }
    for (const t of m.transitions) {
      if (isEps(t.read)) { for (const u of m.transitions) if (u !== t && u.from === t.from && (!u.pop || !t.pop || u.pop === t.pop)) return false; }
    }
    return [...g.values()].every((c) => c === 1);
  };
  PDA.checkAgainst = function (m, ref, alphabet, maxLen) {
    let tested = 0;
    for (const w of F.strings(alphabet, maxLen)) {
      tested++;
      const exp = !!ref(w), act = PDA.accepts(m, w);
      if (exp !== act) return { ok: false, counterexample: w, expected: exp, actual: act, tested };
    }
    return { ok: true, tested };
  };
})();
