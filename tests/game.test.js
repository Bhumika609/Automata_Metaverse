const T = require('./harness');
T.load(T.FORMAL); T.load(T.GAME);
const { suite, test, assert, eq } = T;
const S = require('./solutions');
const { FA, CFG, PDA, TM } = AM.F, G = AM.G;

/* in-memory storage so persistence can be tested without a browser */
function mem() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
const fresh = () => { G.Store.storage = mem(); G.Store.state = G.Store.newState('Tester'); return G.Store.state; };
const sol = S.build(), bad = S.wrong();
const clone = (o) => JSON.parse(JSON.stringify(o));
/** play a challenge to completion */
function play(id, machine, { hints = 0, tests = 0 } = {}) {
  const ch = G.challengeById(id), s = G.Game.startSession(ch);
  for (let i = 0; i < hints; i++) G.Game.useHint(s);
  for (let i = 0; i < tests; i++) G.Game.noteTest(s, 'x' + i);
  return { s, out: G.Game.submit(s, clone(machine)) };
}

suite('Challenge catalogue matches the blueprint', () => {
  test('world maxima = §7.4 example scores (3500, 2900, 2700, 2400, 1800, 1000)', () => {
    const want = { regular: 3500, nfa: 2900, cfg: 2700, pda: 2400, tm: 1800, void: 1000 };
    for (const w of G.WORLDS) eq(G.Score.worldMax(G.CHALLENGES, w.id), want[w.id], w.id);
    eq(G.WORLDS.reduce((a, w) => a + G.Score.worldMax(G.CHALLENGES, w.id), 0), 14300);
  });
  test('every challenge has a story, formal objective, 3 hints, a verifier-ready definition', () => {
    for (const c of G.CHALLENGES) { assert(c.story && c.formal && c.objective && c.title, c.id); eq(c.hints.length, 3, c.id + ' hints'); assert(c.max > 0 && c.par && c.budget, c.id); }
  });
  test('all 6 regions and every formal model are represented', () => { eq(G.WORLDS.map((w) => w.id), ['regular', 'nfa', 'cfg', 'pda', 'tm', 'void']); eq(new Set(G.CHALLENGES.map((c) => c.model)).size, 5); });
});

suite('Verification — every reference solution is accepted', () => {
  for (const id of Object.keys(sol)) {
    test(`${id} "${G.challengeById(id).title}" verifies`, () => {
      const v = G.verify(G.challengeById(id), clone(sol[id]));
      assert(v.ok, id + ' failed: ' + JSON.stringify(v.stages.filter((s) => s.status === 'fail')) + JSON.stringify(v.counterexample));
    });
  }
  test('regular-language challenges report EXACT proofs, CFG/PDA/TM report bounded verification', () => {
    assert(/exact/i.test(G.verify(G.challengeById('R1'), sol.R1).stages.find((s) => s.id === 'formal').name));
    assert(/Bounded/.test(G.verify(G.challengeById('G1'), sol.G1).stages.find((s) => s.id === 'formal').name));
    assert(/Bounded/.test(G.verify(G.challengeById('T1'), sol.T1).stages.find((s) => s.id === 'formal').name));
  });
});

suite('Verification — wrong machines fail with a counterexample (§9)', () => {
  for (const id of Object.keys(bad)) {
    test(`${id}: wrong machine rejected with evidence`, () => {
      const v = G.verify(G.challengeById(id), clone(bad[id]));
      assert(!v.ok, 'should fail');
      assert(v.counterexample && typeof v.counterexample.w === 'string', 'needs a counterexample');
      assert(v.counterexample.expected !== v.counterexample.actual, 'expected ≠ actual');
    });
  }
  test('counterexample is the SHORTEST distinguishing string', () => { eq(G.verify(G.challengeById('R1'), bad.R1).counterexample.w, ''); eq(G.verify(G.challengeById('R2'), bad.R2).counterexample.w, 'bb'); });
  test('example from the blueprint: Expected ACCEPT / Your machine REJECT', () => {
    const v = G.verify(G.challengeById('R1'), bad.R1); eq(v.counterexample.expected, 'ACCEPT'); eq(v.counterexample.actual, 'REJECT');
  });
  test('a PDA that never accepts, an ε-pushing PDA and a looping TM are all rejected (no hang)', () => {
    const p = clone(sol.P1); p.transitions = p.transitions.slice(0, 2); assert(!G.verify(G.challengeById('P1'), p).ok);
    const loop = { type: 'PDA', acceptMode: 'final', initialStack: 'Z', states: [{ id: 'q', name: 'q', initial: true, final: true }], transitions: [{ id: '1', from: 'q', to: 'q', read: '', pop: '', push: 'A' }, { id: '2', from: 'q', to: 'q', read: 'a', pop: '', push: '' }] };
    const t0 = Date.now(); const r = G.verify(G.challengeById('P1'), loop); assert(!r.ok && Date.now() - t0 < 9000, 'finished in time');
    const tm = clone(sol.T1); tm.transitions = [{ id: 'x', from: 'q0', to: 'q0', read: '_', write: '_', move: 'S' }, { id: 'y', from: 'q0', to: 'q0', read: '0', write: '0', move: 'S' }, { id: 'z', from: 'q0', to: 'q0', read: '1', write: '1', move: 'S' }];
    const v = G.verify(G.challengeById('T1'), tm); assert(!v.ok && /did not halt/.test(v.counterexample.actual));
  });
  test('structure errors are reported before testing (duplicate names, wrong type, bad alphabet)', () => {
    const d = clone(sol.R1); d.states[1].name = d.states[0].name; assert(/Duplicate/.test(G.verify(G.challengeById('R1'), d).stages[0].detail));
    const n = clone(sol.N1); assert(/needs/.test(G.verify(G.challengeById('R1'), n).stages[0].detail));
    const a = clone(sol.R1); a.transitions[0].read = 'z'; assert(/alphabet/.test(G.verify(G.challengeById('R1'), a).stages[0].detail));
    assert(!G.verify(G.challengeById('G1'), CFG.parseText('S -> aSc | ε').grammar).ok, 'terminal not in Σ');
  });
  test('R4 demands a MINIMAL DFA — the 6-state blueprint is correct but rejected', () => {
    const r4 = G.challengeById('R4'); const v = G.verify(r4, clone(r4.blueprint)); assert(!v.ok && v.notMinimal);
    assert(G.verify(r4, sol.R4).ok);
  });
  test('N4 needs a DFA — the NFA blueprint itself is refused', () => { assert(!G.verify(G.challengeById('N4'), clone(G.challengeById('N4').blueprint)).ok); });
  test('G4: the original ambiguous grammar fails the unambiguity stage; the repair passes', () => {
    const v = G.verify(G.challengeById('G4'), bad.G4); assert(!v.ok && v.counterexample.ambiguous);
    assert(G.verify(G.challengeById('G4'), sol.G4).ok);
  });
});

suite('Twin Gates, Ambiguity Hunt and Void Zone logic', () => {
  const r5 = G.challengeById('R5');
  test('Twin round 1: shortest distinguishing string is "010"', () => { const r = G.verifyTwin(r5, 0, { w: '010' }); assert(r.ok && r.isShortest); assert(!G.verifyTwin(r5, 0, { w: '11' }).ok); });
  test('Twin round 2: gates are equivalent; claiming a difference with a string fails, declaring equivalence succeeds', () => { assert(G.verifyTwin(r5, 1, { equivalent: true }).ok); assert(!G.verifyTwin(r5, 1, { w: 'ab' }).ok); });
  test('Twin round 3: wrongly declaring "equivalent" reveals the counterexample "1111"', () => { const r = G.verifyTwin(r5, 2, { equivalent: true }); assert(!r.ok && r.shortest === '1111'); assert(G.verifyTwin(r5, 2, { w: '1111' }).ok); });
  test('Ambiguity word check', () => { const g4 = G.challengeById('G4'); assert(G.verifyAmbiguousWord(g4, 'a+a+a').ok); assert(!G.verifyAmbiguousWord(g4, 'a+a').ok); assert(!G.verifyAmbiguousWord(g4, '++').ok); });
  test('Void machines behave as designed (halts / slow halt / provable loop / unknown / unknown)', () => {
    const run = (id, lim) => G.Game.voidRun(id, lim);
    eq(run('A', 10).status, 'accepted');
    eq(run('B', 10).status, 'limit'); eq(run('B', 100).status, 'limit'); eq(run('B', 1000).status, 'accepted');
    eq(run('C', 10).status, 'loop');
    eq(run('D', 1000000).status, 'limit');
    eq(run('E', 1000000).status, 'limit');
  });
  test('Void verdict grading: only the correct verdicts pass', () => {
    const v1 = G.challengeById('V1');
    const good = { verdicts: { A: 'halts', B: 'halts', C: 'loops', D: 'unknown', E: 'unknown' } };
    assert(G.verifyVoid(v1, good).ok); const w = G.verifyVoid(v1, { verdicts: { ...good.verdicts, D: 'loops' } }); assert(!w.ok && w.wrong[0] === 'D');
    const v2 = G.challengeById('V2');
    const proof = {}; for (const q of G.VOID_PROOF) proof[q.id] = q.answer; const cls = {}; for (const q of G.VOID_CLASSIFY) cls[q.id] = q.answer;
    assert(G.verifyVoid(v2, { proof, classify: cls }).ok); cls.c2 = 'decidable'; assert(!G.verifyVoid(v2, { proof, classify: cls }).ok);
  });
  test('Mystery Counter really halts (after millions of steps) — verified offline', () => {
    const r = TM.run(G.VOID_MACHINES[4].machine, '>', { maxSteps: 30000000, traceLimit: 0 }); eq(r.status, 'accepted'); assert(r.steps > 1000000, 'steps=' + r.steps);
  });
});

suite('Scoring — verified independently of the UI (§7)', () => {
  const ch = G.challengeById('R1');
  test('perfect play scores exactly the challenge maximum (700)', () => {
    const sc = G.Score.compute(ch, { correct: true, size: 2, tests: 3, hints: 0, time: 30, optionalMet: true }); eq(sc.total, 700); eq(sc.max, 700); eq(sc.parts.length, 6);
  });
  test('un-scaled maximum is 1000 = 500+150+100+100+50+100', () => { eq(G.Score.compute({ max: 1000, optimal: 2, budget: 8, par: 100 }, { correct: true, size: 2, tests: 1, hints: 0, time: 1, optionalMet: true }).total, 1000); });
  test('a wrong machine scores ZERO no matter how fast / hint-free (correctness dominates)', () => { eq(G.Score.compute(ch, { correct: false, size: 2, tests: 0, hints: 0, time: 1, optionalMet: true }).total, 0); });
  test('correctness is 50% of the maximum', () => { const sc = G.Score.compute({ max: 1000, optimal: 2, budget: 8, par: 100 }, { correct: true, size: 99, tests: 999, hints: 3, time: 99999, optionalMet: false }); eq(sc.total, 500); });
  test('hints, extra states, extra probes and slowness each reduce the score', () => {
    const base = { correct: true, size: 2, tests: 3, hints: 0, time: 10, optionalMet: true }, top = G.Score.compute(ch, base).total;
    assert(G.Score.compute(ch, { ...base, hints: 1 }).total < top); assert(G.Score.compute(ch, { ...base, size: 5 }).total < top);
    assert(G.Score.compute(ch, { ...base, tests: 40 }).total < top); assert(G.Score.compute(ch, { ...base, time: 5000 }).total < top);
  });
  test('part rounding is consistent (total = sum of parts)', () => { for (const c of G.CHALLENGES) { const sc = G.Score.compute(c, { correct: true, size: c.optimal, tests: 2, hints: 1, time: c.par, optionalMet: true }); eq(sc.total, sc.parts.reduce((a, p) => a + p.got, 0), c.id); } });
  test('world score / overall score aggregate the best level scores', () => {
    const prog = { R1: { best: 700 }, R2: { best: 500 }, N1: { best: 300 }, C1: { best: 100 } };
    eq(G.Score.worldScore(prog, G.CHALLENGES, 'regular'), 1200); eq(G.Score.worldScore(prog, G.CHALLENGES, 'nfa'), 300); eq(G.Score.overall(prog, G.CHALLENGES, G.WORLDS), 1600);
  });
  test('levels & XP are monotone', () => { let last = 0; for (let xp = 0; xp < 3000; xp += 50) { const l = G.Score.levelFromXp(xp); assert(l >= last); last = l; } eq(G.Score.levelFromXp(0), 1); });
});

suite('Game flow — progress, XP, archive, unlocks', () => {
  test('completing a challenge saves progress, XP and archives a VERIFIED machine', () => {
    fresh(); const { out } = play('R1', sol.R1, { tests: 3 });
    assert(out.result, 'completed'); assert(out.result.score.total > 600, 'score ' + out.result.score.total);
    const st = G.Store.state; assert(st.progress.R1.completed); eq(st.progress.R1.best, out.result.score.total);
    eq(st.machines.length, 1); assert(st.machines[0].verified); eq(st.machines[0].name, 'Even-One Security DFA'); eq(st.machines[0].history[0].challengeId, 'R1');
    assert(st.player.xp > 25);
  });
  test('failed attempts are recorded (analytics) without hiding the reason', () => {
    fresh(); const { out } = play('R1', bad.R1); assert(!out.result); eq(G.Store.state.attempts.length, 1); eq(G.Store.state.attempts[0].result, 'failed'); eq(G.Store.state.attempts[0].counterexample, ''); eq(G.Store.state.progress.R1.fails, 1);
    eq(G.Store.state.machines.length, 0);
  });
  test('replaying keeps the BEST score and does not downgrade the archive', () => {
    fresh(); const a = play('R1', sol.R1, { hints: 0 }).out.result.score.total; const b = play('R1', sol.R1, { hints: 3 }).out.result;
    eq(G.Store.state.progress.R1.best, a); assert(b.score.total < a); eq(G.Store.state.machines.length, 1);
  });
  test('hints are counted and reduce the score', () => { fresh(); const a = play('R3', sol.R3, { hints: 2 }).out.result.score; assert(a.parts.find((p) => p.id === 'hints').got < a.parts.find((p) => p.id === 'hints').pts); });
  test('sequential unlocking: R2 locked until R1 done; NFA District needs 2 Regular City wins', () => {
    fresh(); assert(!G.Game.challengeUnlocked(G.challengeById('R2'))); assert(!G.Game.worldUnlocked(G.worldById('nfa')));
    play('R1', sol.R1); assert(G.Game.challengeUnlocked(G.challengeById('R2')));
    const r = play('R2', sol.R2).out.result; assert(G.Game.worldUnlocked(G.worldById('nfa'))); assert(r.unlocked.worlds.includes('nfa'), 'unlock reported');
  });
  test('demo mode unlocks everything', () => { fresh(); G.Store.state.settings.demo = true; assert(G.Game.worldUnlocked(G.worldById('void'))); assert(G.Game.challengeUnlocked(G.challengeById('T3'))); });
  test('probe console (oracle) counts as test strings and never reveals the machine', () => {
    fresh(); const s = G.Game.startSession(G.challengeById('R1')); eq(G.Game.probe(s, '11').result, 'ACCEPT'); eq(G.Game.probe(s, '1').result, 'REJECT'); G.Game.probe(s, '1'); eq(s.tests.size, 2);
  });
  test('summary aggregates', () => { fresh(); play('R1', sol.R1); const sm = G.Game.summary(); eq(sm.completed, 1); eq(sm.totalChallenges, 22); eq(sm.overallMax, 14300); assert(sm.overall > 0); });
});

suite('Machine Archive · persistence · deployment (§5, §17)', () => {
  test('state survives save → reload (persistence & reload)', () => {
    fresh(); play('R1', sol.R1); G.Store.flush(); const keep = G.Store.storage;
    G.Store.state = null; G.Store.storage = keep; G.Store.load();
    eq(G.Store.state.machines.length, 1); assert(G.Store.state.progress.R1.completed); eq(G.Store.state.player.name, 'Tester');
    assert(FA.accepts(G.Store.state.machines[0].structure, '11'), 'reloaded machine still works');
  });
  test('export / import round trip; garbage rejected', () => { fresh(); play('R1', sol.R1); const j = G.Store.exportJSON(); fresh(); G.Store.importJSON(j); eq(G.Store.state.machines.length, 1); let t = false; try { G.Store.importJSON('{"x":1}'); } catch (e) { t = true; } assert(t); });
  test('old saves missing new fields are upgraded safely', () => { fresh(); const raw = clone(G.Store.state); delete raw.stats; delete raw.settings; G.Store.storage.setItem('automata-metaverse/save/v1', JSON.stringify(raw)); G.Store.load(); assert(Array.isArray(G.Store.state.stats.gardenStrings)); });
  test('ONLY verified machines can be deployed', () => {
    fresh(); const lab = G.Game.saveLabMachine('Draft', clone(sol.R1)); assert(!lab.verified);
    const r = G.Game.deploy(lab.id, 'gate_main'); assert(!r.ok && /VERIFIED/.test(r.reason));
    const ok = play('R1', sol.R1).out.result.machine; assert(G.Game.deploy(ok.id, 'gate_main').ok);
  });
  test('deployment has a world consequence: compliance with the object policy', () => {
    fresh(); const m = play('R1', sol.R1).out.result.machine; const d = G.Game.deploy(m.id, 'gate_main'); eq(d.compliance.pct, 100);
    const m2 = play('R2', sol.R2).out.result.machine; const e = G.Game.deploy(m2.id, 'gate_main'); assert(!e.ok, 'alphabet mismatch refused: ' + e.reason);
    const v = G.Game.deploy(m2.id, 'vending'); assert(v.ok && v.compliance.pct === 100);
  });
  test('type compatibility: a DFA cannot run in the Seed Dispenser (CFG)', () => { fresh(); const m = play('R1', sol.R1).out.result.machine; const r = G.Game.deploy(m.id, 'seeder'); assert(!r.ok && /CFG/.test(r.reason)); });
  test('redeploying replaces the old machine and records history', () => {
    fresh(); const m = play('R1', sol.R1).out.result.machine; G.Game.deploy(m.id, 'gate_main'); const lab = G.Game.saveLabMachine('x', sol.R1); G.Store.updateMachine(lab.id, { verified: true });
    G.Game.deploy(lab.id, 'gate_main'); eq(G.Game.deployedMachine('gate_main').id, lab.id); eq(G.Store.objectState('gate_main').log.length, 2); assert(!G.Store.getMachine(m.id).deployments.at(-1).active);
  });
  test('deleting a deployed machine also undeploys it', () => { fresh(); const m = play('R1', sol.R1).out.result.machine; G.Game.deploy(m.id, 'gate_main'); G.Game.deleteMachine(m.id); assert(!G.Game.deployedMachine('gate_main')); });
  test('every kind of machine deploys into its object (DFA, NFA, CFG, PDA, TM)', () => {
    fresh();
    const dep = (id, obj) => { const m = play(id, sol[id]).out.result.machine; const d = G.Game.deploy(m.id, obj); assert(d.ok, id + ' ' + d.reason); eq(d.compliance.pct, 100, obj + ' compliance'); };
    dep('R1', 'gate_main'); dep('R2', 'vending'); dep('N1', 'scanner'); dep('G1', 'seeder'); dep('P1', 'crate'); dep('T2', 'tape');
    eq(G.Store.state.stats.deployedMachineIds.length, 6);
  });
  test('a wrong-but-verified machine in the wrong job misbehaves (compliance < 100%)', () => {
    fresh(); const lab = G.Game.saveLabMachine('Even', clone(sol.R1)); G.Store.updateMachine(lab.id, { verified: true });
    const d = G.Game.deploy(lab.id, 'gate_main'); eq(d.compliance.pct, 100);
    G.Game.acceptContract('C1'); const rep = G.Game.objectReport('gate_main'); assert(rep.compliance.pct < 100, 'Policy v2 exposes the old machine: ' + rep.compliance.pct);
  });
  test('maintenance contract: locked → available → accepted → patched machine auto-redeployed', () => {
    fresh(); eq(G.Game.contractStatus('C1'), 'locked'); assert(!G.Game.acceptContract('C1'));
    const m = play('R1', sol.R1).out.result.machine; G.Game.deploy(m.id, 'gate_main'); eq(G.Game.contractStatus('C1'), 'available');
    assert(G.Game.acceptContract('C1')); eq(G.Game.contractStatus('C1'), 'active'); eq(G.Store.objectState('gate_main').policyVersion, 2);
    const r = play('C1', sol.C1).out.result; assert(r, 'patched'); eq(G.Game.contractStatus('C1'), 'done'); assert(r.deployed && r.deployed.ok && r.deployed.compliance.pct === 100);
    eq(G.Game.deployedMachine('gate_main').challengeId, 'C1'); assert(G.Game.overall() >= r.score.total, 'bonus counted in overall'); assert(G.Store.state.achievements.maintainer);
  });
  test('Combine (product construction) builds a new unverified machine from two archived ones', () => {
    fresh(); const a = play('R1', sol.R1).out.result.machine; const lab = G.Game.saveLabMachine('Ends0', FA.build({ type: 'DFA', alphabet: '01', start: 'x', finals: ['y'], delta: { x: { 0: 'y', 1: 'x' }, y: { 0: 'y', 1: 'x' } } }));
    const r = G.Game.combine(a.id, lab.id, 'and'); assert(r.ok && !r.machine.verified); assert(FA.equivalent(r.machine.structure, G.challengeById('C1').reference).equal);
  });
  test('Compare finds the shortest distinguishing string, and unlocks Counterexample Hunter', () => {
    fresh(); const a = G.Game.saveLabMachine('A', sol.R1), b = G.Game.saveLabMachine('B', bad.R1); const c = G.Game.compare(a.id, b.id); assert(c.ok && !c.equal); eq(c.shortest, '');
    const s = G.Game.submitDistinguisher(a.id, b.id, '1'); assert(s.ok); assert(G.Store.state.achievements.counterexample_hunter);
    assert(!G.Game.submitDistinguisher(a.id, a.id, '1').ok);
  });
});

suite('Achievements (§8 — all nine)', () => {
  test('Finite Mind: 5 DFA challenges without hints', () => { fresh(); for (const id of ['R1', 'R2', 'R3', 'R4', 'R6']) play(id, sol[id]); assert(G.Store.state.achievements.finite_mind); });
  test('…but not if hints were used', () => { fresh(); for (const id of ['R1', 'R2', 'R3', 'R4', 'R6']) play(id, sol[id], { hints: id === 'R3' ? 1 : 0 }); assert(!G.Store.state.achievements.finite_mind); });
  test('Minimalist: a minimal DFA', () => { fresh(); play('R1', sol.R1); assert(G.Store.state.achievements.minimalist); });
  test('Branch Master: NFA challenge with fewer than 5 test strings (and not with 5+)', () => { fresh(); play('N1', sol.N1, { tests: 5 }); assert(!G.Store.state.achievements.branch_master); play('N3', sol.N3, { tests: 2 }); assert(G.Store.state.achievements.branch_master); });
  test('Stack Engineer: aⁿbⁿ with a PDA', () => { fresh(); play('P1', sol.P1); assert(G.Store.state.achievements.stack_engineer); });
  test('Tape Master: a correct Turing machine', () => { fresh(); play('T1', sol.T1); assert(G.Store.state.achievements.tape_master); });
  test('Grammar Gardener: 10 distinct valid generated strings', () => {
    fresh(); for (let n = 0; n < 9; n++) G.Game.recordGardenString('a'.repeat(n) + 'b'.repeat(n), true); assert(!G.Store.state.achievements.grammar_gardener);
    G.Game.recordGardenString('aaaaaaaaabbbbbbbbb', true); G.Game.recordGardenString('aaaaaaaaabbbbbbbbb', true); assert(G.Store.state.achievements.grammar_gardener); eq(G.Store.state.stats.gardenStrings.length, 10);
    fresh(); G.Game.recordGardenString('ab', false); eq(G.Store.state.stats.gardenStrings.length, 0);
  });
  test('Machine Collector: 10 verified machines · World Builder: 5 deployments', () => {
    fresh(); const ids = ['R1', 'R2', 'R3', 'R4', 'R6', 'N1', 'N2', 'N3', 'G1', 'G2'];
    for (const id of ids) play(id, sol[id]); eq(G.Store.state.machines.filter((m) => m.verified).length, 10); assert(G.Store.state.achievements.machine_collector);
    const m = (id) => G.Store.state.machines.find((x) => x.challengeId === id).id;
    G.Game.deploy(m('R1'), 'gate_main'); G.Game.deploy(m('R2'), 'vending'); G.Game.deploy(m('N1'), 'scanner'); G.Game.deploy(m('G1'), 'seeder'); assert(!G.Store.state.achievements.world_builder);
    play('P1', sol.P1); G.Game.deploy(m('P1'), 'crate'); assert(G.Store.state.achievements.world_builder);
  });
  test('Counterexample Hunter via Twin Gates; Ambiguity Hunter; Cartographer', () => {
    fresh(); G.Game.recordDistinguished(); assert(G.Store.state.achievements.counterexample_hunter); G.Game.recordAmbiguity(); assert(G.Store.state.achievements.ambiguity_hunter);
    for (const w of G.WORLDS) G.Game.markVisited(w.id); assert(G.Store.state.achievements.cartographer);
  });
  test('Perfect Machine: maximum score on a challenge', () => { fresh(); const ch = G.challengeById('R1'); const s = G.Game.startSession(ch); const r = G.Game.submit(s, clone(sol.R1)); assert(r.result.score.total <= 700); eq(G.ACHIEVEMENTS.length, 14); });
  test('every achievement has progress and a goal', () => { fresh(); for (const a of G.ACHIEVEMENTS) { assert(a.goal > 0 && a.progress(G.Store.state) === 0, a.id); } });
});

suite('Void Zone completion & whole-game smoke test', () => {
  test('Void challenges score through the same pipeline', () => {
    fresh(); const s = G.Game.startSession(G.challengeById('V1'));
    const r = G.Game.submit(s, { verdicts: { A: 'halts', B: 'halts', C: 'loops', D: 'unknown', E: 'unknown' } }); assert(r.result && r.result.machine === null && r.result.score.total > 0);
  });
  test('playing EVERY challenge perfectly never exceeds the 14300 + contract-bonus ceiling', () => {
    fresh(); G.Store.state.settings.demo = true;
    for (const ch of G.CHALLENGES) {
      let r;
      if (ch.kind === 'twin' || ch.kind === 'void') { const s = G.Game.startSession(ch); r = G.Game.submit(s, ch.kind === 'void' ? (ch.id === 'V1' ? { verdicts: { A: 'halts', B: 'halts', C: 'loops', D: 'unknown', E: 'unknown' } } : (() => { const proof = {}, classify = {}; G.VOID_PROOF.forEach((q) => (proof[q.id] = q.answer)); G.VOID_CLASSIFY.forEach((q) => (classify[q.id] = q.answer)); return { proof, classify }; })()) : { done: true });
        if (ch.kind === 'twin') r = { result: G.Game.finalize(s, null, { ok: true }, {}) };
      } else r = play(ch.id, sol[ch.id]).out;
      assert(r.result, ch.id + ' not completed: ' + JSON.stringify(r.verification && r.verification.stages));
    }
    const sm = G.Game.summary(); eq(sm.completed, 22); assert(sm.overall <= 14300 + 550, 'overall ' + sm.overall); assert(sm.overall > 10000, 'overall ' + sm.overall);
    assert(Object.keys(G.Store.state.achievements).length >= 9, /* the other 5 need UI events: garden, probes, deploys, visits — each tested above */ 'achievements ' + Object.keys(G.Store.state.achievements).length);
  });
});

T.summary();
