// Proves the game's logic really comes from the JFLAP level files, and that those files are correct.
const T = require('./harness'); T.load(T.FORMAL); T.load(T.GAME);
const fs = require('fs'), path = require('path');
const { suite, test, assert } = T;
const { FA, CFG, PDA, TM, JFLAP } = AM.F, G = AM.G;
const dir = path.join(__dirname, '..', 'jflap', 'levels');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jff'));
const S = (a, n) => AM.F.strings(a, n);

suite('JFLAP level files · packaging', () => {
  test('the 34 classic + every variant .jff file exists and every one parses', () => { assert(files.length === 34 + G.Variants.fileSpecs().length, files.length + ' files'); for (const f of files) assert(JFLAP.importXML(fs.readFileSync(path.join(dir, f), 'utf8')), f); });
  test('packed bundle js/game/jflap_levels.js is identical to the .jff files (run tools/build-levels.js if this fails)', () => {
    for (const f of files) assert(G.JFF[f.replace('.jff', '')] === fs.readFileSync(path.join(dir, f), 'utf8'), 'stale: ' + f);
    assert(Object.keys(G.JFF).length === files.length);
  });
  test('every file is real JFLAP XML structure (<structure><type>…)', () => { for (const f of files) assert(/<structure>[\s\S]*<type>(fa|pda|turing|grammar)<\/type>/.test(fs.readFileSync(path.join(dir, f), 'utf8')), f); });
});
suite('JFLAP level files · the game uses them', () => {
  test('finite-automaton references are the loaded .jff machines', () => {
    for (const id of ['R1', 'R2', 'R3', 'R4', 'R6', 'N1', 'N2', 'N3', 'N4', 'C1', 'C2']) assert(G.challengeById(id).reference.levelFile === id + '_reference.jff', id);
  });
  test('grammar / PDA / TM oracles come from .jff files', () => {
    for (const id of ['G1', 'G2', 'G3', 'G4', 'P1', 'P2', 'P3', 'T1', 'T2', 'T3']) { const ch = G.challengeById(id); assert(ch.levelFile === id + '_reference.jff' && ch.oracle, id); }
  });
  test('twin gates and void machines are .jff files', () => {
    for (const r of G.challengeById('R5').rounds) assert(r.a.levelFile && r.b.levelFile);
    for (const v of G.VOID_MACHINES) assert(v.machine.levelFile === 'V1_machine' + v.id + '.jff');
  });
  test('editing a .jff really changes the game (R1 swapped for a "no 1s" machine in a fresh process)', () => {
    const { execFileSync } = require('child_process');
    const alt = JFLAP.exportMachine(FA.build({ type: 'DFA', alphabet: '01', start: 'ok', finals: ['ok'], delta: { ok: { 0: 'ok', 1: 'bad' }, bad: { 0: 'bad', 1: 'bad' } } }));
    const code = `const T=require(${JSON.stringify(path.join(__dirname, 'harness.js'))});T.load(T.FORMAL);
      T.load(['js/game/data.js','js/game/scoring.js','js/game/store.js','js/game/achievements.js','js/game/jflap_levels.js']);
      AM.G.JFF.R1_reference=${JSON.stringify(alt)};T.load(['js/game/challenges.js']);
      const r=AM.G.challengeById('R1').reference;const F=AM.F.FA;console.log(JSON.stringify([F.accepts(r,'000'),F.accepts(r,'1'),F.accepts(r,'11')]));`;
    assert(execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }).trim() === '[true,false,false]', 'game did not follow the edited .jff');
  });
});
suite('JFLAP level files · correctness vs independent JavaScript checks', () => {
  const ones = (w) => (w.match(/1/g) || []).length;
  const fa = { R1: [['0', '1'], (w) => ones(w) % 2 === 0], R2: [['a', 'b'], (w) => !w.includes('bb')], R3: [['0', '1'], (w) => parseInt(w || '0', 2) % 3 === 0], R4: [['a', 'b'], (w) => (w.match(/a/g) || []).length % 3 === 0],
    R6: [['a', 'b'], (w) => w.includes('aba')], N1: [['a', 'b'], (w) => w.endsWith('ab')], N2: [['a', 'b', 'c'], (w) => /^a*b*c*$/.test(w)], N3: [['0', '1'], (w) => w.length >= 3 && w[w.length - 3] === '1'],
    N4: [['a', 'b'], (w) => w.includes('ab') || w.endsWith('bb')], C1: [['0', '1'], (w) => ones(w) % 2 === 0 && w.endsWith('0')], C2: [['a', 'b'], (w) => !w.includes('bb') && !w.includes('aaa')] };
  for (const [id, [al, pred]] of Object.entries(fa)) test(`${id}_reference.jff accepts exactly its language (all strings ≤ 9)`, () => { const m = G.challengeById(id).reference; for (const w of S(al, 9)) assert(FA.accepts(m, w) === pred(w), `${id} wrong on "${w}"`); });
  test('R4 blueprint (6 states) has the same language as the minimal reference', () => { assert(FA.equivalent(G.challengeById('R4').blueprint, G.challengeById('R4').reference, ['a', 'b']).equal); });
  test('N4 blueprint NFA = reference', () => { assert(FA.equivalent(G.challengeById('N4').blueprint, G.challengeById('N4').reference, ['a', 'b']).equal); });
  for (const id of ['G1', 'G2', 'G3', 'G4', 'P1', 'P2', 'P3', 'T3']) test(`${id}_reference.jff agrees with the independent predicate`, () => { const ch = G.challengeById(id); for (const w of S(ch.alphabet, Math.min(ch.maxLen || ch.tmMaxLen || 7, 8))) assert(!!ch.pred(w) === !!ch.check(w), `${id} wrong on "${w}"`); });
  for (const id of ['T1', 'T2']) test(`${id}_reference.jff computes the same function as the independent check`, () => { const ch = G.challengeById(id); for (const w of S(ch.alphabet, 6)) { if (id === 'T2' && !w) continue; assert(ch.transform(w) === ch.check(w), `${id} wrong on "${w}"`); } });
  test('G4: the given grammar is ambiguous and the reference grammar is not', () => { const ch = G.challengeById('G4'); assert(CFG.findAmbiguity(ch.given, ch.alphabet, 6).ambiguous); assert(!CFG.findAmbiguity(ch.oracle, ch.alphabet, 7).ambiguous); });
  test('Void machines behave as taught (Sprinter halts, Pacer loops)', () => { assert(G.Game.voidRun('A', 100).status === 'accepted'); assert(G.Game.voidRun('C', 1000).status === 'loop'); assert(G.Game.voidRun('D', 10000).status === 'limit'); });
});
T.summary();
