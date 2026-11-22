// Node-only builders: turn a variant spec (from js/game/variants.js) into the JFLAP reference machines that get written to jflap/levels/.
// The game itself never calls these — it only loads the resulting .jff files.
module.exports = function (AM) {
  const { F } = AM, { FA, CFG } = F, B = FA.build;
  const H = {};
  const pda = (accept, states, trans) => ({ type: 'PDA', acceptMode: accept, initialStack: 'Z', alphabet: [], states: states.map(([n, i, f]) => ({ id: n, name: n, initial: !!i, final: !!f, x: 100, y: 100 })), transitions: trans.map(([f, t, r, p, u], i) => ({ id: 'p' + i, from: f, to: t, read: r, pop: p, push: u })) });
  const tm = (states, trans) => ({ type: 'TM', blank: '_', alphabet: [], states: states.map(([n, i, f]) => ({ id: n, name: n, initial: !!i, final: !!f, x: 100, y: 100 })), transitions: trans.map(([f, t, r, w, m], i) => ({ id: 't' + i, from: f, to: t, read: r, write: w, move: m })) });

  /* ---------- finite automata ---------- */
  H.countMod = ({ c, k, r, alpha = '01' }) => { const d = {}; for (let i = 0; i < k; i++) { d['n' + i] = {}; for (const x of alpha) d['n' + i][x] = x === c ? 'n' + ((i + 1) % k) : 'n' + i; } return B({ type: 'DFA', alphabet: alpha, start: 'n0', finals: ['n' + r], delta: d }); };
  const kmp = (p, alpha) => { const L = p.length, d = {}; for (let i = 0; i < L; i++) { d['s' + i] = {}; for (const x of alpha) { const t = p.slice(0, i) + x; let j = Math.min(L, t.length); while (j > 0 && !t.endsWith(p.slice(0, j))) j--; d['s' + i][x] = 's' + j; } } return d; };
  H.avoid = ({ p, alpha = 'ab' }) => { const d = kmp(p, alpha), L = p.length; for (const s of Object.keys(d)) for (const x of alpha) if (d[s][x] === 's' + L) delete d[s][x]; return B({ type: 'DFA', alphabet: alpha, start: 's0', finals: Object.keys(d), delta: d }); };
  H.contains = ({ p, alpha = 'ab' }) => { const d = kmp(p, alpha), L = p.length; d['s' + L] = {}; for (const x of alpha) d['s' + L][x] = 's' + L; return B({ type: 'DFA', alphabet: alpha, start: 's0', finals: ['s' + L], delta: d }); };
  H.divBy = ({ k }) => { const d = {}; for (let i = 0; i < k; i++) d['r' + i] = { 0: 'r' + ((2 * i) % k), 1: 'r' + ((2 * i + 1) % k) }; return B({ type: 'DFA', alphabet: '01', start: 'r0', finals: ['r0'], delta: d }); };
  H.counter = ({ m, d: dv }) => { const d = {}; for (let i = 0; i < m; i++) d['c' + i] = { a: 'c' + ((i + 1) % m), b: 'c' + i }; const fin = []; for (let i = 0; i < m; i++) if (i % dv === 0) fin.push('c' + i); return B({ type: 'DFA', alphabet: 'ab', start: 'c0', finals: fin, delta: d }); };
  H.endsWithNFA = ({ p }) => { const L = p.length, d = { s0: { a: ['s0'], b: ['s0'] } }; d.s0[p[0]] = ['s0', 's1']; for (let i = 1; i < L; i++) d['s' + i] = { [p[i]]: 's' + (i + 1) }; d['s' + L] = {}; return B({ type: 'NFA', alphabet: 'ab', start: 's0', finals: ['s' + L], delta: d }); };
  H.chain = ({ order }) => B({ type: 'ENFA', alphabet: 'abc', start: 'q0', finals: ['q2'], delta: { q0: { [order[0]]: 'q0', ε: 'q1' }, q1: { [order[1]]: 'q1', ε: 'q2' }, q2: { [order[2]]: 'q2' } } });
  H.kthFromEnd = ({ k, s }) => { const d = { n0: { 0: ['n0'], 1: ['n0'] } }; d.n0[s] = ['n0', 'n1']; for (let i = 1; i < k; i++) d['n' + i] = { 0: 'n' + (i + 1), 1: 'n' + (i + 1) }; d['n' + k] = {}; return B({ type: 'NFA', alphabet: '01', start: 'n0', finals: ['n' + k], delta: d }); };
  H.randomNFA = ({ seed }) => { const r = F.rng(seed), names = ['s0', 's1', 's2', 's3'], delta = {}; for (const n of names) { delta[n] = {}; for (const a of 'ab') { const x = r(); if (x < 0.2) continue; const t1 = names[Math.floor(r() * 4)]; delta[n][a] = x < 0.75 ? t1 : [t1, names[Math.floor(r() * 4)]].filter((v, i, ar) => ar.indexOf(v) === i); } } const fin = names.filter(() => r() < 0.4); return B({ type: 'NFA', alphabet: 'ab', start: 's0', finals: fin, delta }); };

  /* ---------- twin gates ---------- */
  const LANG = { c1m2: () => H.countMod({ c: '1', k: 2, r: 0 }), c0m2: () => H.countMod({ c: '0', k: 2, r: 1 }), c1m3: () => H.countMod({ c: '1', k: 3, r: 1 }), c0m4: () => H.countMod({ c: '0', k: 4, r: 0 }), div3: () => H.divBy({ k: 3 }), div5: () => H.divBy({ k: 5 }),
    noBB: () => H.avoid({ p: 'bb' }), noAA: () => H.avoid({ p: 'aa' }), noABA: () => H.avoid({ p: 'aba' }), hasABB: () => H.contains({ p: 'abb' }), hasBAB: () => H.contains({ p: 'bab' }), a3: () => H.counter({ m: 3, d: 3 }), a4: () => H.counter({ m: 4, d: 4 }), endsAB: () => FA.minimize(FA.toDFA(H.endsWithNFA({ p: 'ab' }), ['a', 'b']).dfa, ['a', 'b']).min };
  const alphaOf = (k) => (/^(c|div)/.test(k) ? ['0', '1'] : ['a', 'b']);
  const toggle = (alpha) => { const d = { t0: {}, t1: {} }; for (const x of alpha) { d.t0[x] = 't1'; d.t1[x] = 't0'; } return B({ type: 'DFA', alphabet: alpha.join(''), start: 't0', finals: ['t0', 't1'], delta: d }); };
  H.twinPair = ({ lang, same, pick }) => {
    const alpha = alphaOf(lang), A = FA.minimize(LANG[lang](), alpha).min;
    A.states.forEach((s, i) => (s.name = 'q' + i));
    if (same) { const Bm = FA.product(A, toggle(alpha), 'and', alpha); return [A, Bm]; }
    const cands = A.states.map((s, i) => i).filter((i) => true);
    for (let off = 0; off < cands.length; off++) {
      const i = cands[(pick + off) % cands.length], Bm = JSON.parse(JSON.stringify(A)); Bm.states[i].final = !Bm.states[i].final;
      const e = FA.equivalent(A, Bm, alpha); if (!e.equal && e.counterexample.length >= 1 && e.counterexample.length <= 7) return [A, Bm];
    }
    throw new Error('no distinguishing flip for ' + lang);
  };

  /* ---------- pushdown automata ---------- */
  const PDAS = {
    anbn: () => pda('final', [['q0', 1], ['q1'], ['q2', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q1', 'b', 'A', ''], ['q1', 'q1', 'b', 'A', ''], ['q0', 'q2', '', 'Z', 'Z'], ['q1', 'q2', '', 'Z', 'Z']]),
    anb2n: () => pda('final', [['q0', 1], ['q1'], ['q2', 0, 1]], [['q0', 'q0', 'a', '', 'AA'], ['q0', 'q1', 'b', 'A', ''], ['q1', 'q1', 'b', 'A', ''], ['q0', 'q2', '', 'Z', 'Z'], ['q1', 'q2', '', 'Z', 'Z']]),
    a2nbn: () => pda('final', [['p0', 1], ['p1'], ['q1'], ['q2', 0, 1]], [['p0', 'p1', 'a', '', ''], ['p1', 'p0', 'a', '', 'A'], ['p0', 'q1', 'b', 'A', ''], ['q1', 'q1', 'b', 'A', ''], ['p0', 'q2', '', 'Z', 'Z'], ['q1', 'q2', '', 'Z', 'Z']]),
    anbmLe: () => pda('final', [['q0', 1, 1], ['q1', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q1', 'b', 'A', ''], ['q1', 'q1', 'b', 'A', '']]),
    dyck1: ({ o, c }) => pda('final', [['q0', 1], ['q1', 0, 1]], [['q0', 'q0', o, '', 'A'], ['q0', 'q0', c, 'A', ''], ['q0', 'q1', '', 'Z', 'Z']]),
    dyck2: () => pda('final', [['q0', 1], ['q1', 0, 1]], [['q0', 'q0', '(', '', 'P'], ['q0', 'q0', '[', '', 'K'], ['q0', 'q0', ')', 'P', ''], ['q0', 'q0', ']', 'K', ''], ['q0', 'q1', '', 'Z', 'Z']]),
    wcwr: () => pda('final', [['q0', 1], ['q1'], ['q2', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q0', 'b', '', 'B'], ['q0', 'q1', 'c', '', ''], ['q1', 'q1', 'a', 'A', ''], ['q1', 'q1', 'b', 'B', ''], ['q1', 'q2', '', 'Z', 'Z']]),
    evenPal: () => pda('final', [['q0', 1], ['q1'], ['q2', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q0', 'b', '', 'B'], ['q0', 'q1', '', '', ''], ['q1', 'q1', 'a', 'A', ''], ['q1', 'q1', 'b', 'B', ''], ['q1', 'q2', '', 'Z', 'Z']]),
    anbmcn: () => pda('final', [['q0', 1], ['q1'], ['q2'], ['qf', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q1', 'b', '', ''], ['q1', 'q1', 'b', '', ''], ['q0', 'q2', 'c', 'A', ''], ['q1', 'q2', 'c', 'A', ''], ['q2', 'q2', 'c', 'A', ''], ['q0', 'qf', '', 'Z', 'Z'], ['q1', 'qf', '', 'Z', 'Z'], ['q2', 'qf', '', 'Z', 'Z']]),
    anbncm: () => pda('final', [['q0', 1], ['q1'], ['q2'], ['qf', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q1', 'b', 'A', ''], ['q1', 'q1', 'b', 'A', ''], ['q0', 'q2', 'c', 'Z', 'Z'], ['q1', 'q2', 'c', 'Z', 'Z'], ['q2', 'q2', 'c', 'Z', 'Z'], ['q0', 'qf', '', 'Z', 'Z'], ['q1', 'qf', '', 'Z', 'Z'], ['q2', 'qf', '', 'Z', 'Z']]),
    eqAB: () => pda('final', [['q0', 1], ['q1', 0, 1]], [['q0', 'q0', 'a', 'Z', 'AZ'], ['q0', 'q0', 'a', 'A', 'AA'], ['q0', 'q0', 'a', 'B', ''], ['q0', 'q0', 'b', 'Z', 'BZ'], ['q0', 'q0', 'b', 'B', 'BB'], ['q0', 'q0', 'b', 'A', ''], ['q0', 'q1', '', 'Z', 'Z']]),
  };
  H.pda = ({ kind, o, c }) => PDAS[kind]({ o, c });

  /* ---------- Turing machines ---------- */
  const TMS = {
    flip: () => tm([['q0', 1], ['qf', 0, 1]], [['q0', 'q0', '0', '1', 'R'], ['q0', 'q0', '1', '0', 'R'], ['q0', 'qf', '_', '_', 'S']]),
    allOnes: () => tm([['q0', 1], ['qf', 0, 1]], [['q0', 'q0', '0', '1', 'R'], ['q0', 'q0', '1', '1', 'R'], ['q0', 'qf', '_', '_', 'S']]),
    append1: () => tm([['q0', 1], ['qf', 0, 1]], [['q0', 'q0', '0', '0', 'R'], ['q0', 'q0', '1', '1', 'R'], ['q0', 'qf', '_', '1', 'S']]),
    first1: () => tm([['q0', 1], ['qf', 0, 1]], [['q0', 'qf', '0', '1', 'S'], ['q0', 'qf', '1', '1', 'S'], ['q0', 'qf', '_', '_', 'S']]),
    inc: () => tm([['a', 1], ['b'], ['f', 0, 1]], [['a', 'a', '0', '0', 'R'], ['a', 'a', '1', '1', 'R'], ['a', 'b', '_', '_', 'L'], ['b', 'b', '1', '0', 'L'], ['b', 'f', '0', '1', 'S'], ['b', 'f', '_', '1', 'S']]),
    dec: () => tm([['a', 1], ['b'], ['f', 0, 1]], [['a', 'a', '0', '0', 'R'], ['a', 'a', '1', '1', 'R'], ['a', 'b', '_', '_', 'L'], ['b', 'b', '0', '1', 'L'], ['b', 'f', '1', '0', 'S']]),
    incwrap: () => tm([['a', 1], ['b'], ['f', 0, 1]], [['a', 'a', '0', '0', 'R'], ['a', 'a', '1', '1', 'R'], ['a', 'b', '_', '_', 'L'], ['b', 'b', '1', '0', 'L'], ['b', 'f', '0', '1', 'S'], ['b', 'f', '_', '_', 'S']]),
    flipLast: () => tm([['a', 1], ['b'], ['f', 0, 1]], [['a', 'a', '0', '0', 'R'], ['a', 'a', '1', '1', 'R'], ['a', 'b', '_', '_', 'L'], ['b', 'f', '0', '1', 'S'], ['b', 'f', '1', '0', 'S']]),
    double: () => tm([['a', 1], ['f', 0, 1]], [['a', 'a', '0', '0', 'R'], ['a', 'a', '1', '1', 'R'], ['a', 'f', '_', '0', 'S']]),
    parity: () => tm([['e', 1], ['o'], ['f', 0, 1]], [['e', 'e', '0', '0', 'R'], ['e', 'o', '1', '1', 'R'], ['o', 'o', '0', '0', 'R'], ['o', 'e', '1', '1', 'R'], ['e', 'f', '_', '0', 'S'], ['o', 'f', '_', '1', 'S']]),
    anbn: () => tm([['q0', 1], ['q1'], ['q2'], ['q3'], ['qf', 0, 1]], [['q0', 'q1', 'a', 'X', 'R'], ['q0', 'q3', 'Y', 'Y', 'R'], ['q0', 'qf', '_', '_', 'S'], ['q1', 'q1', 'a', 'a', 'R'], ['q1', 'q1', 'Y', 'Y', 'R'], ['q1', 'q2', 'b', 'Y', 'L'], ['q2', 'q2', 'a', 'a', 'L'], ['q2', 'q2', 'Y', 'Y', 'L'], ['q2', 'q0', 'X', 'X', 'R'], ['q3', 'q3', 'Y', 'Y', 'R'], ['q3', 'qf', '_', '_', 'S']]),
    palin: () => tm([['s0', 1], ['sa'], ['sb'], ['ca'], ['cb'], ['back'], ['acc', 0, 1]], [['s0', 'sa', 'a', '_', 'R'], ['s0', 'sb', 'b', '_', 'R'], ['s0', 'acc', '_', '_', 'S'], ['sa', 'sa', 'a', 'a', 'R'], ['sa', 'sa', 'b', 'b', 'R'], ['sa', 'ca', '_', '_', 'L'], ['sb', 'sb', 'a', 'a', 'R'], ['sb', 'sb', 'b', 'b', 'R'], ['sb', 'cb', '_', '_', 'L'],
      ['ca', 'back', 'a', '_', 'L'], ['ca', 'acc', '_', '_', 'S'], ['cb', 'back', 'b', '_', 'L'], ['cb', 'acc', '_', '_', 'S'], ['back', 'back', 'a', 'a', 'L'], ['back', 'back', 'b', 'b', 'L'], ['back', 's0', '_', '_', 'R']]),
    equalAB: () => tm([['q0', 1], ['qa'], ['qb'], ['rew'], ['acc', 0, 1]], [['q0', 'q0', 'X', 'X', 'R'], ['q0', 'qa', 'a', 'X', 'R'], ['q0', 'qb', 'b', 'X', 'R'], ['q0', 'acc', '_', '_', 'S'], ['qa', 'qa', 'a', 'a', 'R'], ['qa', 'qa', 'X', 'X', 'R'], ['qa', 'rew', 'b', 'X', 'L'], ['qb', 'qb', 'b', 'b', 'R'], ['qb', 'qb', 'X', 'X', 'R'], ['qb', 'rew', 'a', 'X', 'L'],
      ['rew', 'rew', 'a', 'a', 'L'], ['rew', 'rew', 'b', 'b', 'L'], ['rew', 'rew', 'X', 'X', 'L'], ['rew', 'q0', '_', '_', 'R']]),
    anbncn: () => tm([['q0', 1], ['q1'], ['q2'], ['q3'], ['q4'], ['acc', 0, 1]], [['q0', 'q1', 'a', 'X', 'R'], ['q0', 'q4', 'Y', 'Y', 'R'], ['q0', 'acc', '_', '_', 'S'], ['q1', 'q1', 'a', 'a', 'R'], ['q1', 'q1', 'Y', 'Y', 'R'], ['q1', 'q2', 'b', 'Y', 'R'], ['q2', 'q2', 'b', 'b', 'R'], ['q2', 'q2', 'Z', 'Z', 'R'], ['q2', 'q3', 'c', 'Z', 'L'],
      ['q3', 'q3', 'a', 'a', 'L'], ['q3', 'q3', 'b', 'b', 'L'], ['q3', 'q3', 'Y', 'Y', 'L'], ['q3', 'q3', 'Z', 'Z', 'L'], ['q3', 'q0', 'X', 'X', 'R'], ['q4', 'q4', 'Y', 'Y', 'R'], ['q4', 'q4', 'Z', 'Z', 'R'], ['q4', 'acc', '_', '_', 'S']]),
  };
  H.tm = ({ kind }) => TMS[kind]();

  /* ---------- Void zone ---------- */
  const TMB = (start, finals, rules) => {
    const names = []; const add = (n) => { if (!names.includes(n)) names.push(n); };
    add(start); rules.forEach((r) => { add(r[0]); add(r[4]); }); finals.forEach(add);
    return { type: 'TM', alphabet: [], blank: '_', states: names.map((n) => ({ id: n, name: n, initial: n === start, final: finals.includes(n), x: 100, y: 100 })), transitions: rules.map((r, i) => ({ id: 'v' + i, from: r[0], read: r[1], write: r[2], move: r[3], to: r[4] })) };
  };
  const counter = (K) => {
    const R = [['init', '>', '>', 'R', 'inc'], ['inc', '1', '0', 'R', 'inc'], ['inc', '0', '1', 'L', 'back'], ['inc', '_', '1', 'L', 'back'], ['back', '0', '0', 'L', 'back'], ['back', '1', '1', 'L', 'back'], ['back', '>', '>', 'R', 'c1'], ['rew', '0', '0', 'L', 'rew'], ['rew', '1', '1', 'L', 'rew'], ['rew', '>', '>', 'R', 'inc']];
    for (let k = 1; k <= K; k++) { const nx = k === K ? 'e' : 'c' + (k + 1); R.push(['c' + k, '1', '1', 'R', nx], ['c' + k, '0', '0', 'L', 'rew'], ['c' + k, '_', '_', 'L', 'rew']); }
    R.push(['e', '_', '_', 'S', 'H'], ['e', '0', '0', 'L', 'rew'], ['e', '1', '1', 'L', 'rew']);
    return TMB('init', ['H'], R);
  };
  H.voidSet = ({ runner, K1, pace, runaway, K2 }) => ({
    A: TMB('a', ['H'], [['a', '1', '1', 'R', 'a'], ['a', '_', '_', 'S', 'H']]),
    B: counter(K1),
    C: pace === 2 ? TMB('a', ['H'], [['a', '_', '_', 'R', 'b'], ['b', '_', '_', 'L', 'a']]) : TMB('a', ['H'], [['a', '_', '_', 'R', 'b'], ['b', '_', '_', 'R', 'c'], ['c', '_', '_', 'L', 'd'], ['d', '_', '_', 'L', 'a']]),
    D: runaway === 'ones' ? TMB('a', ['H'], [['a', '_', '1', 'R', 'a']]) : TMB('a', ['H'], [['a', '_', '1', 'R', 'b'], ['b', '_', '0', 'R', 'a']]),
    E: counter(K2),
  });
  H.runnerInput = ({ n }) => '1'.repeat(n);

  /* ---------- grammars ---------- */
  H.grammar = ({ text }) => CFG.parseText(text).grammar;
  return H;
};
