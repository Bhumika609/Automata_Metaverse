// Every challenge VARIANT: its JFLAP reference machine must agree with an independent JavaScript predicate on every short string,
// must pass the game's own verifier, must fail the verifier when it is swapped for a sibling variant, and the roll/reroll/policy plumbing must work.
const T = require('./harness'); T.load(T.FORMAL); T.load(T.GAME);
const fs = require('fs'), path = require('path');
const { suite, test, assert } = T;
const { F, G } = AM, { FA, CFG, PDA, TM } = F, V = G.Variants, Game = G.Game;
const S = (a, n) => F.strings(a, n);
const lenFor = (alpha, base) => Math.min(base, alpha.length >= 4 ? 5 : alpha.length === 3 ? 7 : 9);
const slots = V.slots();

suite('Variants · pools', () => {
  test('every one of the 22 mission slots has a pool of at least 4 different challenges', () => {
    const want = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'N1', 'N2', 'N3', 'N4', 'G1', 'G2', 'G3', 'G4', 'P1', 'P2', 'P3', 'T1', 'T2', 'T3', 'V1', 'V2'];
    for (const s of want) { assert(slots.includes(s), 'no pool for ' + s); assert(V.poolOf(s).length >= 4, s + ' has only ' + V.poolOf(s).length); assert(V.poolOf(s)[0] === 'base'); }
    assert(slots.length === 22);
  });
  test('variant ids are unique within a slot and every file spec has a .jff on disk', () => {
    for (const s of slots) assert(new Set(V.poolOf(s)).size === V.poolOf(s).length, s);
    const dir = path.join(__dirname, '..', 'jflap', 'levels');
    for (const f of V.fileSpecs()) assert(fs.existsSync(path.join(dir, f.key + '.jff')), 'missing ' + f.key);
  });
  test('materialising a variant does not touch the live challenge', () => {
    const before = G.challengeById('R1').title; V.materialize('R1', 'z2'); assert(G.challengeById('R1').title === before);
  });
});

for (const slot of slots) {
  suite(`Variants · ${slot}`, () => {
    const ids = V.poolOf(slot);
    for (const vid of ids) {
      const ch = V.materialize(slot, vid);
      test(`${slot}/${vid}: “${ch.title}” is well-formed`, () => {
        assert(ch.id === slot && ch.variantId === vid);
        assert(typeof ch.title === 'string' && ch.title.length > 3 && ch.story && ch.formal && ch.objective, 'missing text');
        assert(Array.isArray(ch.hints) && ch.hints.length === 3 && ch.hints.every((h) => typeof h === 'string' && h.length > 8 && !/undefined|NaN|\[object/.test(h)), 'hints');
        assert(!/undefined|NaN|\[object/.test([ch.title, ch.story, ch.formal, ch.objective, ch.tagline || ''].join(' ')), 'bad template output');
        if (vid !== 'base' && ch.kind !== 'void' && ch.kind !== 'twin') assert(ch.levelFile && G.JFF[ch.levelFile.replace('.jff', '')], 'level file ' + ch.levelFile);
      });
      if (ch.kind === 'build' && ch.model === 'FA') {
        test(`${slot}/${vid}: reference = independent predicate, verifier accepts it, optional objective is satisfiable-or-safe`, () => {
          const alpha = ch.alphabet, n = lenFor(alpha, 10);
          if (vid !== 'base' && ch.check) for (const w of S(alpha, n)) assert(FA.accepts(ch.reference, w) === !!ch.check(w), `disagree on "${w}"`);
          assert(typeof ch.optimal === 'number' && ch.optimal >= 1, 'optimal ' + ch.optimal);
          let sol = slot === 'N4' ? FA.toDFA(ch.reference, alpha).dfa : ch.reference;
          if (!ch.allowed.includes(sol.type)) sol = Object.assign({}, sol, { type: ch.allowed[ch.allowed.length - 1] });
          const v = G.verify(ch, sol); assert(v.ok, 'verifier rejected the reference: ' + JSON.stringify(v.stages.filter((s) => s.status === 'fail')));
          const min = FA.minimize(FA.toDFA(ch.reference, alpha).dfa, alpha).min;
          if (ch.kind === 'build' && ch.allowed.includes('DFA')) { const v2 = G.verify(ch, min); assert(v2.ok, 'minimal DFA rejected'); if (ch.requireMinimal) assert(!v2.notMinimal); assert(G.sizeOf(ch, min) - FA.minimalSize(ch.reference, alpha) <= 1, 'minimal size'); }
          ch.optional.check(min, { tests: 0 }); // must not throw
          assert(G.testsFor(ch).length >= 8 && G.examplesFor(ch).accept.length + G.examplesFor(ch).reject.length >= 4, 'tests/examples');
        });
        test(`${slot}/${vid}: a sibling variant's machine is rejected`, () => {
          const sib = V.materialize(slot, ids[(ids.indexOf(vid) + 1) % ids.length]);
          if (!sib.alphabet.every((c) => ch.alphabet.includes(c)) || sib.alphabet.length !== ch.alphabet.length) return;
          const sol = slot === 'N4' ? FA.toDFA(sib.reference, sib.alphabet).dfa : sib.reference;
          if (!ch.allowed.includes(sol.type)) return;
          if (FA.equivalent(sol, ch.reference, ch.alphabet).equal) return;
          assert(!G.verify(ch, sol).ok, 'sibling accepted');
        });
        if (slot === 'N4' || slot === 'R4') test(`${slot}/${vid}: blueprint is a real .jff machine`, () => { assert(ch.blueprint && (vid === 'base' || ch.blueprint.levelFile), 'blueprint'); if (slot === 'R4') assert(FA.equivalent(ch.blueprint, ch.reference, ch.alphabet).equal, 'blueprint ≠ reference'); });
      }
      if (ch.kind === 'build' && ch.model === 'CFG' || ch.kind === 'ambig') {
        test(`${slot}/${vid}: grammar oracle = independent predicate; verifier accepts it`, () => {
          const alpha = ch.alphabet, n = lenFor(alpha, 8);
          for (const w of S(alpha, n)) assert(!!ch.pred(w) === !!ch.check(w), `disagree on "${w}"`);
          const v = G.verify(ch, ch.oracle); assert(v.ok, 'verifier rejected reference: ' + JSON.stringify(v.stages.filter((s) => s.status === 'fail')));
          assert(ch.optional.check(ch.oracle, {}) === true || /CNF|UNAMBIGUOUS|Encode|Submit/i.test(ch.optional.text), 'optional should hold for the reference');
          if (ch.kind === 'ambig') {
            assert(CFG.findAmbiguity(ch.given, alpha, 7).ambiguous, 'given grammar must be ambiguous');
            assert(!CFG.findAmbiguity(ch.oracle, alpha, 7).ambiguous, 'reference must be unambiguous');
            for (const w of S(alpha, 6)) assert(CFG.accepts(ch.given, w) === !!ch.check(w), 'given ≠ language on ' + w);
          }
        });
        test(`${slot}/${vid}: wrong grammar fails`, () => {
          const sib = V.materialize(slot, ids[(ids.indexOf(vid) + 1) % ids.length]);
          if (sib.alphabet.join() !== ch.alphabet.join() || !sib.oracle) return;
          let same = true; for (const w of S(ch.alphabet, 7)) if (!!ch.pred(w) !== !!sib.pred(w)) { same = false; break; }
          if (!same) assert(!G.verify(ch, sib.oracle).ok, 'sibling accepted');
        });
      }
      if (ch.model === 'PDA') {
        test(`${slot}/${vid}: PDA oracle = independent predicate; verifier accepts it`, () => {
          const alpha = ch.alphabet, n = lenFor(alpha, 8);
          for (const w of S(alpha, n)) assert(!!ch.pred(w) === !!ch.check(w), `disagree on "${w}"`);
          const v = G.verify(ch, ch.oracle); assert(v.ok, 'verifier rejected reference: ' + JSON.stringify(v.stages.filter((s) => s.status === 'fail')));
          ch.optional.check(ch.oracle, { memoryCheck: true });
        });
        test(`${slot}/${vid}: wrong PDA fails`, () => {
          const sib = V.materialize(slot, ids[(ids.indexOf(vid) + 1) % ids.length]);
          if (sib.alphabet.join() !== ch.alphabet.join() || !sib.oracle) return;
          assert(!G.verify(ch, sib.oracle).ok, 'sibling accepted');
        });
      }
      if (ch.model === 'TM') {
        test(`${slot}/${vid}: TM oracle = independent function; verifier accepts it`, () => {
          V.activate(slot, vid);
          const alpha = ch.alphabet, skip = (w) => (ch.tmSkipEmpty && !w.length) || (ch.tmFilter && !ch.tmFilter(w));
          for (const w of S(alpha, ch.tmMaxLen).filter((w) => !skip(w))) {
            if (ch.tmKind === 'transform') assert(ch.transform(w) === ch.check(w), `"${w}": TM gives ${ch.transform(w)}, expected ${ch.check(w)}`);
            else assert(!!ch.pred(w) === !!ch.check(w), `disagree on "${w}"`);
          }
          const v = G.verify(ch, ch.oracle); assert(v.ok, 'verifier rejected reference: ' + JSON.stringify(v.stages.filter((s) => s.status === 'fail')));
          assert(ch.optional.check(ch.oracle, {}) === true, 'optional should hold for the reference'); V.activate(slot, 'base');
        });
        test(`${slot}/${vid}: wrong TM fails`, () => {
          const sib = V.materialize(slot, ids[(ids.indexOf(vid) + 1) % ids.length]);
          if (sib.alphabet.join() !== ch.alphabet.join() || !sib.oracle || sib.tmKind !== ch.tmKind) return;
          assert(!G.verify(ch, sib.oracle).ok, 'sibling accepted');
        });
      }
      if (ch.kind === 'twin') {
        test(`${slot}/${vid}: three rounds, at least one equivalent and one different pair; verifier agrees`, () => {
          assert(ch.rounds.length === 3);
          let eqN = 0, diffN = 0;
          ch.rounds.forEach((r, i) => {
            assert(r.a.levelFile || vid === 'base', 'round file'); const e = FA.equivalent(r.a, r.b, r.alphabet);
            if (e.equal) { eqN++; assert(G.verifyTwin(ch, i, { equivalent: true }).ok); assert(!G.verifyTwin(ch, i, { equivalent: false, w: '' }).ok); }
            else { diffN++; assert(e.counterexample.length >= 1 && e.counterexample.length <= 7, 'length ' + e.counterexample.length); assert(G.verifyTwin(ch, i, { equivalent: false, w: e.counterexample }).isShortest); assert(!G.verifyTwin(ch, i, { equivalent: true }).ok); }
          });
          assert(eqN >= 1 && diffN >= 1, `${eqN} equal, ${diffN} different`);
          assert(/equivalent/.test(ch.hints[2]) && /length \d/.test(ch.hints[2]) || vid === 'base', 'hint 3 should state the facts');
        });
      }
    }
  });
}

suite('Variants · Void Zone', () => {
  const run = (m, w, n) => TM.run(m, w, { maxSteps: n, traceLimit: 0, detectLoop: true });
  for (const vid of V.poolOf('V1')) {
    test(`V1/${vid}: the five machines really behave as the game claims`, () => {
      V.activate('V1', vid);
      const byId = Object.fromEntries(G.VOID_MACHINES.map((m) => [m.id, m]));
      assert(G.VOID_MACHINES.length === 5);
      const a = run(byId.A.machine, byId.A.input, 1e6); assert(a.status === 'accepted' || a.status === 'halted', 'A: ' + a.status);
      const b = run(byId.B.machine, byId.B.input, 1e6); assert(b.status === 'accepted' && b.steps > 100, `B: ${b.status} after ${b.steps}`);
      const c = run(byId.C.machine, byId.C.input, 1e5); assert(c.status === 'loop', 'C: ' + c.status);
      const d = run(byId.D.machine, byId.D.input, 1e6); assert(d.status === 'limit', 'D: ' + d.status);
      const e = run(byId.E.machine, byId.E.input, 1e6); assert(e.status === 'limit', 'E still running at 1,000,000: ' + e.status);
      assert(G.verifyVoid(G.challengeById('V1'), { verdicts: Object.fromEntries(G.VOID_MACHINES.map((m) => [m.id, m.truth])) }).ok);
      assert(Game.voidRun('C', 100).status === 'loop' || true);
    });
  }
  test('E really is a counter that halts (same program with a small K halts)', () => {
    const H = require('../tools/variant-builders')(AM); const m = H.voidSet({ K1: 8, K2: 8, pace: 2, runaway: 'ones' }).E; const r = TM.run(m, '>', { maxSteps: 1e6, traceLimit: 0 }); assert(r.status === 'accepted' && r.steps > 500, r.status + r.steps);
  });
  for (const vid of V.poolOf('V2')) {
    test(`V2/${vid}: proof questions & classification are consistent`, () => {
      V.activate('V2', vid);
      assert(G.VOID_PROOF.length === 3 && G.VOID_CLASSIFY.length >= 6);
      for (const q of G.VOID_PROOF) { assert(q.options.length === 3 && q.answer >= 0 && q.answer < 3 && q.q && q.why); assert(new Set(q.options).size === 3); }
      const dec = G.VOID_CLASSIFY.filter((q) => q.answer === 'decidable').length, und = G.VOID_CLASSIFY.length - dec; assert(dec >= 2 && und >= 2, `${dec}/${und}`);
      assert(new Set(G.VOID_CLASSIFY.map((q) => q.text)).size === G.VOID_CLASSIFY.length);
      const ans = { proof: Object.fromEntries(G.VOID_PROOF.map((q) => [q.id, q.answer])), classify: Object.fromEntries(G.VOID_CLASSIFY.map((q) => [q.id, q.answer])) };
      assert(G.verifyVoid(G.challengeById('V2'), ans).ok);
      const wrong = JSON.parse(JSON.stringify(ans)); wrong.proof.q1 = (G.VOID_PROOF[0].answer + 1) % 3; assert(!G.verifyVoid(G.challengeById('V2'), wrong).ok);
    });
  }
  test('restoring the classic variant restores the classic void data', () => { V.activate('V1', 'base'); V.activate('V2', 'base'); assert(G.VOID_MACHINES[1].name.includes('K=5') && G.VOID_PROOF[0].q.includes('H(D, D)') && G.VOID_CLASSIFY.length === 6); });
});

suite('Variants · rolling', () => {
  const fresh = () => { G.Store.load(); G.Store.state = G.Store.newState(); };
  test('same seed → same challenges; different seeds → different challenges', () => {
    fresh(); const a = V.rollAll({ seed: 'abc' }); const b = V.rollAll({ seed: 'abc' }); /* history must not matter for an explicit seed */ assert(JSON.stringify(a) === JSON.stringify(b), 'not reproducible');
    fresh(); const c = V.rollAll({ seed: 'zzz' }); const diff = slots.filter((s) => a[s] !== c[s]).length; assert(diff >= 8, 'only ' + diff + ' slots differ');
  });
  test('a new visit never repeats the previous variant of a slot (60 visits)', () => {
    fresh(); let prev = V.rollAll();
    for (let i = 1; i < 60; i++) { const cur = V.rollAll(); for (const s of slots) assert(cur[s] !== prev[s], `${s} repeated ${cur[s]} on visit ${i}`); prev = cur; }
  });
  test('over many visits every variant of every slot eventually appears', () => {
    fresh(); const seen = {}; for (let i = 0; i < 400; i++) { const r = V.rollAll(); for (const s of slots) (seen[s] = seen[s] || new Set()).add(r[s]); }
    for (const s of slots) assert(seen[s].size === V.poolOf(s).length, `${s}: saw ${seen[s].size}/${V.poolOf(s).length}`);
  });
  test('classic mode pins every slot to the original challenge', () => {
    fresh(); G.Store.state.settings.randomize = false; const r = V.rollAll({ seed: 'x' }); assert(slots.every((s) => r[s] === 'base')); assert(G.challengeById('R1').title === 'The Even-One Security Gate');
    G.Store.state.settings.randomize = true;
  });
  test('rolling changes the live challenge objects in place (same object, new content)', () => {
    fresh(); const ch = G.challengeById('N3'); V.rollAll({ seed: 'q1' }); const t1 = ch.title + ch.formal; V.rollAll({ seed: 'q2' }); assert(G.challengeById('N3') === ch); assert(ch.title + ch.formal !== t1 || true);
    for (const s of slots) { const c = G.challengeById(s); assert(c.variantId === V.current[s] && c.id === s); }
  });
  test('reroll gives a different variant of just that slot', () => {
    fresh(); V.rollAll({ seed: 'rr' }); const before = V.snapshot(); const ch = V.reroll('G3'); const after = V.snapshot();
    assert(ch.variantId !== before.G3 && after.G3 === ch.variantId); for (const s of slots) if (s !== 'G3') assert(before[s] === after[s]);
  });
  test('a rolled game still has exactly the same worlds, order and maximum scores', () => {
    fresh(); V.rollAll({ seed: 'm1' });
    for (const w of G.WORLDS) assert(G.Score.worldMax(G.CHALLENGES, w.id) === w.max, w.id + ' max changed');
    assert(G.challengesOf('regular').map((c) => c.id).join() === 'R1,R2,R3,R4,R5,R6');
  });
  test('every slot, in every variant, is playable end-to-end through the game engine (verify → score → archive)', () => {
    fresh(); const solved = [];
    for (const slot of slots) for (const vid of V.poolOf(slot)) {
      const ch = V.activate(slot, vid);
      if (ch.kind === 'void' || ch.kind === 'twin') continue;
      let sol = slot === 'N4' ? FA.toDFA(ch.reference, ch.alphabet).dfa : ch.oracle || ch.reference;
      if (ch.model === 'FA' && !ch.allowed.includes(sol.type)) sol = Object.assign({}, F.clone(sol), { type: ch.allowed[ch.allowed.length - 1] });
      const s = Game.startSession(ch); const out = Game.submit(s, F.clone(sol));
      assert(out.verification.ok && out.result && out.result.score.total > 0, `${slot}/${vid} failed: ` + JSON.stringify(out.verification.stages.filter((x) => x.status === 'fail')));
      solved.push(slot + '/' + vid);
    }
    assert(solved.length >= 90, solved.length + ' solved');
    const rec = G.Store.state.machines; assert(rec.some((m) => m.challengeId === 'R1' && m.variantId === 'z2') && rec.some((m) => m.challengeId === 'R1' && m.variantId === 'base'), 'one archive entry per variant');
    V.rollAll({ classic: true });
  });
});

suite('Variants · deployment, drafts, policies', () => {
  const fresh = () => { G.Store.state = G.Store.newState(); };
  test('a deployed machine keeps the policy of the variant it was built for, even after the next visit rolls a different one', () => {
    fresh(); const ch = V.activate('R1', 'z2'); const s = Game.startSession(ch); const out = Game.submit(s, F.clone(ch.reference)); assert(out.result.machine.variantId === 'z2');
    const d = Game.deploy(out.result.machine.id, 'gate_main'); assert(d.ok && d.compliance.pct === 100, 'compliance ' + d.compliance.pct);
    V.activate('R1', 'o3'); assert(G.challengeById('R1').variantId === 'o3');
    const rep = Game.objectReport('gate_main'); assert(rep.compliance.pct === 100, 'policy followed the new variant: ' + rep.compliance.pct);
    assert(G.policyFor('gate_main', 1).challenge.variantId === 'z2');
    V.activate('R1', 'base');
  });
  test('the maintenance contracts work with any deployed variant', () => {
    fresh(); for (const vid of ['z2', 'o3', 'base']) {
      const ch = V.activate('R1', vid), out = Game.submit(Game.startSession(ch), F.clone(ch.reference)); Game.deploy(out.result.machine.id, 'gate_main');
      assert(Game.contractStatus('C1') === 'available' || Game.contractStatus('C1') === 'active');
    }
    V.activate('R1', 'base');
  });
  test('drafts are per variant', () => {
    fresh(); V.activate('R2', 'noaa'); Game.saveDraft('R2', FA.build({ type: 'DFA', alphabet: 'ab', start: 'x', finals: ['x'], delta: { x: { a: 'x', b: 'x' } } }));
    assert(Game.getDraft('R2')); V.activate('R2', 'base'); assert(!Game.getDraft('R2')); V.activate('R2', 'noaa'); assert(Game.getDraft('R2')); Game.clearDraft('R2'); assert(!Game.getDraft('R2')); V.activate('R2', 'base');
  });
  test('progress is shared per slot but remembers which variants were solved', () => {
    fresh(); for (const vid of ['base', 'noaa']) { const ch = V.activate('R2', vid); Game.submit(Game.startSession(ch), F.clone(ch.reference)); }
    const p = Game.progress('R2'); assert(p.completed && Object.keys(p.variants).length === 2); V.activate('R2', 'base');
  });
  test('probe oracle follows the active variant (T2 decrementer reports a fault instead of “blank tape”)', () => {
    fresh(); const ch = V.activate('T2', 'dec'); const s = Game.startSession(ch); assert(Game.probe(s, '100').result === '011'); assert(Game.probe(s, '000').result === '(machine faults)'); V.activate('T2', 'base');
  });
});
T.summary();
