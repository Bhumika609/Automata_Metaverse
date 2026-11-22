/* Reference SOLUTIONS used only by the test-suite (never loaded by index.html).
 * One correct machine per challenge + deliberately wrong variants. */
const T = require('./harness');
const F = () => AM.F;

function build() {
  const { FA, CFG, PDA, TM } = AM.F;
  const B = FA.build;
  const pda = (accept, states, trans) => ({ type: 'PDA', acceptMode: accept, initialStack: 'Z', alphabet: [], states: states.map(([n, i, f]) => ({ id: n, name: n, initial: !!i, final: !!f, x: 100, y: 100 })), transitions: trans.map(([f, t, r, p, u], i) => ({ id: 'p' + i, from: f, to: t, read: r, pop: p, push: u })) });
  const tm = (states, trans) => ({ type: 'TM', blank: '_', alphabet: [], states: states.map(([n, i, f]) => ({ id: n, name: n, initial: !!i, final: !!f, x: 100, y: 100 })), transitions: trans.map(([f, t, r, w, m], i) => ({ id: 't' + i, from: f, to: t, read: r, write: w, move: m })) });
  const S = {};
  S.R1 = B({ type: 'DFA', alphabet: '01', start: 'even', finals: ['even'], delta: { even: { 0: 'even', 1: 'odd' }, odd: { 0: 'odd', 1: 'even' } } });
  S.R2 = B({ type: 'DFA', alphabet: 'ab', start: 'A', finals: ['A', 'B'], delta: { A: { a: 'A', b: 'B' }, B: { a: 'A' } } });
  S.R3 = B({ type: 'DFA', alphabet: '01', start: 'r0', finals: ['r0'], delta: { r0: { 0: 'r0', 1: 'r1' }, r1: { 0: 'r2', 1: 'r0' }, r2: { 0: 'r1', 1: 'r2' } } });
  S.R4 = B({ type: 'DFA', alphabet: 'ab', start: 'c0', finals: ['c0'], delta: { c0: { a: 'c1', b: 'c0' }, c1: { a: 'c2', b: 'c1' }, c2: { a: 'c0', b: 'c2' } } });
  S.R6 = B({ type: 'DFA', alphabet: 'ab', start: 's0', finals: ['s3'], delta: { s0: { a: 's1', b: 's0' }, s1: { a: 's1', b: 's2' }, s2: { a: 's3', b: 's0' }, s3: { a: 's3', b: 's3' } } });
  S.N1 = B({ type: 'NFA', alphabet: 'ab', start: 'p', finals: ['r'], delta: { p: { a: ['p', 'q'], b: 'p' }, q: { b: 'r' } } });
  S.N2 = B({ type: 'ENFA', alphabet: 'abc', start: 'q0', finals: ['q2'], delta: { q0: { a: 'q0', ε: 'q1' }, q1: { b: 'q1', ε: 'q2' }, q2: { c: 'q2' } } });
  S.N3 = B({ type: 'NFA', alphabet: '01', start: 'a', finals: ['d'], delta: { a: { 0: 'a', 1: ['a', 'b'] }, b: { 0: 'c', 1: 'c' }, c: { 0: 'd', 1: 'd' } } });
  const given = AM.G.challengeById('N4').reference;
  S.N4 = FA.minimize(FA.toDFA(given, ['a', 'b']).dfa, ['a', 'b']).min;
  S.N4.states = S.N4.states.filter((s) => s.name !== 'dead' || true);
  S.G1 = CFG.parseText('S -> aSb | ε').grammar;
  S.G2 = CFG.parseText('S -> (S)S | ε').grammar;
  S.G3 = CFG.parseText('S -> aSa | bSb | a | b | ε').grammar;
  S.G4 = CFG.parseText('E -> a | a+E | a*E').grammar;
  S.P1 = pda('final', [['q0', 1], ['q1'], ['q2', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q1', 'b', 'A', ''], ['q1', 'q1', 'b', 'A', ''], ['q0', 'q2', '', 'Z', 'Z'], ['q1', 'q2', '', 'Z', 'Z']]);
  S.P2 = pda('final', [['q0', 1], ['q1', 0, 1]], [['q0', 'q0', '(', '', 'A'], ['q0', 'q0', ')', 'A', ''], ['q0', 'q1', '', 'Z', 'Z']]);
  S.P3 = pda('final', [['q0', 1], ['q1'], ['q2', 0, 1]], [['q0', 'q0', 'a', '', 'A'], ['q0', 'q0', 'b', '', 'B'], ['q0', 'q1', 'c', '', ''], ['q1', 'q1', 'a', 'A', ''], ['q1', 'q1', 'b', 'B', ''], ['q1', 'q2', '', 'Z', 'Z']]);
  S.T1 = tm([['q0', 1], ['qf', 0, 1]], [['q0', 'q0', '0', '1', 'R'], ['q0', 'q0', '1', '0', 'R'], ['q0', 'qf', '_', '_', 'S']]);
  S.T2 = tm([['a', 1], ['b'], ['f', 0, 1]], [['a', 'a', '0', '0', 'R'], ['a', 'a', '1', '1', 'R'], ['a', 'b', '_', '_', 'L'], ['b', 'b', '1', '0', 'L'], ['b', 'f', '0', '1', 'S'], ['b', 'f', '_', '1', 'S']]);
  S.T3 = tm([['q0', 1], ['q1'], ['q2'], ['q3'], ['qf', 0, 1]], [['q0', 'q1', 'a', 'X', 'R'], ['q0', 'q3', 'Y', 'Y', 'R'], ['q0', 'qf', '_', '_', 'S'], ['q1', 'q1', 'a', 'a', 'R'], ['q1', 'q1', 'Y', 'Y', 'R'], ['q1', 'q2', 'b', 'Y', 'L'], ['q2', 'q2', 'a', 'a', 'L'], ['q2', 'q2', 'Y', 'Y', 'L'], ['q2', 'q0', 'X', 'X', 'R'], ['q3', 'q3', 'Y', 'Y', 'R'], ['q3', 'qf', '_', '_', 'S']]);
  const G = AM.G;
  S.C1 = FA.product(G.REF.evenOnes, FA.build({ type: 'DFA', alphabet: '01', start: 'x', finals: ['y'], delta: { x: { 0: 'y', 1: 'x' }, y: { 0: 'y', 1: 'x' } } }), 'and', ['0', '1']);
  S.C2 = FA.product(G.REF.noBB, FA.build({ type: 'DFA', alphabet: 'ab', start: 'u0', finals: ['u0', 'u1', 'u2'], delta: { u0: { a: 'u1', b: 'u0' }, u1: { a: 'u2', b: 'u0' }, u2: { a: 'u3', b: 'u0' }, u3: { a: 'u3', b: 'u3' } } }), 'and', ['a', 'b']);
  return S;
}
/** wrong-on-purpose variants — each must be rejected with a counterexample */
function wrong() {
  const { FA, CFG } = AM.F;
  const B = FA.build;
  const W = {};
  W.R1 = B({ type: 'DFA', alphabet: '01', start: 'even', finals: ['odd'], delta: { even: { 0: 'even', 1: 'odd' }, odd: { 0: 'odd', 1: 'even' } } }); // accepts odd
  W.R2 = B({ type: 'DFA', alphabet: 'ab', start: 'A', finals: ['A', 'B'], delta: { A: { a: 'A', b: 'B' }, B: { a: 'A', b: 'B' } } });        // allows bb
  W.R3 = B({ type: 'DFA', alphabet: '01', start: 'r0', finals: ['r0'], delta: { r0: { 0: 'r0', 1: 'r1' }, r1: { 0: 'r1', 1: 'r0' } } });
  W.R6 = B({ type: 'DFA', alphabet: 'ab', start: 's0', finals: ['s3'], delta: { s0: { a: 's1', b: 's0' }, s1: { a: 's1', b: 's2' }, s2: { a: 's3', b: 's0' }, s3: { a: 's3' } } }); // s3 forgets
  W.N1 = B({ type: 'NFA', alphabet: 'ab', start: 'p', finals: ['r'], delta: { p: { a: ['p', 'q'], b: 'p' }, q: { a: 'r' } } });
  W.G1 = CFG.parseText('S -> aSb | a').grammar;
  W.G2 = CFG.parseText('S -> (S) | ε').grammar;
  W.G4 = CFG.parseText('E -> E+E | E*E | a').grammar; // still ambiguous
  return W;
}
module.exports = { build, wrong };
