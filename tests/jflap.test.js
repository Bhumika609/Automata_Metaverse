const T = require('./harness');
T.load(T.FORMAL); T.load(T.GAME);
const { suite, test, assert } = T;
const { FA, CFG, PDA, JT } = AM.F;
const same = (a, b, alpha, n = 7) => AM.F.strings(alpha, n).every((w) => FA.accepts(a, w) === b(w));

suite('JFLAP · regex → ε-NFA', () => {
  const cases = [['(a|b)*abb', ['a', 'b'], (w) => /^(a|b)*abb$/.test(w)], ['a*b+', ['a', 'b'], (w) => /^a*b+$/.test(w)], ['(ab|ε)c?', ['a', 'b', 'c'], (w) => /^(ab)?c?$/.test(w)], ['0(01)*1', ['0', '1'], (w) => /^0(01)*1$/.test(w)]];
  for (const [re, al, pred] of cases) test('Thompson: ' + re, () => { const { machine } = JT.regexToENFA(re); assert(machine.type === 'ENFA'); assert(same(machine, pred, al), 'language mismatch'); });
  test('bad regex reports an error', () => { let e = null; try { JT.regexToENFA('(a|b'); } catch (x) { e = x; } assert(e && /closing/.test(e.message)); });
});
suite('JFLAP · ε-NFA → NFA', () => {
  test('result has no ε-moves and same language', () => {
    const { machine } = JT.regexToENFA('(a|b)*abb'); const { nfa } = JT.enfaToNFA(machine);
    assert(FA.epsCount(nfa) === 0); assert(same(nfa, (w) => /^(a|b)*abb$/.test(w), ['a', 'b']));
  });
});
suite('JFLAP · FA → regex', () => {
  for (const [name, m, al] of [['even 1s', AM.G.REF.evenOnes, ['0', '1']], ['no bb', AM.G.REF.noBB, ['a', 'b']], ['ends ab (NFA)', AM.G.REF.endsAB, ['a', 'b']], ['div by 3', AM.G.REF.div3, ['0', '1']]])
    test('round trip: ' + name, () => {
      const { regex } = JT.faToRegex(m); const back = JT.regexToENFA(regex.replace(/∅/g, '')).machine;
      assert(FA.equivalent(m, back, al).equal, 'regex ' + regex + ' is not equivalent');
    });
  test('empty language gives ∅', () => { const m = FA.build({ type: 'DFA', alphabet: 'a', start: 'p', finals: [], delta: { p: { a: 'p' } } }); assert(JT.faToRegex(m).regex === '∅'); });
});
suite('JFLAP · CFG → PDA', () => {
  for (const [name, txt, al] of [['anbn', 'S -> aSb | ε', ['a', 'b']], ['palindromes', 'S -> aSa | bSb | a | b | ε', ['a', 'b']], ['balanced', "S -> (S)S | ε", ['(', ')']], ['primed NTs', "S -> aS' | ε\nS' -> bS | b", ['a', 'b']]])
    test(name, () => {
      const g = CFG.parseText(txt).grammar, { pda } = JT.cfgToPDA(g);
      assert(PDA.validate(pda).ok, 'pda invalid');
      for (const w of AM.F.strings(al, 7)) assert(PDA.accepts(pda, w, { maxNodes: 20000, maxStack: 40 }) === CFG.accepts(g, w), 'disagree on "' + w + '"');
    });
});
suite('JFLAP · LL(1)', () => {
  test('S → aSb | ε is LL(1) and parses', () => {
    const g = CFG.parseText('S -> aSb | ε').grammar, i = JT.ll1(g);
    assert(i.isLL1 && i.follow.get('S').has('$') && i.follow.get('S').has('b'));
    assert(JT.ll1Parse(g, i, 'aabb').accepted && !JT.ll1Parse(g, i, 'aab').accepted);
  });
  test('ambiguous grammar shows conflicts', () => { assert(!JT.ll1(CFG.parseText('E -> E+E | a').grammar).isLL1); });
  test('FIRST/FOLLOW of expression grammar', () => {
    const g = CFG.parseText("E -> TX\nX -> +TX | ε\nT -> a | (E)").grammar, i = JT.ll1(g);
    assert(i.isLL1 && i.first.get('E').has('a') && i.first.get('E').has('(') && i.follow.get('X').has(')'));
    assert(JT.ll1Parse(g, i, 'a+(a+a)').accepted);
  });
});
suite('JFLAP · .jff round trip of converted machines', () => {
  test('regex machine exports and re-imports', () => {
    const { machine } = JT.regexToENFA('a(b|c)*'); const back = AM.F.JFLAP.importXML(AM.F.JFLAP.exportMachine(machine));
    assert(FA.equivalent(machine, back, ['a', 'b', 'c']).equal);
  });
  test('CFG→PDA exports and re-imports as PDA', () => {
    const { pda } = JT.cfgToPDA(CFG.parseText('S -> aSb | ε').grammar); const back = AM.F.JFLAP.importXML(AM.F.JFLAP.exportMachine(pda));
    assert(back.type === 'PDA' && PDA.accepts(back, 'aabb', { maxNodes: 5000 }));
  });
});
T.summary();
