/* ============================================================================
 * GAME WORLD LAYER · game controller
 * Glues formal verification, scoring, XP, achievements, the Machine Archive and
 * deployments together. No DOM access — the UI only calls this API.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F, FA = F.FA, TM = F.TM;
  const G = (AM.G = AM.G || {});
  const Game = (G.Game = {});
  const st = () => G.Store.state;
  const nowISO = () => new Date().toISOString();

  /* ---------------- progress helpers ---------------- */
  Game.progress = (id) => st().progress[id] || { completed: false, best: 0, attempts: 0, fails: 0 };
  Game.completedIn = (worldId) => G.challengesOf(worldId).filter((c) => Game.progress(c.id).completed).length;
  Game.worldUnlocked = function (w) {
    if (st().settings.demo || !w.unlock) return true;
    return Game.completedIn(w.unlock.world) >= w.unlock.count;
  };
  Game.challengeUnlocked = function (ch) {
    if (st().settings.demo) return true;
    if (ch.contract) return Game.contractStatus(ch.id) !== 'locked';
    const w = G.worldById(ch.world);
    if (!Game.worldUnlocked(w)) return false;
    const list = G.challengesOf(ch.world);
    const i = list.indexOf(ch);
    return i <= 0 || Game.progress(list[i - 1].id).completed;
  };
  Game.markVisited = function (worldId) { if (!st().visited[worldId]) { st().visited[worldId] = true; const fresh = G.evaluateAchievements(st()); G.Store.save(); return fresh; } return []; };
  Game.worldScore = (id) => G.Score.worldScore(st().progress, G.CHALLENGES, id);
  Game.worldMax = (id) => G.Score.worldMax(G.CHALLENGES, id);
  Game.overall = () => G.Score.overall(st().progress, G.CHALLENGES, G.WORLDS);
  Game.overallMax = () => G.WORLDS.reduce((a, w) => a + Game.worldMax(w.id), 0);
  Game.level = () => G.Score.levelInfo(st().player.xp);
  Game.summary = function () {
    const real = G.CHALLENGES.filter((c) => !c.contract);
    const done = real.filter((c) => Game.progress(c.id).completed).length;
    const machines = st().machines;
    return {
      overall: Game.overall(), overallMax: Game.overallMax(), level: Game.level(), xp: st().player.xp,
      completed: done, totalChallenges: real.length, completionPct: Math.round((100 * done) / real.length),
      machines: machines.length, verified: machines.filter((m) => m.verified).length,
      deployed: G.OBJECTS.filter((o) => G.Store.objectState(o.id).deployed).length, objects: G.OBJECTS.length,
      achievements: Object.keys(st().achievements).length, achievementsTotal: G.ACHIEVEMENTS.length,
      attempts: st().attempts.length, failed: st().attempts.filter((a) => a.result === 'failed').length,
      worlds: G.WORLDS.map((w) => ({ id: w.id, score: Game.worldScore(w.id), max: Game.worldMax(w.id), unlocked: Game.worldUnlocked(w), done: Game.completedIn(w.id), count: G.challengesOf(w.id).length })),
    };
  };

  /* ---------------- sessions (one per mission attempt) ---------------- */
  Game.startSession = function (ch) {
    return { ch, startedAt: Date.now(), hints: 0, tests: new Set(), attempts: 0, firstTry: true, probes: 0 };
  };
  Game.elapsed = (s) => (Date.now() - s.startedAt) / 1000;
  Game.useHint = function (s) {
    if (s.hints >= 3) return null;
    const text = s.ch.hints[s.hints] || 'No further hint.';
    s.hints++;
    return { level: s.hints, text, revealsFormal: s.hints === 1 && !!s.ch.hidden };
  };
  Game.noteTest = function (s, w) { s.tests.add(w); st().stats.tests++; };
  /** oracle used by the Probe Console: tells the player how the TRUE machine reacts */
  Game.probe = function (s, w) {
    const ch = s.ch;
    s.tests.add(w); s.probes++; st().stats.probes++;
    let result;
    if (ch.model === 'TM' && ch.tmKind === 'transform') { const out = ch.transform(w); result = out === null ? '(machine faults)' : out || '(blank tape)'; }
    else result = ch.pred(w) ? 'ACCEPT' : 'REJECT';
    G.Store.save();
    return { w, result };
  };

  /* ---------------- drafts ---------------- */
  /* a draft belongs to the challenge VARIANT it was started in */
  const dkey = (id) => { const c = G.challengeById(id); return c && c.variantId && c.variantId !== 'base' ? id + '@' + c.variantId : id; };
  Game.saveDraft = (id, m) => { st().drafts[dkey(id)] = F.clone(m); G.Store.save(); };
  Game.getDraft = (id) => st().drafts[dkey(id)] || null;
  Game.clearDraft = (id) => { delete st().drafts[dkey(id)]; G.Store.save(); };

  /* ---------------- submit & finalize ---------------- */
  /** Verify an attempt; on success compute score/XP/achievements and archive the machine. */
  Game.submit = function (s, machine, extra = {}) {
    const ch = s.ch;
    s.attempts++;
    const v = ch.kind === 'void' ? G.verifyVoid(ch, machine) : G.verify(ch, machine);
    const p = (st().progress[ch.id] = st().progress[ch.id] || { completed: false, best: 0, attempts: 0, fails: 0 });
    p.attempts++;
    st().attempts.push({ challengeId: ch.id, variantId: ch.variantId || 'base', result: v.ok ? 'verified' : 'failed', hints: s.hints, tests: s.tests.size, time: Math.round(Game.elapsed(s)), counterexample: v.counterexample ? v.counterexample.w : null, at: nowISO() });
    if (st().attempts.length > 400) st().attempts.splice(0, st().attempts.length - 400);
    if (!v.ok) { p.fails++; s.firstTry = false; G.Store.save(); return { verification: v }; }
    return { verification: v, result: Game.finalize(s, machine, v, extra) };
  };

  /** levels that have no machine to verify (Twin Gates): record the attempt and finish */
  Game.completeSpecial = function (s, extra = {}) {
    const ch = s.ch;
    s.attempts++;
    const p = (st().progress[ch.id] = st().progress[ch.id] || { completed: false, best: 0, attempts: 0, fails: 0 });
    p.attempts++;
    st().attempts.push({ challengeId: ch.id, result: 'verified', hints: s.hints, tests: s.tests.size, time: Math.round(Game.elapsed(s)), counterexample: null, at: nowISO() });
    return Game.finalize(s, null, { ok: true }, extra);
  };
  Game.failSpecial = function (s, info) {
    const p = (st().progress[s.ch.id] = st().progress[s.ch.id] || { completed: false, best: 0, attempts: 0, fails: 0 });
    p.fails++; s.firstTry = false;
    st().attempts.push({ challengeId: s.ch.id, result: 'failed', hints: s.hints, tests: s.tests.size, time: Math.round(Game.elapsed(s)), counterexample: info || null, at: nowISO() });
    G.Store.save();
  };

  Game.finalize = function (s, machine, v, extra = {}) {
    const ch = s.ch, S = st();
    const before = { level: Game.level().level, worlds: G.WORLDS.filter(Game.worldUnlocked).map((w) => w.id), chs: G.CHALLENGES.filter((c) => !c.contract && Game.challengeUnlocked(c)).map((c) => c.id) };
    const ctx = { correct: true, size: machine && ch.sizeLabel ? G.sizeOf(ch, machine) : ch.optimal, tests: s.tests.size, hints: s.hints, time: Game.elapsed(s), memoryCheck: !!S.stats.memoryCheck, firstTry: s.firstTry, shortestBoth: !!extra.shortestBoth, optionalMet: false };
    try { ctx.optionalMet = !!(ch.optional && ch.optional.check(machine, ctx)); } catch (e) { ctx.optionalMet = false; }
    const sc = G.Score.compute(ch, ctx);
    const p = (S.progress[ch.id] = S.progress[ch.id] || { completed: false, best: 0, attempts: 0, fails: 0 });
    const first = !p.completed, oldBest = p.best || 0;
    p.completed = true;
    if (sc.total >= oldBest) { p.best = sc.total; p.bestParts = sc.parts.map((x) => ({ id: x.id, got: x.got, pts: x.pts })); }
    const vid = ch.variantId || 'base';
    p.variants = p.variants || {}; p.variants[vid] = Math.max(p.variants[vid] || 0, sc.total);
    if (s.hints === 0) p.noHintSolved = true;
    const xpGain = (first ? 25 : 0) + G.Score.xpForScore(Math.max(0, sc.total - oldBest));
    S.player.xp += xpGain;
    if (ch.world === 'nfa' && ch.kind === 'build' && s.tests.size < 5) S.stats.branchMaster = true;
    if (v.minimal && machine && machine.type === 'DFA') S.stats.minimalDFA = true;

    let rec = null;
    if (machine && ch.kind !== 'void' && ch.kind !== 'twin') {
      const existing = !ch.contract && S.machines.find((m) => m.challengeId === ch.id && (m.variantId || 'base') === vid);
      const hist = { challengeId: ch.id, variantId: vid, result: 'verified', score: sc.total, at: nowISO() };
      if (existing && sc.total >= existing.score) {
        rec = G.Store.updateMachine(existing.id, { structure: F.clone(machine), type: machine.type, score: sc.total, verified: true, history: existing.history.concat([hist]) });
      } else if (!existing) {
        rec = G.Store.addMachine({ name: ch.archiveName, type: machine.type, structure: F.clone(machine), verified: true, score: sc.total, challengeId: ch.id, variantId: vid, history: [hist], alphabet: ch.alphabet.slice() });
      } else { rec = existing; existing.history.push(hist); }
    }
    let deployed = null;
    if (ch.contract && rec) { deployed = Game.deploy(rec.id, ch.object); }
    Game.clearDraft(ch.id);
    const fresh = G.evaluateAchievements(S);
    const after = { level: Game.level().level, worlds: G.WORLDS.filter(Game.worldUnlocked).map((w) => w.id), chs: G.CHALLENGES.filter((c) => !c.contract && Game.challengeUnlocked(c)).map((c) => c.id) };
    G.Store.save();
    return {
      score: sc, ctx, xpGain, first, improved: sc.total > oldBest, best: p.best, previousBest: oldBest, machine: rec, achievements: fresh, deployed,
      levelUp: after.level > before.level ? after.level : null,
      unlocked: { worlds: after.worlds.filter((w) => !before.worlds.includes(w)), challenges: after.chs.filter((c) => !before.chs.includes(c)) },
    };
  };

  /* ---------------- deployment ---------------- */
  Game.deployedMachine = function (objectId) {
    const os = G.Store.objectState(objectId);
    return os.deployed ? G.Store.getMachine(os.deployed.machineId) : null;
  };
  Game.deploy = function (machineId, objectId) {
    const rec = G.Store.getMachine(machineId), obj = G.objectById(objectId);
    if (!rec || !obj) return { ok: false, reason: 'Unknown machine or object.' };
    const c = G.deployCompat(rec, obj);
    if (!c.ok) return c;
    const os = G.Store.objectState(objectId);
    if (os.deployed) { const prev = G.Store.getMachine(os.deployed.machineId); if (prev) for (const d of prev.deployments) if (d.objectId === objectId) d.active = false; }
    os.deployed = { machineId, at: nowISO(), variantId: rec.variantId || 'base' };
    rec.deployments.push({ objectId, at: nowISO(), active: true });
    os.log.push({ machineId, name: rec.name, at: nowISO(), policyVersion: os.policyVersion });
    if (!st().stats.deployedMachineIds.includes(machineId)) st().stats.deployedMachineIds.push(machineId);
    const fresh = G.evaluateAchievements(st());
    G.Store.save();
    return { ok: true, compliance: G.compliance(objectId, rec.structure, os.policyVersion), achievements: fresh, object: obj, machine: rec };
  };
  Game.undeploy = function (objectId) {
    const os = G.Store.objectState(objectId);
    if (os.deployed) { const m = G.Store.getMachine(os.deployed.machineId); if (m) for (const d of m.deployments) if (d.objectId === objectId) d.active = false; }
    os.deployed = null; G.Store.save();
  };
  Game.objectReport = function (objectId) {
    const os = G.Store.objectState(objectId), m = Game.deployedMachine(objectId);
    return { state: os, machine: m, compliance: m ? G.compliance(objectId, m.structure, os.policyVersion) : null };
  };

  /* ---------------- maintenance contracts (policy updates) ---------------- */
  Game.contractFor = (objectId) => G.CHALLENGES.find((c) => c.contract && c.object === objectId) || null;
  Game.contractStatus = function (id) {
    const ch = G.challengeById(id);
    if (Game.progress(id).completed) return 'done';
    if (!Game.deployedMachine(ch.object) && !st().settings.demo) return 'locked';
    return st().contracts[id] && st().contracts[id].accepted ? 'active' : 'available';
  };
  Game.acceptContract = function (id) {
    const ch = G.challengeById(id);
    if (Game.contractStatus(id) === 'locked') return false;
    st().contracts[id] = { accepted: true, at: nowISO() };
    G.Store.objectState(ch.object).policyVersion = 2;
    G.Store.save();
    return true;
  };

  /* ---------------- special events ---------------- */
  const evt = (fn) => (...a) => { fn(...a); const fresh = G.evaluateAchievements(st()); G.Store.save(); return fresh; };
  Game.recordDistinguished = evt(() => { st().stats.distinguished++; });
  Game.recordAmbiguity = evt(() => { st().stats.ambiguousFound++; });
  Game.recordMemoryCheck = evt(() => { st().stats.memoryCheck = true; });
  Game.recordGardenString = function (w, valid) {
    if (!valid) return { added: false, fresh: [] };
    const arr = st().stats.gardenStrings;
    if (arr.includes(w)) return { added: false, fresh: [] };
    arr.push(w);
    const fresh = G.evaluateAchievements(st());
    G.Store.save();
    return { added: true, fresh, count: arr.length };
  };

  /* ---------------- archive tools ---------------- */
  Game.combine = function (idA, idB, op, name) {
    const a = G.Store.getMachine(idA), b = G.Store.getMachine(idB);
    if (!a || !b) return { ok: false, reason: 'Pick two machines.' };
    const fa = ['DFA', 'NFA', 'ENFA'];
    if (!fa.includes(a.type) || !fa.includes(b.type)) return { ok: false, reason: 'Combine works on finite automata (DFA / NFA / ε-NFA).' };
    const alpha = [...new Set([...FA.symbols(a.structure), ...FA.symbols(b.structure)])].sort();
    const m = FA.product(a.structure, b.structure, op, alpha);
    const label = { and: 'AND', or: 'OR', xor: 'XOR', diff: 'DIFF' }[op];
    const rec = G.Store.addMachine({ name: name || `${a.name} ${label} ${b.name}`, type: 'DFA', structure: m, verified: false, score: 0, origin: 'combine', derivedFrom: [idA, idB], alphabet: alpha });
    return { ok: true, machine: rec };
  };
  Game.compare = function (idA, idB) {
    const a = G.Store.getMachine(idA), b = G.Store.getMachine(idB);
    const fa = ['DFA', 'NFA', 'ENFA'];
    if (!a || !b || !fa.includes(a.type) || !fa.includes(b.type)) return { ok: false, reason: 'Compare works on finite automata.' };
    const r = FA.equivalent(a.structure, b.structure);
    return { ok: true, equal: r.equal, shortest: r.counterexample, inA: r.in1, inB: r.in2, explored: r.explored };
  };
  Game.submitDistinguisher = function (idA, idB, w) {
    const a = G.Store.getMachine(idA), b = G.Store.getMachine(idB);
    const x = FA.accepts(a.structure, w), y = FA.accepts(b.structure, w);
    if (x === y) return { ok: false, a: x, b: y };
    const fresh = Game.recordDistinguished();
    return { ok: true, a: x, b: y, achievements: fresh };
  };
  Game.deleteMachine = function (id) {
    for (const o of G.OBJECTS) { const os = G.Store.objectState(o.id); if (os.deployed && os.deployed.machineId === id) Game.undeploy(o.id); }
    return G.Store.deleteMachine(id);
  };
  /** save a free-build (Lab) machine into the archive as an UNVERIFIED draft */
  Game.saveLabMachine = function (name, machine) {
    return G.Store.addMachine({ name: name || 'Lab machine', type: machine.type, structure: F.clone(machine), verified: false, origin: 'lab', alphabet: G.machineAlphabet(machine) });
  };

  /* ---------------- Void Zone probe ---------------- */
  Game.voidRun = function (machineId, limit) {
    const vm = G.VOID_MACHINES.find((m) => m.id === machineId);
    const r = TM.run(vm.machine, vm.input, { maxSteps: limit, traceLimit: 0, detectLoop: true });
    return { status: r.status, steps: r.steps, limit };
  };
})();
