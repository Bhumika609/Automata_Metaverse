/* ============================================================================
 * FORMAL LAYER · JFLAP-style conversions & analyses (F.JT)
 * These are the classic JFLAP "Convert" / "Input" menu operations, implemented
 * natively so they run in the browser and in Node:
 *   Regular expression → ε-NFA (Thompson)     ε-NFA → NFA (remove ε-moves)
 *   FA → Regular expression (state elimination)
 *   CFG → PDA (empty-stack)                   LL(1): FIRST / FOLLOW / parse table / parse
 *   Multiple Run helper for any machine
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F, FA = F.FA, CFG = F.CFG;
  const JT = (F.JT = {});
  const EPS = 'ε';

  /* ------------------------------ regex → ε-NFA ------------------------------ */
  JT.parseRegex = function (src) {
    const s = [...String(src).replace(/\s+/g, '')];
    let i = 0;
    const peek = () => s[i];
    const atom = () => {
      const c = peek();
      if (c === undefined) throw new Error('Unexpected end of expression.');
      if (c === '(') { i++; const e = union(); if (peek() !== ')') throw new Error('Missing closing “)”.'); i++; return e; }
      if (['|', '*', '+', '?', ')'].includes(c)) throw new Error(`Unexpected “${c}” at position ${i + 1}.`);
      i++; return /^(ε|λ)$/.test(c) ? { t: 'eps' } : { t: 'sym', c };
    };
    const postfix = () => {
      let e = atom();
      while (['*', '+', '?'].includes(peek())) { const o = s[i++]; e = o === '*' ? { t: 'star', e } : o === '+' ? { t: 'cat', a: e, b: { t: 'star', e } } : { t: 'alt', a: e, b: { t: 'eps' } }; }
      return e;
    };
    const concat = () => {
      if (peek() === undefined || peek() === '|' || peek() === ')') return { t: 'eps' };
      let e = postfix();
      while (peek() !== undefined && peek() !== '|' && peek() !== ')') e = { t: 'cat', a: e, b: postfix() };
      return e;
    };
    const union = () => { let e = concat(); while (peek() === '|') { i++; e = { t: 'alt', a: e, b: concat() }; } return e; };
    const e = union();
    if (i < s.length) throw new Error(`Unexpected “${s[i]}” at position ${i + 1}.`);
    return e;
  };
  /** Thompson construction. Returns an ε-NFA (type 'ENFA') with a laid-out canvas. */
  JT.regexToENFA = function (src) {
    const ast = JT.parseRegex(src);
    let n = 0; const states = [], trans = [];
    const mk = () => { const id = 'q' + n; states.push({ id, name: 'q' + n, initial: false, final: false, x: 0, y: 0 }); n++; return id; };
    const edge = (a, b, r) => trans.push({ id: F.nextTransitionId(), from: a, to: b, read: r });
    const build = (e) => {
      if (e.t === 'sym') { const a = mk(), b = mk(); edge(a, b, e.c); return [a, b]; }
      if (e.t === 'eps') { const a = mk(), b = mk(); edge(a, b, ''); return [a, b]; }
      if (e.t === 'cat') { const x = build(e.a), y = build(e.b); edge(x[1], y[0], ''); return [x[0], y[1]]; }
      if (e.t === 'alt') { const a = mk(), x = build(e.a), y = build(e.b), b = mk(); edge(a, x[0], ''); edge(a, y[0], ''); edge(x[1], b, ''); edge(y[1], b, ''); return [a, b]; }
      const a = mk(), x = build(e.e), b = mk(); edge(a, x[0], ''); edge(a, b, ''); edge(x[1], x[0], ''); edge(x[1], b, ''); return [a, b];
    };
    const [st, fin] = build(ast);
    states.find((q) => q.id === st).initial = true; states.find((q) => q.id === fin).final = true;
    const alphabet = [...new Set(trans.map((t) => t.read).filter(Boolean))].sort();
    const m = { type: 'ENFA', alphabet, states, transitions: trans };
    return { machine: F.autoLayout(m), ast };
  };

  /* ------------------------------ ε-NFA → NFA ------------------------------ */
  JT.enfaToNFA = function (m) {
    const alpha = FA.symbols(m);
    const nm = (id) => m.states.find((s) => s.id === id).name;
    const steps = [];
    const out = { type: 'NFA', alphabet: alpha, states: m.states.map((s) => ({ ...s })), transitions: [] };
    for (const q of m.states) {
      const cl = FA.closure(m, [q.id]);
      out.states.find((s) => s.id === q.id).final = [...cl].some((id) => m.states.find((s) => s.id === id).final);
      for (const a of alpha) {
        const mv = FA.move(m, cl, a);
        const tgt = FA.closure(m, [...mv]);
        for (const t of tgt) out.transitions.push({ id: F.nextTransitionId(), from: q.id, to: t, read: a });
        if (tgt.size) steps.push(`δ′(${q.name}, ${a}) = ε-closure(move(ε-closure(${q.name}), ${a})) = {${[...tgt].map(nm).join(', ')}}`);
      }
    }
    return { nfa: out, steps };
  };

  /* ------------------------------ FA → regex (state elimination) ------------------------------ */
  const R = {
    atom: (s) => ({ s, p: 3 }), eps: { s: EPS, p: 3 },
    wrap: (r, min) => (r.p >= min ? r.s : '(' + r.s + ')'),
    union: (a, b) => { if (!a) return b; if (!b) return a; if (a.s === b.s) return a; return { s: a.s + '|' + b.s, p: 0 }; },
    cat: (a, b) => { if (!a || !b) return null; if (a.s === EPS) return b; if (b.s === EPS) return a; return { s: R.wrap(a, 1) + R.wrap(b, 1), p: 1 }; },
    star: (a) => { if (!a || a.s === EPS) return R.eps; if (a.p === 2 && a.s.endsWith('*')) return a; return { s: R.wrap(a, 3) + '*', p: 2 }; },
  };
  /** returns { regex, steps }; regex === '∅' when the language is empty */
  JT.faToRegex = function (m) {
    const steps = [];
    const ids = m.states.map((s) => s.id), name = (id) => m.states.find((s) => s.id === id).name;
    const S = '__start', T = '__accept';
    const E = new Map(); const key = (a, b) => a + '>' + b;
    const add = (a, b, r) => E.set(key(a, b), R.union(E.get(key(a, b)) || null, r));
    for (const t of m.transitions) add(t.from, t.to, F.isEps(t.read) ? R.eps : R.atom(t.read));
    const init = m.states.find((s) => s.initial);
    if (!init) return { regex: '∅', steps: ['No initial state.'] };
    add(S, init.id, R.eps);
    for (const s of m.states) if (s.final) add(s.id, T, R.eps);
    steps.push(`Add a new start state and a new accepting state (generalised NFA with ${ids.length} inner states).`);
    // eliminate states, fewest edges first
    const remaining = new Set(ids);
    while (remaining.size) {
      let best = null, bestCost = Infinity;
      for (const q of remaining) { let i = 0, o = 0; for (const x of [...remaining, S, T]) { if (x !== q && E.has(key(x, q))) i++; if (x !== q && E.has(key(q, x))) o++; } if (i * o < bestCost) { bestCost = i * o; best = q; } }
      const q = best, loop = E.get(key(q, q)) || null, ls = loop ? R.star(loop) : R.eps;
      const ins = [...remaining, S].filter((x) => x !== q && E.has(key(x, q))), outs = [...remaining, T].filter((x) => x !== q && E.has(key(q, x)));
      for (const a of ins) for (const b of outs) add(a, b, R.cat(R.cat(E.get(key(a, q)), ls), E.get(key(q, b))));
      for (const k of [...E.keys()]) { const [a, b] = k.split('>'); if (a === q || b === q) E.delete(k); }
      remaining.delete(q);
      steps.push(`Eliminate ${name(q)}: every path a → ${name(q)} → b becomes a direct edge labelled R(a,${name(q)}) ${loop ? '(' + loop.s + ')* ' : ''}R(${name(q)},b).`);
    }
    const r = E.get(key(S, T));
    return { regex: r ? r.s : '∅', steps };
  };

  /* ------------------------------ CFG → PDA ------------------------------ */
  /** Standard construction: one state, empty-stack acceptance, stack starts with the start symbol.
   *   A → α        gives  (q, ε, A) → (q, α)
   *   terminal a   gives  (q, a, a) → (q, ε)          Nonterminals are renamed to single stack symbols. */
  JT.cfgToPDA = function (g) {
    const terms = new Set(CFG.terminals(g));
    const pool = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZΓΔΘΛΞΠΣΦΨΩ'].filter((c) => !terms.has(c));
    const nts = CFG.nonterminals(g), alias = new Map();
    for (const n of nts) alias.set(n, n.length === 1 && !terms.has(n) ? n : null);
    const used = new Set([...alias.values()].filter(Boolean));
    for (const n of nts) if (!alias.get(n)) { const c = pool.find((x) => !used.has(x)); alias.set(n, c); used.add(c); }
    const tr = [], rules = [];
    for (const p of g.productions) {
      const push = p.right.map((t) => (CFG.isNT(t) ? alias.get(t) : t)).join('');
      tr.push({ id: F.nextTransitionId(), from: 'q', to: 'q', read: '', pop: alias.get(p.left), push });
      rules.push(`${CFG.prodText(p)}   ⇒   (q, ε, ${alias.get(p.left)}) → (q, ${push || 'ε'})`);
    }
    for (const t of terms) { tr.push({ id: F.nextTransitionId(), from: 'q', to: 'q', read: t, pop: t, push: '' }); rules.push(`terminal ${t}   ⇒   (q, ${t}, ${t}) → (q, ε)`); }
    const m = { type: 'PDA', acceptMode: 'empty', initialStack: alias.get(g.start), alphabet: [...terms].sort(), states: [{ id: 'q', name: 'q', initial: true, final: false, x: 450, y: 280 }], transitions: tr };
    return { pda: m, rules, alias: Object.fromEntries(alias) };
  };

  /* ------------------------------ LL(1) ------------------------------ */
  JT.ll1 = function (g) {
    const nts = CFG.nonterminals(g), isNT = CFG.isNT;
    const first = new Map(nts.map((n) => [n, new Set()])), follow = new Map(nts.map((n) => [n, new Set()]));
    const nullable = CFG.nullable(g);
    const firstSeq = (seq) => { const out = new Set(); let all = true; for (const t of seq) { if (isNT(t)) { for (const x of first.get(t) || []) out.add(x); if (!nullable.has(t)) { all = false; break; } } else { out.add(t); all = false; break; } } if (all) out.add(EPS); return out; };
    let ch = true;
    while (ch) { ch = false; for (const p of g.productions) { const f = firstSeq(p.right); for (const x of f) if (x !== EPS && !first.get(p.left).has(x)) { first.get(p.left).add(x); ch = true; } if (nullable.has(p.left) && !first.get(p.left).has(EPS)) { first.get(p.left).add(EPS); ch = true; } } }
    follow.get(g.start).add('$');
    ch = true;
    while (ch) {
      ch = false;
      for (const p of g.productions) p.right.forEach((t, i) => {
        if (!isNT(t)) return;
        const rest = p.right.slice(i + 1), f = firstSeq(rest);
        for (const x of f) if (x !== EPS && !follow.get(t).has(x)) { follow.get(t).add(x); ch = true; }
        if (f.has(EPS)) for (const x of follow.get(p.left)) if (!follow.get(t).has(x)) { follow.get(t).add(x); ch = true; }
      });
    }
    const table = new Map(), conflicts = [];
    g.productions.forEach((p, idx) => {
      const f = firstSeq(p.right);
      const cols = [...f].filter((x) => x !== EPS); if (f.has(EPS)) cols.push(...follow.get(p.left));
      for (const a of cols) { const k = p.left + '|' + a; if (!table.has(k)) table.set(k, []); if (!table.get(k).includes(idx)) table.get(k).push(idx); }
    });
    for (const [k, v] of table) if (v.length > 1) conflicts.push({ nt: k.split('|')[0], sym: k.split('|')[1], prods: v });
    const terms = [...CFG.terminals(g), '$'];
    return { nts, terms, first, follow, table, conflicts, isLL1: conflicts.length === 0 };
  };
  /** predictive parse; returns {accepted, steps:[{stack,input,action}]} */
  JT.ll1Parse = function (g, info, w) {
    const toks = [...w, '$']; let pos = 0; const stack = ['$', g.start], steps = [];
    for (let guard = 0; guard < 2000; guard++) {
      const top = stack[stack.length - 1], a = toks[pos];
      const row = { stack: stack.slice().reverse().join(''), input: toks.slice(pos).join('') };
      if (top === '$' && a === '$') { steps.push({ ...row, action: 'accept' }); return { accepted: true, steps }; }
      if (!CFG.isNT(top)) { if (top === a) { stack.pop(); pos++; steps.push({ ...row, action: `match ${a}` }); continue; } steps.push({ ...row, action: `error: expected ${top}` }); return { accepted: false, steps }; }
      const cell = info.table.get(top + '|' + a);
      if (!cell) { steps.push({ ...row, action: `error: no rule for (${top}, ${a})` }); return { accepted: false, steps }; }
      const p = g.productions[cell[0]]; stack.pop(); for (let i = p.right.length - 1; i >= 0; i--) stack.push(p.right[i]);
      steps.push({ ...row, action: CFG.prodText(p) });
    }
    return { accepted: false, steps };
  };

  /* ------------------------------ Multiple Run ------------------------------ */
  /** run many inputs through any machine; returns [{w, accepted, detail}] */
  JT.multiRun = function (m, inputs) {
    return inputs.map((w) => {
      let acc, detail = '';
      if (m.type === 'CFG') acc = CFG.accepts(m, w);
      else if (m.type === 'PDA') { const r = F.PDA.simulate(m, w, { maxNodes: 20000 }); acc = r.accepted; detail = `${r.explored} configs`; }
      else if (m.type === 'TM') { const r = F.TM.run(m, w, { maxSteps: 5000, traceLimit: 0 }); acc = r.status === 'accepted'; detail = `${r.status}, ${r.steps} steps · tape ${F.TM.trimTape(r.output) || '□'}`; }
      else { const r = FA.simulate(m, w); acc = r.accepted; }
      return { w, accepted: acc, detail };
    });
  };
})();
