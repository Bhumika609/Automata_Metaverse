// One-time seeding: writes every level's reference machine as a real JFLAP .jff file in jflap/levels/.
// After seeding, the .jff files are the source of truth (edit them in JFLAP, then run: node tools/build-levels.js).
const T = require('../tests/harness'); T.load(T.FORMAL); T.load(T.GAME);
const fs = require('fs'), path = require('path');
const { G, F } = AM, S = require('../tests/solutions').build();
const dir = path.join(__dirname, '..', 'jflap', 'levels');
const out = {};
const R = G.REF;
Object.assign(out, { R1_reference: R.evenOnes, R2_reference: R.noBB, R3_reference: R.div3, R4_reference: AM.G.challengeById('R4').reference, R4_blueprint: R.bloated, R6_reference: R.hasABA,
  N1_reference: R.endsAB, N2_reference: G.challengeById('N2').reference, N3_reference: R.thirdFromEnd, N4_reference: R.subsetGiven,
  C1_part_ends0: null, C2_part_noAAA: null });
const r5 = G.challengeById('R5').rounds; r5.forEach((r, i) => { out[`R5_round${i + 1}_${r.nameA.split(' ')[1]}`] = r.a; out[`R5_round${i + 1}_${r.nameB.split(' ')[1]}`] = r.b; });
G.VOID_MACHINES.forEach((v) => (out[`V1_machine${v.id}`] = v.machine));
Object.assign(out, { G1_reference: S.G1, G2_reference: S.G2, G3_reference: S.G3, G4_given: G.challengeById('G4').given, G4_reference: S.G4,
  P1_reference: S.P1, P2_reference: S.P2, P3_reference: S.P3, T1_reference: S.T1, T2_reference: S.T2, T3_reference: S.T3 });
// parts of the maintenance-contract products
const B = F.FA.build;
out.C1_part_ends0 = B({ type: 'DFA', alphabet: '01', start: 'x', finals: ['y'], delta: { x: { 0: 'y', 1: 'x' }, y: { 0: 'y', 1: 'x' } } });
out.C2_part_noAAA = B({ type: 'DFA', alphabet: 'ab', start: 'u0', finals: ['u0', 'u1', 'u2'], delta: { u0: { a: 'u1', b: 'u0' }, u1: { a: 'u2', b: 'u0' }, u2: { a: 'u3', b: 'u0' }, u3: { a: 'u3', b: 'u3' } } });
for (const [k, m] of Object.entries(out)) { if (!m) throw new Error('missing ' + k); fs.writeFileSync(path.join(dir, k + '.jff'), F.JFLAP.exportMachine(F.autoLayout ? (m.type === 'CFG' ? m : (m.states.some((s) => s.x === undefined) ? F.autoLayout(m) : m)) : m)); }
console.log(Object.keys(out).length + ' .jff files written');
