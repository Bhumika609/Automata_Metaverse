const T = require('./harness');
T.load(T.FORMAL);
const { suite, test, assert, eq } = T;
const F = AM.F, FA = F.FA, CFG = F.CFG, PDA = F.PDA, TM = F.TM, J = F.JFLAP;

/* --- reference machines (classic textbook examples) --- */
const evenOnes = () => FA.build({ type: 'DFA', alphabet: '01', start: 'e', finals: ['e'], delta: { e: { 0: 'e', 1: 'o' }, o: { 0: 'o', 1: 'e' } } });
const endsAB = () => FA.build({ type: 'NFA', alphabet: 'ab', start: 'p', finals: ['r'], delta: { p: { a: ['p', 'q'], b: 'p' }, q: { b: 'r' }, r: {} } });
const aStarBStar = () => FA.build({ type: 'ENFA', alphabet: 'ab', start: 'x', finals: ['y'], delta: { x: { a: 'x', ε: 'y' }, y: { b: 'y' } } });
const div3 = () => FA.build({ type: 'DFA', alphabet: '01', start: 'r0', finals: ['r0'], delta: { r0: { 0: 'r0', 1: 'r1' }, r1: { 0: 'r2', 1: 'r0' }, r2: { 0: 'r1', 1: 'r2' } } });

suite('DFA — transition logic, accepted and rejected strings', () => {
  const d = evenOnes();
  test('accepts strings with an even number of 1s', () => { for (const w of ['', '0', '11', '0110', '1111', '10101'.slice(0, 4)]) assert(FA.accepts(d, w), w); });
  test('rejects strings with an odd number of 1s', () => { for (const w of ['1', '1101', '0111', '10000']) assert(!FA.accepts(d, w), w); });
  test('empty string (boundary case) is handled', () => { assert(FA.accepts(d, ''), 'ε ∈ L'); assert(!FA.accepts(endsAB(), ''), 'ε ∉ ends-with-ab'); });
  test('binary numbers divisible by 3', () => { for (let n = 0; n < 200; n++) assert(FA.accepts(div3(), n.toString(2)) === (n % 3 === 0), String(n)); });
  test('a missing transition rejects (implicit dead state)', () => {
    const m = FA.build({ type: 'DFA', alphabet: 'ab', start: 'q', finals: ['q'], delta: { q: { a: 'q' } } });
    assert(FA.accepts(m, 'aaa')); assert(!FA.accepts(m, 'ab'));
  });
});

suite('Validation — invalid transitions, duplicate names, determinism', () => {
  test('duplicate state names are rejected', () => {
    const m = evenOnes(); m.states[1].name = m.states[0].name;
    assert(FA.validate(m, { kind: 'DFA' }).errors.some((e) => /Duplicate state name/.test(e)));
  });
  test('missing initial state is an error', () => { const m = evenOnes(); m.states.forEach((s) => (s.initial = false)); assert(!FA.validate(m, { kind: 'DFA' }).ok); });
  test('two initial states is an error', () => { const m = evenOnes(); m.states.forEach((s) => (s.initial = true)); assert(!FA.validate(m, { kind: 'DFA' }).ok); });
  test('transition to a non-existent state is an error', () => { const m = evenOnes(); m.transitions.push({ id: 'x', from: 'e', to: 'ghost', read: '0' }); assert(!FA.validate(m, { kind: 'DFA' }).ok); });
  test('symbol outside the alphabet is an error', () => { const m = evenOnes(); m.transitions[0].read = 'z'; assert(FA.validate(m, { kind: 'DFA', alphabet: ['0', '1'] }).errors.some((e) => /not in the alphabet/.test(e))); });
  test('DFA rejects non-determinism and ε', () => {
    assert(!FA.validate(endsAB(), { kind: 'DFA' }).ok, 'NFA is not a DFA');
    assert(FA.validate(aStarBStar(), { kind: 'DFA' }).errors.some((e) => /ε/.test(e)));
    assert(FA.validate(aStarBStar(), { kind: 'NFA' }).errors.some((e) => /ε/.test(e)));
    assert(FA.validate(aStarBStar(), { kind: 'ENFA' }).ok);
  });
  test('kindOf classifies machines', () => { eq(FA.kindOf(evenOnes()), 'DFA'); eq(FA.kindOf(endsAB()), 'NFA'); eq(FA.kindOf(aStarBStar()), 'ENFA'); });
  test('multi-character symbol is invalid', () => { const m = evenOnes(); m.transitions[0].read = '01'; assert(!FA.validate(m, { kind: 'DFA' }).ok); });
});

suite('NFA branching and ε-closure', () => {
  test('NFA accepts if ANY branch accepts', () => { const n = endsAB(); assert(FA.accepts(n, 'ab')); assert(FA.accepts(n, 'bbaab')); assert(!FA.accepts(n, 'aba')); });
  test('ε-closure follows chains of portals', () => {
    const m = FA.build({ type: 'ENFA', alphabet: 'a', start: 'a', finals: ['d'], delta: { a: { ε: 'b' }, b: { ε: 'c' }, c: { ε: 'd' } } });
    eq([...FA.closure(m, ['a'])].sort(), ['a', 'b', 'c', 'd']);
    assert(FA.accepts(m, ''), 'accepts ε via portals');
  });
  test('ε-loops terminate', () => {
    const m = FA.build({ type: 'ENFA', alphabet: 'a', start: 'a', finals: ['b'], delta: { a: { ε: 'b' }, b: { ε: 'a', a: 'b' } } });
    assert(FA.accepts(m, 'aaa'));
  });
  test('a*b* with an ε-portal', () => { const m = aStarBStar(); for (const w of ['', 'a', 'b', 'aabb', 'abab'.slice(0, 2)]) assert(FA.accepts(m, w), w); for (const w of ['ba', 'aba', 'bab']) assert(!FA.accepts(m, w), w); });
  test('clone frames: a fork splits, dead clones die, ε creates portal clones', () => {
    const r = FA.simulate(endsAB(), 'aab');
    assert(r.accepted);
    const split = r.frames.find((f) => f.kind === 'read' && f.clones.some((c) => c.kind === 'split'));
    assert(split, 'expected a split');
    const e = FA.simulate(aStarBStar(), 'ab');
    assert(e.frames.some((f) => f.kind === 'eps' && f.born.length), 'ε-portal frame');
    const rej = FA.simulate(endsAB(), 'aba');
    assert(!rej.accepted && rej.frames.some((f) => f.dead.length), 'dead clones appear');
  });
  test('simulate() agrees with accepts() on every short string', () => {
    for (const m of [evenOnes(), endsAB(), aStarBStar(), div3()]) for (const w of F.strings(['a', 'b', '0', '1'].filter((c) => m.alphabet.includes(c)), 6)) assert(FA.simulate(m, w).accepted === FA.accepts(m, w), w);
  });
});

suite('Subset construction', () => {
  test('DFA from NFA is deterministic and equivalent', () => {
    for (const n of [endsAB(), aStarBStar()]) { const { dfa } = FA.toDFA(n); assert(FA.isDeterministic(dfa) && FA.isComplete(dfa)); assert(FA.equivalent(n, dfa).equal); }
  });
  test('"third symbol from the end is 1": NFA has 4 states, the DFA needs 8', () => {
    const n = FA.build({ type: 'NFA', alphabet: '01', start: 'a', finals: ['d'], delta: { a: { 0: 'a', 1: ['a', 'b'] }, b: { 0: 'c', 1: 'c' }, c: { 0: 'd', 1: 'd' }, d: {} } });
    eq(n.states.length, 4); eq(FA.minimalSize(n), 8);
  });
  test('table rows mention super-states', () => { const r = FA.toDFA(endsAB()); assert(r.table.some((row) => row.name.includes(',')), 'a multi-state subset appears'); });
});

suite('Minimization and equivalence', () => {
  test('bloated DFA (a-count mod 6, accept if mod 3 = 0) minimises to 3 states', () => {
    const d = {}; for (let i = 0; i < 6; i++) d['c' + i] = { a: 'c' + ((i + 1) % 6), b: 'c' + i };
    const m = FA.build({ type: 'DFA', alphabet: 'ab', start: 'c0', finals: ['c0', 'c3'], delta: d });
    const r = FA.minimize(m, ['a', 'b']);
    eq(r.partialSize, 3); assert(FA.equivalent(m, r.min).equal); assert(r.rounds.length >= 2);
  });
  test('isMinimal recognises minimal and non-minimal machines', () => {
    assert(FA.isMinimal(evenOnes(), ['0', '1']));
    const d = {}; for (let i = 0; i < 6; i++) d['c' + i] = { a: 'c' + ((i + 1) % 6), b: 'c' + i };
    assert(!FA.isMinimal(FA.build({ type: 'DFA', alphabet: 'ab', start: 'c0', finals: ['c0', 'c3'], delta: d }), ['a', 'b']));
  });
  test('shortest distinguishing string (counterexample)', () => {
    const ends01 = FA.build({ type: 'DFA', alphabet: '01', start: 'a', finals: ['c'], delta: { a: { 0: 'b', 1: 'a' }, b: { 0: 'b', 1: 'c' }, c: { 0: 'b', 1: 'a' } } });
    const has01 = FA.build({ type: 'DFA', alphabet: '01', start: 'a', finals: ['c'], delta: { a: { 0: 'b', 1: 'a' }, b: { 0: 'b', 1: 'c' }, c: { 0: 'c', 1: 'c' } } });
    const r = FA.equivalent(ends01, has01); assert(!r.equal); eq(r.counterexample, '010');
  });
  test('equivalence of structurally different but equal machines', () => { const a = evenOnes(); const b = FA.minimize(a).min; assert(FA.equivalent(a, b).equal); assert(FA.equivalent(endsAB(), FA.toDFA(endsAB()).dfa).equal); });
  test('product construction: AND / OR / complement', () => {
    const e = evenOnes();
    const ends0 = FA.build({ type: 'DFA', alphabet: '01', start: 'a', finals: ['b'], delta: { a: { 0: 'b', 1: 'a' }, b: { 0: 'b', 1: 'a' } } });
    const both = FA.product(e, ends0, 'and'), either = FA.product(e, ends0, 'or'), notE = FA.complement(e);
    for (const w of F.strings(['0', '1'], 6)) {
      const x = FA.accepts(e, w), y = FA.accepts(ends0, w);
      assert(FA.accepts(both, w) === (x && y), 'and ' + w); assert(FA.accepts(either, w) === (x || y), 'or ' + w); assert(FA.accepts(notE, w) === !x, 'not ' + w);
    }
  });
});

suite('Context-free grammars — derivations, invalid productions, CNF, ambiguity', () => {
  const anbn = () => CFG.parseText('S -> aSb | ε').grammar;
  test('parseText understands ε, alternatives and the arrow styles', () => {
    const r = CFG.parseText('S → aSb | ε\nA -> a'); eq(r.errors, []); eq(r.grammar.productions.length, 3); eq(r.grammar.productions[1].right, []);
  });
  test('invalid productions are reported', () => {
    assert(CFG.parseText('s -> a').errors.length, 'lower-case left side'); assert(CFG.parseText('hello').errors.length, 'no arrow'); assert(CFG.parseText('').errors.length, 'empty grammar');
    assert(CFG.parseText('S -> aX').warnings.some((w) => /never defined/.test(w)), 'undefined nonterminal');
  });
  test('a^n b^n is generated and recognised (S → aSb | ε)', () => {
    const g = anbn(); for (let n = 0; n < 8; n++) assert(CFG.accepts(g, 'a'.repeat(n) + 'b'.repeat(n)), 'n=' + n);
    for (const w of ['a', 'b', 'ba', 'aab', 'abb', 'abab']) assert(!CFG.accepts(g, w), w);
  });
  test('derivation tree + leftmost derivation', () => {
    const g = anbn(); const t = CFG.parseTrees(g, 'aabb', 2); eq(t.length, 1); eq(CFG.treeYield(t[0]), 'aabb');
    eq(CFG.leftmostDerivation(t[0], g).map((s) => s.form), ['S', 'aSb', 'aaSbb', 'aabb']);
  });
  test('generate() lists the shortest strings of the language', () => { eq(CFG.generate(anbn(), 6, 10), ['', 'ab', 'aabb', 'aaabbb']); });
  test('palindromes', () => {
    const g = CFG.parseText('S -> aSa | bSb | a | b | ε').grammar;
    for (const w of F.strings(['a', 'b'], 8)) assert(CFG.accepts(g, w) === (w === [...w].reverse().join('')), w);
  });
  test('balanced parentheses', () => {
    const g = CFG.parseText('S -> SS | (S) | ε').grammar; const bal = (w) => { let d = 0; for (const c of w) { d += c === '(' ? 1 : -1; if (d < 0) return false; } return d === 0; };
    for (const w of F.strings(['(', ')'], 10)) assert(CFG.accepts(g, w) === bal(w), w);
  });
  test('Chomsky Normal Form conversion is correct and logged', () => {
    const g = CFG.parseText('S -> aSb | SS | ε').grammar; const { cnf, steps } = CFG.toCNF(g);
    assert(CFG.isCNF(cnf), CFG.toText(cnf)); assert(steps.length >= 6, 'teaching log');
    for (const w of F.strings(['a', 'b'], 8)) { const acc = CFG.accepts(g, w); const bal = (() => { let d = 0; for (const c of w) { d += c === 'a' ? 1 : -1; if (d < 0) return false; } return d === 0; })(); assert(acc === bal, w); }
  });
  test('ambiguity: E → E+E | a is ambiguous on a+a+a, the right-recursive grammar is not', () => {
    const amb = CFG.parseText('E -> E+E | E*E | a').grammar; const r = CFG.findAmbiguity(amb, ['a', '+', '*'], 5); assert(r.ambiguous); eq(r.word.length, 5);
    const ok = CFG.parseText('E -> a | a+E | a*E').grammar; assert(!CFG.findAmbiguity(ok, ['a', '+', '*'], 9).ambiguous);
    for (const w of F.strings(['a', '+', '*'], 7)) assert(CFG.accepts(amb, w) === CFG.accepts(ok, w), w);
  });
  test('ε-cycles do not hang the parser', () => { const g = CFG.parseText('S -> SS | S | ε | a').grammar; assert(CFG.accepts(g, 'aaa')); assert(CFG.parseTrees(g, 'aa', 2).length >= 1); });
});

suite('Pushdown automata — push/pop, underflow', () => {
  const anbn = () => FA_PDA();
  function FA_PDA() {
    const m = F.newMachine('PDA');
    m.states = [{ id: 'q0', name: 'q0', initial: true }, { id: 'q1', name: 'q1' }, { id: 'q2', name: 'q2', final: true }];
    m.transitions = [
      { id: '1', from: 'q0', to: 'q0', read: 'a', pop: '', push: 'A' }, { id: '2', from: 'q0', to: 'q1', read: 'b', pop: 'A', push: '' },
      { id: '3', from: 'q1', to: 'q1', read: 'b', pop: 'A', push: '' }, { id: '4', from: 'q1', to: 'q2', read: '', pop: 'Z', push: 'Z' }, { id: '5', from: 'q0', to: 'q2', read: '', pop: 'Z', push: 'Z' },
    ]; return m;
  }
  test('recognises a^n b^n (final-state acceptance)', () => {
    const m = anbn(); for (let n = 0; n < 7; n++) assert(PDA.accepts(m, 'a'.repeat(n) + 'b'.repeat(n)), 'n=' + n);
    for (const w of ['a', 'b', 'aab', 'abb', 'ba', 'abab']) assert(!PDA.accepts(m, w), w);
  });
  test('the accepting path shows the stack growing then shrinking', () => {
    const r = PDA.simulate(anbn(), 'aabb'); assert(r.accepted); const heights = r.path.map((c) => c.stack.length);
    assert(Math.max(...heights) === 3 && heights[0] === 1, JSON.stringify(heights));
  });
  test('stack underflow is detected and rejects', () => {
    const m = anbn(); const r = PDA.simulate(m, 'b'); assert(!r.accepted);
    const bad = F.newMachine('PDA'); bad.initialStack = ''; bad.states = [{ id: 'p', name: 'p', initial: true, final: true }]; bad.transitions = [{ id: '1', from: 'p', to: 'p', read: 'a', pop: 'A', push: '' }];
    const r2 = PDA.simulate(bad, 'a'); assert(!r2.accepted && r2.underflows > 0, 'underflow counted');
  });
  test('empty-stack acceptance mode', () => {
    const m = F.newMachine('PDA'); m.acceptMode = 'empty';
    m.states = [{ id: 'p', name: 'p', initial: true }];
    m.transitions = [{ id: '1', from: 'p', to: 'p', read: 'a', pop: 'Z', push: 'AZ' }, { id: '2', from: 'p', to: 'p', read: 'a', pop: 'A', push: 'AA' }, { id: '3', from: 'p', to: 'p', read: 'b', pop: 'A', push: '' }, { id: '4', from: 'p', to: 'p', read: '', pop: 'Z', push: '' }];
    assert(PDA.accepts(m, 'aabb')); assert(!PDA.accepts(m, 'aab'));
  });
  test('ε-push loops are bounded (no infinite run)', () => {
    const m = F.newMachine('PDA'); m.states = [{ id: 'p', name: 'p', initial: true }]; m.transitions = [{ id: '1', from: 'p', to: 'p', read: '', pop: '', push: 'A' }];
    const r = PDA.simulate(m, 'a'); assert(!r.accepted && r.truncated);
  });
  test('validation', () => { const m = anbn(); m.transitions[0].pop = 'AB'; assert(!PDA.validate(m).ok); assert(PDA.validate(anbn()).ok); });
});

suite('Turing machines — read/write/move, halting', () => {
  const flip = () => { const m = F.newMachine('TM'); m.states = [{ id: 'q0', name: 'q0', initial: true }, { id: 'qf', name: 'qf', final: true }];
    m.transitions = [{ id: '1', from: 'q0', to: 'q0', read: '0', write: '1', move: 'R' }, { id: '2', from: 'q0', to: 'q0', read: '1', write: '0', move: 'R' }, { id: '3', from: 'q0', to: 'qf', read: '_', write: '_', move: 'S' }]; return m; };
  test('bit flipper rewrites the tape', () => { const r = TM.run(flip(), '10110'); eq(r.status, 'accepted'); eq(r.output, '01001'); eq(r.steps, 6); });
  test('trace records read → write → move', () => { const r = TM.run(flip(), '01'); eq(r.trace.length, 4); eq(r.trace[1].head, 1); eq(r.trace[0].cells, '01'); eq(r.trace[1].cells, '11'); });
  test('rejects when no transition applies', () => { const m = flip(); m.transitions = m.transitions.slice(0, 2); const r = TM.run(m, '01'); eq(r.status, 'rejected'); });
  test('binary incrementer', () => {
    const m = F.newMachine('TM'); m.states = [{ id: 'a', name: 'a', initial: true }, { id: 'b', name: 'b' }, { id: 'f', name: 'f', final: true }];
    m.transitions = [['a', 'a', '0', '0', 'R'], ['a', 'a', '1', '1', 'R'], ['a', 'b', '_', '_', 'L'], ['b', 'b', '1', '0', 'L'], ['b', 'f', '0', '1', 'S'], ['b', 'f', '_', '1', 'S']].map((x, i) => ({ id: 't' + i, from: x[0], to: x[1], read: x[2], write: x[3], move: x[4] }));
    for (const w of ['0', '1', '011', '111', '1010', '1111']) eq(TM.run(m, w).output, (parseInt(w, 2) + 1).toString(2).padStart(w.length, '0'), w);
  });
  test('infinite computation is cut off by the step limit (status "limit")', () => {
    const m = F.newMachine('TM'); m.states = [{ id: 'a', name: 'a', initial: true }]; m.transitions = [{ id: '1', from: 'a', to: 'a', read: '_', write: '1', move: 'R' }];
    const r = TM.run(m, '', { maxSteps: 500 }); eq(r.status, 'limit'); eq(r.steps, 500);
  });
  test('repeated configuration PROVES non-halting (Brent cycle detection)', () => {
    const m = F.newMachine('TM'); m.states = [{ id: 'a', name: 'a', initial: true }, { id: 'b', name: 'b' }];
    m.transitions = [{ id: '1', from: 'a', to: 'b', read: '_', write: '_', move: 'S' }, { id: '2', from: 'b', to: 'a', read: '_', write: '_', move: 'S' }];
    eq(TM.run(m, '', { maxSteps: 10000, detectLoop: true }).status, 'loop');
  });
  test('validation catches non-determinism and bad moves', () => { const m = flip(); m.transitions.push({ id: 'x', from: 'q0', to: 'qf', read: '0', write: '0', move: 'R' }); assert(!TM.validate(m).ok); const n = flip(); n.transitions[0].move = 'X'; assert(!TM.validate(n).ok); });
});

suite('JFLAP bridge — round trips', () => {
  test('FA export → import keeps structure and language', () => { const m = endsAB(); const x = J.exportMachine(m); assert(x.includes('<type>fa</type>')); const back = J.importXML(x); eq(back.states.length, 3); assert(FA.equivalent(m, back).equal); eq(back.type, 'NFA'); });
  test('ε-NFA round trip', () => { const back = J.importXML(J.exportMachine(aStarBStar())); eq(back.type, 'ENFA'); assert(FA.accepts(back, 'aabb')); });
  test('grammar round trip', () => { const g = CFG.parseText('S -> aSb | ε').grammar; const back = J.importXML(J.exportMachine(g)); eq(back.productions.length, 2); assert(CFG.accepts(back, 'aabb')); });
  test('PDA and TM round trips', () => {
    const p = F.newMachine('PDA'); p.states = [{ id: 'a', name: 'q0', initial: true, final: true, x: 1, y: 2 }]; p.transitions = [{ id: '1', from: 'a', to: 'a', read: 'a', pop: 'Z', push: 'AZ' }];
    const pb = J.importXML(J.exportMachine(p)); eq(pb.type, 'PDA'); eq(pb.transitions[0].push, 'AZ');
    const t = F.newMachine('TM'); t.states = [{ id: 'a', name: 'q0', initial: true }, { id: 'b', name: 'q1', final: true }]; t.transitions = [{ id: '1', from: 'a', to: 'b', read: '_', write: '1', move: 'S' }];
    const tb = J.importXML(J.exportMachine(t)); eq(tb.type, 'TM'); eq(tb.transitions[0].write, '1');
  });
  test('reads a hand-written JFLAP file', () => {
    const xml = `<?xml version="1.0"?><structure><type>fa</type><automaton><state id="0" name="q0"><x>10</x><y>10</y><initial/></state><state id="1" name="q1"><x>90</x><y>10</y><final/></state><transition><from>0</from><to>1</to><read>a</read></transition><transition><from>1</from><to>1</to><read>a</read></transition></automaton></structure>`;
    const m = J.importXML(xml); assert(FA.accepts(m, 'aaa') && !FA.accepts(m, '') && m.type === 'DFA');
  });
  test('rejects garbage', () => { let threw = false; try { J.importXML('<hello/>'); } catch (e) { threw = true; } assert(threw); });
});

T.summary();
