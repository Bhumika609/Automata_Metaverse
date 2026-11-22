/* ============================================================================
 * FORMAL LAYER · Finite automata  (DFA · NFA · ε-NFA)
 *   validate · simulate (clone frames) · subset construction · minimization ·
 *   equivalence + shortest counterexample · product construction
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F;
  const FA = (F.FA = {});
  const isEps = F.isEps;

  /* ---------- helpers ---------- */
  const byId = (m) => new Map(m.states.map((s) => [s.id, s]));
  function outgoing(m) {
    const o = new Map(m.states.map((s) => [s.id, []]));
    for (const t of m.transitions) if (o.has(t.from)) o.get(t.from).push(t);
    return o;
  }
  FA.symbols = function (m) {
    const set = new Set(m.alphabet || []);
    for (const t of m.transitions) if (!isEps(t.read)) set.add(t.read);
    return [...set].sort();
  };
  FA.hasEps = (m) => m.transitions.some((t) => isEps(t.read));
  FA.epsCount = (m) => m.transitions.filter((t) => isEps(t.read)).length;
  FA.isDeterministic = function (m) {
    if (FA.hasEps(m)) return false;
    const seen = new Set();
    for (const t of m.transitions) {
      const k = t.from + '\u0001' + t.read;
      if (seen.has(k)) return false;
      seen.add(k);
    }
    return true;
  };
  FA.isComplete = function (m, alphabet) {
    const alpha = alphabet || FA.symbols(m);
    const have = new Set(m.transitions.map((t) => t.from + '\u0001' + t.read));
    return m.states.every((s) => alpha.every((a) => have.has(s.id + '\u0001' + a)));
  };
  /** what kind of automaton is this really? */
  FA.kindOf = function (m) {
    if (FA.hasEps(m)) return 'ENFA';
    return FA.isDeterministic(m) ? 'DFA' : 'NFA';
  };

  /* ---------- validation ---------- */
  FA.validate = function (m, { kind = 'ENFA', alphabet = null } = {}) {
    const errors = [], warnings = [];
    if (!m.states.length) errors.push('Add at least one state.');
    const names = new Map();
    for (const s of m.states) {
      const n = (s.name || '').trim();
      if (!n) errors.push('A state has an empty name.');
      names.set(n, (names.get(n) || 0) + 1);
    }
    for (const [n, c] of names) if (n && c > 1) errors.push(`Duplicate state name "${n}" — every state needs a unique name.`);
    const inits = m.states.filter((s) => s.initial);
    if (m.states.length && inits.length === 0) errors.push('Mark exactly one state as the initial (start) state.');
    if (inits.length > 1) errors.push('More than one initial state — a finite automaton has exactly one.');
    if (m.states.length && !m.states.some((s) => s.final)) warnings.push('No accepting (final) state — this machine rejects every string.');
    const ids = new Set(m.states.map((s) => s.id));
    const alpha = alphabet ? new Set(alphabet) : null;
    const nameOf = (id) => (byId(m).get(id) || {}).name || id;
    const seenT = new Set();
    for (const t of m.transitions) {
      if (!ids.has(t.from) || !ids.has(t.to)) { errors.push('A transition points to a state that does not exist.'); continue; }
      const r = isEps(t.read) ? '' : t.read;
      if (r.length > 1) errors.push(`Transition ${nameOf(t.from)}→${nameOf(t.to)} reads "${r}" — each transition reads exactly one symbol (or ε).`);
      if (r && alpha && !alpha.has(r)) errors.push(`Symbol "${r}" (on ${nameOf(t.from)}→${nameOf(t.to)}) is not in the alphabet {${[...alpha].join(', ')}}.`);
      if (!r && kind === 'DFA') errors.push(`DFA cannot use ε-transitions (${nameOf(t.from)}→${nameOf(t.to)}).`);
      if (!r && kind === 'NFA') errors.push(`An NFA has no ε-transitions (${nameOf(t.from)}→${nameOf(t.to)}); choose ε-NFA to use portals.`);
      const k = t.from + '|' + t.to + '|' + r;
      if (seenT.has(k)) warnings.push(`Duplicate transition ${nameOf(t.from)}→${nameOf(t.to)} on ${r || 'ε'}.`);
      seenT.add(k);
    }
    if (kind === 'DFA') {
      const g = new Map();
      for (const t of m.transitions) {
        if (isEps(t.read)) continue;
        const k = t.from + '\u0001' + t.read;
        if (!g.has(k)) g.set(k, new Set());
        g.get(k).add(t.to);
      }
      for (const [k, tos] of g) {
        if (tos.size > 1) {
          const [from, sym] = k.split('\u0001');
          errors.push(`State ${nameOf(from)} has ${tos.size} different transitions on "${sym}" — a DFA must be deterministic.`);
        }
      }
      const alpha2 = alphabet || FA.symbols(m);
      const have = new Set(m.transitions.map((t) => t.from + '\u0001' + t.read));
      const missing = [];
      for (const s of m.states) for (const a of alpha2) if (!have.has(s.id + '\u0001' + a)) missing.push(`${s.name}/${a}`);
      if (missing.length && !errors.length) warnings.push(`Missing transitions: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''} (implicit dead state — those strings are rejected).`);
    }
    return { errors, warnings, ok: errors.length === 0 };
  };

  /* ---------- set operations ---------- */
  const key = (set) => [...set].sort().join(',');

  FA.closure = function (m, startIds, out = outgoing(m)) {
    const seen = new Set(startIds);
    const q = [...startIds];
    while (q.length) {
      const u = q.pop();
      for (const t of out.get(u) || []) if (isEps(t.read) && !seen.has(t.to)) { seen.add(t.to); q.push(t.to); }
    }
    return seen;
  };
  FA.move = function (m, set, sym, out = outgoing(m)) {
    const r = new Set();
    for (const u of set) for (const t of out.get(u) || []) if (!isEps(t.read) && t.read === sym) r.add(t.to);
    return r;
  };
  FA.step = (m, set, sym, out = outgoing(m)) => FA.closure(m, FA.move(m, set, sym, out), out);

  FA.accepts = function (m, w) {
    const init = m.states.find((s) => s.initial);
    if (!init) return false;
    const out = outgoing(m);
    const finals = new Set(m.states.filter((s) => s.final).map((s) => s.id));
    let cur = FA.closure(m, [init.id], out);
    for (const ch of w) {
      cur = FA.step(m, cur, ch, out);
      if (!cur.size) return false;
    }
    for (const s of cur) if (finals.has(s)) return true;
    return false;
  };

  /* ---------- clone-level simulation (drives the NFA District visuals) ----------
   * Each frame lists the live "clones". A clone is one explored computation branch:
   *   kind 'init'  – the player at the start
   *   kind 'move'  – followed the only matching transition
   *   kind 'split' – the parent had several choices → it cloned itself
   *   kind 'eps'   – teleported through an ε-portal (consumes no input)
   * Clones that land on the same state in the same phase MERGE (that is exactly the
   * subset-construction "super clone"), which also keeps the visualisation finite. */
  FA.simulate = function (m, w) {
    const init = m.states.find((s) => s.initial);
    if (!init) return { accepted: false, frames: [], error: 'No initial state', stuckAt: 0 };
    const out = outgoing(m);
    const finals = new Set(m.states.filter((s) => s.final).map((s) => s.id));
    const symbols = [...w];
    let cid = 0;
    const frames = [];
    const mk = (kind, index, symbol, clones, extra = {}) => ({
      kind, index, symbol, clones: clones.map((c) => ({ ...c })),
      born: extra.born || [], dead: extra.dead || [], merged: extra.merged || [],
      superSet: [...new Set(clones.map((c) => c.state))],
    });
    function epsPhase(live, index) {
      const occ = new Map(live.map((c) => [c.state, c]));
      const born = [], merged = [];
      const queue = [...live];
      while (queue.length) {
        const c = queue.shift();
        for (const t of out.get(c.state) || []) {
          if (!isEps(t.read)) continue;
          if (occ.has(t.to)) { if (occ.get(t.to).id !== c.id) merged.push({ from: c.id, into: occ.get(t.to).id, via: t.id }); continue; }
          const n = { id: cid++, parent: c.id, state: t.to, via: t.id, kind: 'eps' };
          occ.set(t.to, n); born.push(n); queue.push(n);
        }
      }
      const all = live.concat(born);
      if (born.length) frames.push(mk('eps', index, null, all, { born, merged }));
      return all;
    }
    let live = [{ id: cid++, parent: null, state: init.id, via: null, kind: 'init' }];
    frames.push(mk('start', 0, null, live, { born: live }));
    live = epsPhase(live, 0);
    let stuckAt = null;
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      const next = [], dead = [], merged = [];
      const occ = new Map();
      for (const c of live) {
        const ts = (out.get(c.state) || []).filter((t) => !isEps(t.read) && t.read === sym);
        const targets = [...new Set(ts.map((t) => t.to))];
        if (!ts.length) { dead.push({ id: c.id, state: c.state, parent: c.parent }); continue; }
        for (const t of ts) {
          if (occ.has(t.to)) { merged.push({ from: c.id, into: occ.get(t.to).id, via: t.id }); continue; }
          const n = { id: cid++, parent: c.id, state: t.to, via: t.id, kind: targets.length > 1 ? 'split' : 'move' };
          occ.set(t.to, n); next.push(n);
        }
      }
      frames.push(mk('read', i + 1, sym, next, { born: next, dead, merged }));
      if (!next.length) { stuckAt = i; live = []; break; }
      live = epsPhase(next, i + 1);
    }
    const accepted = live.some((c) => finals.has(c.state));
    return { accepted, frames, stuckAt, finalStates: live.map((c) => c.state) };
  };

  /* ---------- subset construction ---------- */
  FA.toDFA = function (m, alphabetIn) {
    const alphabet = (alphabetIn && alphabetIn.length ? alphabetIn : FA.symbols(m)).slice().sort();
    const out = outgoing(m);
    const st = byId(m);
    const order = new Map(m.states.map((s, i) => [s.id, i]));
    const nm = (set) => {
      const ids = [...set].sort((a, b) => order.get(a) - order.get(b));
      return ids.length ? '{' + ids.map((i) => st.get(i).name).join(',') + '}' : '∅';
    };
    const init = m.states.find((s) => s.initial);
    const finals = new Set(m.states.filter((s) => s.final).map((s) => s.id));
    const start = FA.closure(m, [init.id], out);
    const dfa = { type: 'DFA', alphabet, states: [], transitions: [] };
    const seen = new Map(); // key → dfa state
    const table = [], steps = [];
    let n = 0;
    const getState = (set, parentInfo) => {
      const k = key(set);
      if (seen.has(k)) return { s: seen.get(k), isNew: false };
      const s = { id: 'd' + n++, name: nm(set), initial: false, final: [...set].some((i) => finals.has(i)), set: [...set] };
      seen.set(k, s); dfa.states.push(s);
      return { s, isNew: true };
    };
    const first = getState(start);
    first.s.initial = true;
    const queue = [[start, first.s]];
    let tid = 0;
    while (queue.length) {
      const [set, ds] = queue.shift();
      const row = { name: ds.name, set: [...set], isStart: ds.initial, isFinal: ds.final, trans: {} };
      for (const a of alphabet) {
        const mv = FA.move(m, set, a, out);
        const cl = FA.closure(m, mv, out);
        const { s: to, isNew } = getState(cl);
        if (isNew) queue.push([cl, to]);
        dfa.transitions.push({ id: 'dt' + tid++, from: ds.id, to: to.id, read: a });
        row.trans[a] = to.name;
        steps.push({ from: ds.name, symbol: a, move: nm(mv), closure: nm(cl), to: to.name, isNew });
      }
      table.push(row);
    }
    F.autoLayout(dfa);
    return { dfa, table, steps };
  };

  /* ---------- completion / reachability / minimization ---------- */
  FA.complete = function (m, alphabetIn) {
    const alphabet = alphabetIn && alphabetIn.length ? alphabetIn : FA.symbols(m);
    const d = F.clone(m);
    d.alphabet = [...alphabet];
    const have = new Set(d.transitions.map((t) => t.from + '\u0001' + t.read));
    let sink = null;
    let tid = 0;
    for (const s of [...d.states]) {
      for (const a of alphabet) {
        if (have.has(s.id + '\u0001' + a)) continue;
        if (!sink) { sink = { id: '__dead', name: 'dead', initial: false, final: false }; d.states.push(sink); }
        d.transitions.push({ id: 'ct' + tid++, from: s.id, to: sink.id, read: a });
      }
    }
    if (sink) for (const a of alphabet) d.transitions.push({ id: 'ct' + tid++, from: sink.id, to: sink.id, read: a });
    return d;
  };
  FA.reachable = function (m) {
    const init = m.states.find((s) => s.initial);
    if (!init) return new Set();
    const out = outgoing(m);
    const seen = new Set([init.id]);
    const q = [init.id];
    while (q.length) { const u = q.pop(); for (const t of out.get(u) || []) if (!seen.has(t.to)) { seen.add(t.to); q.push(t.to); } }
    return seen;
  };
  /** states from which no accepting state can be reached (trap states) */
  FA.deadStates = function (m) {
    const rev = new Map(m.states.map((s) => [s.id, []]));
    for (const t of m.transitions) if (rev.has(t.to)) rev.get(t.to).push(t.from);
    const live = new Set(m.states.filter((s) => s.final).map((s) => s.id));
    const q = [...live];
    while (q.length) { const u = q.pop(); for (const p of rev.get(u) || []) if (!live.has(p)) { live.add(p); q.push(p); } }
    return new Set(m.states.filter((s) => !live.has(s.id)).map((s) => s.id));
  };

  /** Moore partition refinement. Returns the minimal complete DFA + the refinement rounds. */
  FA.minimize = function (mIn, alphabetIn) {
    let d = FA.isDeterministic(mIn) ? mIn : FA.toDFA(mIn, alphabetIn).dfa;
    const alphabet = (alphabetIn && alphabetIn.length ? alphabetIn : FA.symbols(d)).slice().sort();
    d = FA.complete(d, alphabet);
    const reach = FA.reachable(d);
    d = { ...d, states: d.states.filter((s) => reach.has(s.id)), transitions: d.transitions.filter((t) => reach.has(t.from) && reach.has(t.to)) };
    const st = byId(d);
    const delta = new Map(d.transitions.map((t) => [t.from + '\u0001' + t.read, t.to]));
    let block = new Map(d.states.map((s) => [s.id, s.final ? 1 : 0]));
    const rounds = [];
    const describe = (blk) => {
      const groups = new Map();
      for (const s of d.states) { const b = blk.get(s.id); if (!groups.has(b)) groups.set(b, []); groups.get(b).push(s.name); }
      return [...groups.values()];
    };
    rounds.push({ title: 'Round 0 — split accepting / non-accepting', groups: describe(block) });
    for (let guard = 0; guard < 200; guard++) {
      const sig = new Map();
      const nb = new Map();
      let c = 0;
      for (const s of d.states) {
        const sg = block.get(s.id) + '|' + alphabet.map((a) => block.get(delta.get(s.id + '\u0001' + a))).join(',');
        if (!sig.has(sg)) sig.set(sg, c++);
        nb.set(s.id, sig.get(sg));
      }
      const before = new Set(block.values()).size;
      if (c === before) break;
      block = nb;
      rounds.push({ title: `Round ${rounds.length} — split by where each symbol leads`, groups: describe(block) });
    }
    const groups = new Map();
    for (const s of d.states) { const b = block.get(s.id); if (!groups.has(b)) groups.set(b, []); groups.get(b).push(s); }
    const min = { type: 'DFA', alphabet, states: [], transitions: [] };
    const idOf = new Map();
    let i = 0;
    let deadBlock = null;
    for (const [b, mem] of groups) {
      const dead = mem.every((s) => !s.final) && mem.every((s) => alphabet.every((a) => block.get(delta.get(s.id + '\u0001' + a)) === b));
      if (dead) deadBlock = b;
      const name = dead ? 'dead' : mem.length === 1 ? mem[0].name : '{' + mem.map((s) => s.name).join(',') + '}';
      const ns = { id: 'm' + i++, name, initial: mem.some((s) => s.initial), final: mem[0].final };
      min.states.push(ns); idOf.set(b, ns.id);
    }
    let t = 0;
    for (const [b, mem] of groups) for (const a of alphabet) min.transitions.push({ id: 'mt' + t++, from: idOf.get(b), to: idOf.get(block.get(delta.get(mem[0].id + '\u0001' + a))), read: a });
    F.autoLayout(min);
    const partialSize = min.states.length - (deadBlock !== null ? 1 : 0);
    return { min, rounds, partialSize, completeSize: min.states.length, mapping: block };
  };
  /** number of states in the smallest DFA (dead state not counted) */
  FA.minimalSize = (m, alphabet) => FA.minimize(m, alphabet).partialSize;
  /** is `m` (when completed) a minimal DFA? */
  FA.isMinimal = function (m, alphabet) {
    if (!FA.isDeterministic(m)) return false;
    const reach = FA.reachable(m);
    if (reach.size !== m.states.length) return false; // unreachable (wasted) states
    const dead = FA.deadStates(m);
    const live = m.states.length - dead.size;
    return dead.size <= 1 && live === FA.minimalSize(m, alphabet);
  };
  /** count of states a player machine really "uses" (reachable, ignoring a trap state) */
  FA.effectiveSize = function (m) {
    const reach = FA.reachable(m);
    const dead = FA.deadStates(m);
    return [...reach].filter((id) => !dead.has(id)).length || 1;
  };

  /* ---------- equivalence & counterexamples ---------- */
  /** BFS over the product of the two (determinised) machines → shortest distinguishing string */
  FA.equivalent = function (m1, m2, alphabetIn) {
    const alphabet = (alphabetIn && alphabetIn.length ? alphabetIn : [...new Set([...FA.symbols(m1), ...FA.symbols(m2)])]).slice().sort();
    const o1 = outgoing(m1), o2 = outgoing(m2);
    const i1 = m1.states.find((s) => s.initial), i2 = m2.states.find((s) => s.initial);
    const f1 = new Set(m1.states.filter((s) => s.final).map((s) => s.id));
    const f2 = new Set(m2.states.filter((s) => s.final).map((s) => s.id));
    const acc = (set, f) => { for (const s of set) if (f.has(s)) return true; return false; };
    const s1 = i1 ? FA.closure(m1, [i1.id], o1) : new Set();
    const s2 = i2 ? FA.closure(m2, [i2.id], o2) : new Set();
    const seen = new Set([key(s1) + '#' + key(s2)]);
    const q = [[s1, s2, '']];
    let explored = 0;
    while (q.length) {
      const [a, b, w] = q.shift();
      explored++;
      const x = acc(a, f1), y = acc(b, f2);
      if (x !== y) return { equal: false, counterexample: w, in1: x, in2: y, explored };
      for (const c of alphabet) {
        const na = FA.step(m1, a, c, o1), nb = FA.step(m2, b, c, o2);
        const k = key(na) + '#' + key(nb);
        if (!seen.has(k)) { seen.add(k); q.push([na, nb, w + c]); }
      }
    }
    return { equal: true, counterexample: null, explored };
  };

  /** product construction on two machines → DFA   op: and | or | xor | diff */
  FA.product = function (m1, m2, op, alphabetIn) {
    const alphabet = (alphabetIn && alphabetIn.length ? alphabetIn : [...new Set([...FA.symbols(m1), ...FA.symbols(m2)])]).slice().sort();
    const d1 = FA.complete(FA.isDeterministic(m1) ? m1 : FA.toDFA(m1, alphabet).dfa, alphabet);
    const d2 = FA.complete(FA.isDeterministic(m2) ? m2 : FA.toDFA(m2, alphabet).dfa, alphabet);
    const t1 = new Map(d1.transitions.map((t) => [t.from + '\u0001' + t.read, t.to]));
    const t2 = new Map(d2.transitions.map((t) => [t.from + '\u0001' + t.read, t.to]));
    const n1 = byId(d1), n2 = byId(d2);
    const i1 = d1.states.find((s) => s.initial), i2 = d2.states.find((s) => s.initial);
    const f = { and: (a, b) => a && b, or: (a, b) => a || b, xor: (a, b) => a !== b, diff: (a, b) => a && !b }[op];
    const res = { type: 'DFA', alphabet, states: [], transitions: [] };
    const idOf = new Map();
    let n = 0, tn = 0;
    const get = (a, b) => {
      const k = a + '|' + b;
      if (idOf.has(k)) return idOf.get(k);
      const s = { id: 'p' + n++, name: `(${n1.get(a).name},${n2.get(b).name})`, initial: false, final: !!f(n1.get(a).final, n2.get(b).final) };
      res.states.push(s); idOf.set(k, s); return s;
    };
    const s0 = get(i1.id, i2.id); s0.initial = true;
    const q = [[i1.id, i2.id, s0]];
    while (q.length) {
      const [a, b, s] = q.shift();
      for (const c of alphabet) {
        const na = t1.get(a + '\u0001' + c), nb = t2.get(b + '\u0001' + c);
        const had = idOf.has(na + '|' + nb);
        const to = get(na, nb);
        if (!had) q.push([na, nb, to]);
        res.transitions.push({ id: 'pt' + tn++, from: s.id, to: to.id, read: c });
      }
    }
    F.autoLayout(res);
    return res;
  };
  FA.complement = function (m, alphabet) {
    const d = FA.complete(FA.isDeterministic(m) ? m : FA.toDFA(m, alphabet).dfa, alphabet);
    for (const s of d.states) s.final = !s.final;
    return d;
  };

  /* ---------- sampling (examples for the player) ---------- */
  FA.sample = function (m, alphabet, { maxLen = 8, acc = 6, rej = 6 } = {}) {
    const A = [], R = [];
    for (const w of F.strings(alphabet, maxLen)) {
      const ok = FA.accepts(m, w);
      if (ok && A.length < acc) A.push(w);
      else if (!ok && R.length < rej) R.push(w);
      if (A.length >= acc && R.length >= rej) break;
    }
    return { accept: A, reject: R };
  };

  /* ---------- build a machine from a compact spec ---------- */
  /**  FA.build({ type:'DFA', alphabet:'01', start:'e', finals:['e'], delta:{ e:{0:'e',1:'o'}, o:{0:'o',1:'e'} } })
   *   NFA targets may be arrays; use key 'ε' for epsilon moves.                                   */
  FA.build = function (spec) {
    const names = [];
    const add = (n) => { if (!names.includes(n)) names.push(n); };
    add(spec.start);
    for (const q of Object.keys(spec.delta)) add(q);
    for (const q of Object.keys(spec.delta)) for (const a of Object.keys(spec.delta[q])) [].concat(spec.delta[q][a]).forEach(add);
    (spec.finals || []).forEach(add);
    const m = { type: spec.type || 'DFA', alphabet: [...spec.alphabet], states: [], transitions: [] };
    for (const n of names) m.states.push({ id: n, name: n, initial: n === spec.start, final: (spec.finals || []).includes(n) });
    let t = 0;
    for (const q of Object.keys(spec.delta)) for (const a of Object.keys(spec.delta[q])) for (const to of [].concat(spec.delta[q][a])) m.transitions.push({ id: 'r' + t++, from: q, to, read: a === 'ε' ? '' : a });
    F.autoLayout(m);
    return m;
  };
})();
