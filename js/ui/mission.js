/* ============================================================================
 * UI LAYER · mission screen (Level Screen of blueprint §13), special missions
 * (Twin Gates, Ambiguity Hunt, Void Zone), Verification/Debug overlay,
 * Results screen and the Deploy flow.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, F = AM.F, G = AM.G;
  const h = UI.h, Game = G.Game, FA = F.FA, CFG = F.CFG;
  UI.screens = UI.screens || {};
  const worldOf = (ch) => G.worldById(ch.world);
  const KIND_NOTE = {
    FA: 'Exact verification: product-automaton equivalence proves your machine is right for EVERY string.',
    CFG: 'Bounded verification: every string up to the length bound is checked (CFG equivalence is undecidable).',
    PDA: 'Bounded verification: every string up to the length bound is checked (PDA equivalence is undecidable).',
    TM: 'Bounded verification: every input up to the length bound must halt with the right result.',
  };
  const fmtTime = (s) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  /* ===================================================================== */
  /*                   Verification / debug overlay (§13)                   */
  /* ===================================================================== */
  UI.verificationView = function (v, ch) {
    const list = h('div.stages', v.stages.map((s) => h('div.stg.' + s.status, h('span.ic', s.status === 'pass' ? '✔' : s.status === 'fail' ? '✘' : '•'), h('div', h('b', s.name), h('div.dim', s.detail)))));
    return h('div.col', list, v.warnings && v.warnings.length ? h('div.status', { style: { marginTop: '.4rem' } }, '⚠ ' + v.warnings[0]) : null, ch ? h('p.dim', { style: { fontSize: '.78rem', margin: '.4rem 0 0' } }, KIND_NOTE[ch.model] || '') : null);
  };
  /** failed verification → counterexample + replay; `replay(w)` loads the string into the simulator */
  UI.openDebug = function (v, ch, replay) {
    const ce = v.counterexample;
    const body = h('div.col');
    body.append(h('p.muted', ce ? 'Verification failed. Here is a concrete string on which your machine misbehaves — replay it to see exactly where it goes wrong.' : 'Verification failed before any string could be checked.'));
    if (ce) {
      body.append(h('div.ce', h('div', h('small', ce.ambiguous ? 'ambiguous word' : 'counterexample'), h('b.mono', ce.w === '' ? 'ε' : ce.w)), h('div', h('small', 'expected'), h('b', ce.expected)), h('div', h('small', 'your machine'), h('b.bad', ce.actual))));
    }
    body.append(UI.verificationView(v, ch));
    const btns = [{ label: 'Keep editing', primary: !ce }];
    if (ce && replay) btns.unshift({ label: '▶ Replay in simulator', primary: true, onClick: () => { setTimeout(() => replay(ce.w), 120); } });
    UI.modal({ title: '🐞 Debug overlay — verification failed', body, buttons: btns, wide: true });
  };

  /* ===================================================================== */
  /*                              deploy flow                               */
  /* ===================================================================== */
  UI.showCompliance = function (rep, obj) {
    const pct = rep.pct;
    return h('div.col', h('div.row', h('b', `Compliance with ${obj.name} policy`), h('span.sp'), h('span.badge.' + (pct === 100 ? 'ok' : 'no'), pct + '%  (' + rep.ok + '/' + rep.total + ')')), UI.bar(rep.ok, rep.total, pct === 100 ? 'good' : 'bad'),
      h('div', { style: { maxHeight: '220px', overflow: 'auto' } }, h('table.tbl', h('tr', h('th', 'visitor'), h('th', 'policy says'), h('th', 'machine does'), h('th', '')),
        rep.rows.map((r) => h('tr' + (r.ok ? '' : '.badrow'), h('td.mono', r.w === '' ? 'ε' : r.w), h('td', rep.kind === 'transform' ? h('span.mono', String(r.expected) || '(blank)') : UI.verdict(r.expected)), h('td', rep.kind === 'transform' ? h('span.mono', String(r.got) || '(blank)') : UI.verdict(r.got)), h('td', r.ok ? h('span.good', '✔') : h('span.bad', '✘')))))));
  };
  /** pick an object (when several fit) and deploy `rec` into it */
  UI.deployFlow = function (rec, preferredObjId, onDone) {
    const objs = G.OBJECTS.filter((o) => G.deployCompat(rec, o).ok);
    if (!rec.verified) return UI.toast('Only verified machines can be deployed. Verify it through a mission first.', { kind: 'warn' });
    if (!objs.length) { const any = G.OBJECTS.find((o) => o.accepts.includes(rec.type)); return UI.toast(any ? G.deployCompat(rec, any).reason : 'No world object runs this machine type.', { kind: 'warn' }); }
    const doDeploy = (obj, close) => {
      const r = Game.deploy(rec.id, obj.id);
      if (!r.ok) return UI.toast(r.reason, { kind: 'warn' });
      UI.sfx.unlock();
      (r.achievements || []).forEach((a) => UI.toast('Achievement unlocked: ' + a.name, { kind: 'gold', icon: a.icon }));
      if (close) close();
      const os = G.Store.objectState(obj.id);
      UI.modal({ title: `🚀 Deployed to ${obj.name}`, wide: true, body: h('div.col', h('p', `“${rec.name}” now controls the ${obj.name}. Policy version ${os.policyVersion}.`), UI.showCompliance(r.compliance, obj),
        os.policyVersion === 1 && Game.contractFor(obj.id) ? h('div.status.accept', '📜 A maintenance contract is now available for this object — requirements change in the real world!') : null), buttons: [{ label: 'Done', primary: true }] });
      if (onDone) onDone(r);
    };
    if (objs.length === 1) return doDeploy(objs[0]);
    const body = h('div.col', h('p.muted', 'Where should this machine run?'), objs.map((o) => h('button.mission-row', { type: 'button', onclick: () => doDeploy(o, m.close) }, h('span.dot', { style: { '--c': G.worldById(o.world).color } }, '⚙'), h('span', h('b', o.name), h('small', o.blurb)))));
    const m = UI.modal({ title: `Deploy “${rec.name}”`, body, buttons: [{ label: 'Cancel' }] });
    void preferredObjId;
  };

  /* ===================================================================== */
  /*                           the mission screen                           */
  /* ===================================================================== */
  /** "which challenge am I playing?" strip + the 🎲 button that swaps this mission for a different challenge */
  UI.variantBar = function (ch) {
    const V = G.Variants;
    if (!V || ch.contract || !V.rerollable(ch.id)) return null;
    const i = V.info(ch.id);
    return h('div.variant-bar', h('span.chip', '🎲 ' + (i.id === 'base' ? 'Classic challenge' : i.label)), h('span.dim', `1 of ${i.total} for this mission`), h('span.sp'),
      h('button.btn.sm', { type: 'button', title: 'Swap this mission for a different challenge', onclick: () => { V.reroll(ch.id); UI.sfx.click(); UI.go('mission', { id: ch.id }); UI.toast('New challenge: ' + G.challengeById(ch.id).title, { icon: '🎲' }); } }, '🎲 Different challenge'));
  };
  UI.screens.mission = function (root, { id }) {
    const ch = G.challengeById(id), w = ch && worldOf(ch);
    if (!ch) return UI.go('hub');
    if (!Game.challengeUnlocked(ch)) { UI.toast('That mission is still locked.', { kind: 'warn' }); return UI.go(ch.world ? 'region' : 'hub', { id: ch.world }); }
    document.body.dataset.world = ch.world;
    if (ch.kind === 'twin') return twinScreen(root, ch);
    if (ch.kind === 'void') return voidScreen(root, ch);
    const s = Game.startSession(ch);
    const isCFG = ch.model === 'CFG', model = ch.model;
    const hintsBox = h('div'), formalEl = h('div.formal'), probeLog = h('div.probe-log'), statsEls = { tests: h('b', '0'), hints: h('b', '0'), time: h('b', '0:00') };
    const updStats = () => { statsEls.tests.textContent = s.tests.size; statsEls.hints.textContent = s.hints; };
    const tick = setInterval(() => (statsEls.time.textContent = fmtTime(Game.elapsed(s))), 1000); UI.onCleanup(() => clearInterval(tick));
    const showFormal = () => {
      const locked = ch.hidden && s.hints === 0 && !Game.progress(ch.id).completed;
      formalEl.className = 'formal' + (locked ? ' locked' : ''); UI.clear(formalEl);
      formalEl.append(locked ? '🔒 The rule is hidden. Probe the oracle with test strings, study the examples and infer it. (Hint 1 reveals the formal definition.)' : ch.formal);
    };
    showFormal();

    /* ---- left: briefing ---- */
    const ex = G.examplesFor(ch);
    const exEl = h('div.col');
    const loadExample = (x) => { if (deck.setInput) deck.setInput(x); else deck.input.value = x; };
    if (ex.pairs) exEl.append(h('div.sub', 'Examples (input → output)'), h('div.chips', ex.pairs.map(([i, o]) => UI.chip(`${i} → ${o || '□'}`, '', () => loadExample(i)))));
    else exEl.append(h('div.sub', 'Examples'), h('div.chips', ex.accept.map((x) => UI.chip((x || 'ε') + ' ✔', 'good', () => loadExample(x))), ex.reject.map((x) => UI.chip((x || 'ε') + ' ✘', 'bad', () => loadExample(x)))));

    const probeIn = h('input.text.mono', { placeholder: 'probe string…', 'aria-label': 'Probe string', maxlength: 40, onkeydown: (e) => { if (e.key === 'Enter') doProbe(); } });
    const doProbe = () => {
      const x = probeIn.value.replace(/\s/g, '');
      const bad = [...x].find((c) => !ch.alphabet.includes(c));
      if (bad) return UI.toast(`Use only symbols from {${ch.alphabet.join(', ')}}.`, { kind: 'warn' });
      const r = Game.probe(s, x); updStats(); UI.sfx.click();
      probeLog.prepend(h('div', h('span.dim', 'oracle:  '), h('b', x === '' ? 'ε' : x), '  →  ', h('b', { class: r.result === 'ACCEPT' ? 'good' : r.result === 'REJECT' ? 'bad' : 'accent' }, r.result)));
      probeIn.value = '';
    };
    const lensBtns = h('div.tools-row');
    const useLens = (what) => {
      if (['minimize', 'subset'].includes(what) && !s._lensPaid) { s._lensPaid = true; if (s.hints < 3) s.hints++; hintsBox.append(h('div.hint-box', '🔍 Opening this lens counted as a hint.')); updStats(); showFormal(); }
      if (what === 'minimize') UI.openMinimizeLens(ch.blueprint || ch.reference, ch.alphabet);
      else if (what === 'subset') UI.openSubsetLab(ch.blueprint, ch.alphabet);
      else if (what === 'cnf') UI.openCNFLens(getMachine());
      else if (what === 'memory') UI.openMemoryCheck(() => { s.memoryCheck = true; });
    };
    const lensLabel = { minimize: '✂ Minimization Lens', subset: '⚗ Subset Lab', cnf: '🌲 CNF Lens', memory: '🧠 Memory Check' };
    if (ch.lens) lensBtns.append(h('button.btn.sm', { type: 'button', onclick: () => useLens(ch.lens) }, lensLabel[ch.lens]));
    if (isCFG) lensBtns.append(h('button.btn.sm', { type: 'button', onclick: () => UI.openGarden(getMachine()) }, '🌳 Grammar Garden'));

    const hintBtn = h('button.btn.sm', { type: 'button', onclick: () => {
      const r = Game.useHint(s);
      if (!r) return UI.toast('No more hints for this mission.', { kind: 'warn' });
      hintsBox.append(h('div.hint-box', h('b', `Hint ${r.level}: `), r.text)); updStats(); showFormal(); UI.sfx.click();
      if (r.level >= 3) hintBtn.disabled = true;
    } }, '💡 Hint');

    const brief = h('div.panel.brief', { style: { '--accent': w.color } },
      h('div.row', h('button.btn.sm', { type: 'button', onclick: () => UI.go('region', { id: ch.world }) }, '← ' + w.short), h('span.sp'), UI.typeBadge(ch.allowed[0] || (ch.kind === 'void' ? 'TM' : 'DFA'))),
      h('div.sub', { style: { marginTop: '.5rem' } }, ch.contract ? '📜 MAINTENANCE CONTRACT' : `${w.short} · mission ${ch.order}`),
      UI.variantBar(ch), h('h2', ch.title), h('div.muted', ch.tagline), h('p.story', ch.story), formalEl,
      h('div.sub', 'Objective'), h('p', { style: { margin: '.2rem 0 .6rem' } }, ch.objective),
      ch.blueprint ? h('div.col', h('div.sub', ch.blueprintLabel || 'Blueprint'), UI.mini(ch.blueprint, 'tall'), ch.blueprint.levelFile ? h('div.row', h('span.dim.mono', { style: { fontSize: '.72rem' } }, 'jflap/levels/' + ch.blueprint.levelFile), h('button.btn.sm', { type: 'button', onclick: () => UI.download(ch.blueprint.levelFile, G.JFF[ch.blueprint.levelFile.replace(/\.jff$/, '')], 'application/xml') }, '⬇ .jff')) : null) : null,
      ch.given ? h('div.col', h('div.sub', 'Given grammar'), h('pre.panel.mono', { style: { margin: 0, padding: '.5rem' } }, CFG.toText(ch.given)), h('div.row', h('span.dim.mono', { style: { fontSize: '.72rem' } }, 'jflap/levels/' + ch.given.levelFile), h('button.btn.sm', { type: 'button', onclick: () => UI.download(ch.given.levelFile, G.JFF[ch.given.levelFile.replace(/\.jff$/, '')], 'application/xml') }, '⬇ .jff'))) : null,
      h('div.opt-goal', h('span', '★'), h('span', h('b', 'Optional objective  '), ch.optional.text)),
      exEl,
      ch.pred || ch.transform ? h('div.col', h('div.sub', 'Oracle probe console ' + (ch.hidden ? '(the hidden rule)' : '(ask the true machine)')), h('div.probe', probeIn, h('button.btn.sm.primary', { type: 'button', onclick: doProbe }, 'Probe')), probeLog) : null,
      lensBtns, h('div.row', { style: { margin: '.6rem 0 .2rem' } }, hintBtn, h('span.dim', { style: { fontSize: '.74rem' } }, 'Each hint lowers the “No hints” bonus')), hintsBox,
      h('div.mstats', h('div.stat', h('small', 'tests'), statsEls.tests), h('div.stat', h('small', 'hints'), statsEls.hints), h('div.stat', h('small', 'time'), statsEls.time)));

    /* ---- centre: editor ---- */
    const stage = h('div.stage');
    let editor, ged, deck, saveT;
    const draftSave = (m) => { clearTimeout(saveT); saveT = setTimeout(() => Game.saveDraft(ch.id, m), 600); };
    if (isCFG) {
      ged = new UI.GrammarEditor(stage, { alphabet: ch.alphabet, onChange: draftSave });
    } else {
      editor = new UI.GraphEditor(stage, { model: model === 'FA' ? 'FA' : model, kind: ch.allowed[0], allowedKinds: ch.allowed, alphabet: ch.alphabet, onChange: draftSave });
    }
    const getMachine = () => (isCFG ? ged.getMachine() : editor.getMachine());
    const validate = () => (isCFG ? ged.validate() : editor.validate());

    /* ---- right: simulation + verify ---- */
    const side = h('div.side-col');
    const onTest = (x) => { Game.noteTest(s, x); updStats(); };
    if (isCFG) deck = new UI.GrammarDeck(side, { getGrammar: getMachine, validate, onTest, alphabet: ch.alphabet });
    else deck = new UI.SimDeck(side, { model, editor, getMachine, validate, onTest });
    const needStep1 = ch.kind === 'ambig' && !Game.progress(ch.id).completed && !G.Store.state.settings.demo;
    let step1 = !needStep1;
    const verifyBtn = h('button.btn.primary.big.verify-btn', { type: 'button', onclick: () => doVerify() }, '⚡ Verify & Submit');
    const doVerify = () => {
      if (!step1) return UI.toast('First expose the ambiguity (Step 1), then submit your repaired grammar.', { kind: 'warn' });
      const v = validate();
      if (!v.ok) { UI.sfx.bad(); return UI.openDebug({ stages: [{ id: 'structure', name: 'Structure check', status: 'fail', detail: v.errors[0] }], warnings: [], counterexample: null }, ch); }
      verifyBtn.disabled = true; verifyBtn.textContent = '⏳ Verifying…';
      setTimeout(() => {
        const m = getMachine();
        const out = Game.submit(s, m);
        verifyBtn.disabled = false; verifyBtn.textContent = '⚡ Verify & Submit'; updStats();
        if (!out.verification.ok) { UI.sfx.bad(); return UI.openDebug(out.verification, ch, (x) => { if (isCFG) { deck.input.value = x; deck.test(true); } else deck.debugReplay(x); }); }
        UI.go('results', { id: ch.id, res: out.result, verification: out.verification });
      }, 80);
    };
    side.append(h('div.panel', h('h3', 'Verification Engine'), h('p.dim', { style: { fontSize: '.8rem', margin: '0 0 .6rem' } }, KIND_NOTE[model] + (ch.maxLen || ch.tmMaxLen ? ` Bound: length ≤ ${ch.maxLen || ch.tmMaxLen}.` : '')), verifyBtn));

    /* ---- ambiguity step 1 ---- */
    let ambPanel = null;
    if (ch.kind === 'ambig') {
      const inp = h('input.text.mono', { placeholder: 'e.g. a+a+a', maxlength: 24, 'aria-label': 'Ambiguous word', onkeydown: (e) => { if (e.key === 'Enter') chk(); } });
      const out = h('div.col'), trees = h('div.grid', { style: { gridTemplateColumns: '1fr 1fr', gap: '.6rem' } });
      const chk = () => {
        const x = inp.value.replace(/\s/g, ''); onTest(x); const r = G.verifyAmbiguousWord(ch, x);
        UI.clear(out); UI.clear(trees);
        out.append(h('div.status.' + (r.ok ? 'accept' : 'reject'), r.msg));
        if (r.ok) {
          UI.sfx.ok(); step1 = true; verifyBtn.classList.remove('dim');
          r.trees.slice(0, 2).forEach((t, i) => { const tv = new UI.TreeView(); trees.append(h('div', h('div.sub', 'Parse tree ' + (i + 1)), tv.el)); tv.set(t); });
          Game.recordAmbiguity().forEach((a) => UI.toast('Achievement unlocked: ' + a.name, { kind: 'gold', icon: a.icon }));
          out.append(h('div.status.accept', '✔ Step 1 complete — now write an UNAMBIGUOUS grammar for the same language (Step 2) and submit.'));
        } else UI.sfx.bad();
      };
      ambPanel = h('div.panel', { style: { '--accent': w.color } }, h('h3', 'Step 1 · Expose the ambiguity'), h('p.muted', 'Find a string with two different parse trees in the given grammar.'), h('div.probe', inp, h('button.btn.sm.primary', { type: 'button', onclick: chk }, 'Check')), out, trees);
      if (!step1) verifyBtn.classList.add('dim');
    }

    const mid = h('div.col', { style: { minWidth: 0 } }, ambPanel, stage);
    root.append(h('div.screen', h('div.mission', brief, mid, side)));
    // restore draft
    const draft = Game.getDraft(ch.id);
    const starter = ch.contract ? Game.deployedMachine(ch.object) : null;
    requestAnimationFrame(() => {
      if (draft) { isCFG ? ged.setMachine(draft) : editor.setMachine(draft); UI.toast('Restored your unfinished draft.', { kind: 'info', icon: '📝' }); }
      else if (starter && !isCFG) { editor.setMachine(starter.structure); UI.toast('Loaded the currently deployed machine — patch it for Policy v2.', { kind: 'info', icon: '🛠' }); }
      else if (isCFG && ch.kind === 'ambig') { /* start blank */ }
    });
    if (ch.contract) Game.acceptContract(ch.id);
  };

  /* ===================================================================== */
  /*                        Twin Gates (equivalence)                         */
  /* ===================================================================== */
  function twinScreen(root, ch) {
    const w = worldOf(ch), s = Game.startSession(ch);
    let round = 0, shortestAll = true;
    const view = h('div.col');
    const stats = h('div.mstats', h('div.stat', h('small', 'probes'), h('b', '0')), h('div.stat', h('small', 'hints'), h('b', '0')), h('div.stat', h('small', 'round'), h('b', '1/3')));
    const updStats = () => { const b = stats.querySelectorAll('b'); b[0].textContent = s.tests.size; b[1].textContent = s.hints; b[2].textContent = Math.min(round + 1, ch.rounds.length) + '/' + ch.rounds.length; };
    const hintsBox = h('div');
    const hintBtn = h('button.btn.sm', { type: 'button', onclick: () => { const r = Game.useHint(s); if (!r) return UI.toast('No more hints.', { kind: 'warn' }); hintsBox.append(h('div.hint-box', h('b', `Hint ${r.level}: `), r.text)); updStats(); if (r.level >= 3) hintBtn.disabled = true; } }, '💡 Hint');
    const brief = h('div.panel.brief', { style: { '--accent': w.color } }, h('button.btn.sm', { type: 'button', onclick: () => UI.go('region', { id: ch.world }) }, '← ' + w.short), h('div.sub', { style: { marginTop: '.5rem' } }, `${w.short} · mission ${ch.order}`), UI.variantBar(ch), h('h2', ch.title), h('div.muted', ch.tagline), h('p.story', ch.story), h('div.formal', ch.formal),
      h('div.opt-goal', h('span', '★'), h('span', h('b', 'Optional objective  '), ch.optional.text)), h('div.row', { style: { margin: '.6rem 0' } }, hintBtn), hintsBox, stats);
    const renderRound = () => {
      const r = ch.rounds[round]; UI.clear(view); updStats();
      const log = h('div.probe-log', { style: { maxHeight: '170px' } });
      const pin = h('input.text.mono', { placeholder: 'test both gates…', maxlength: 30, 'aria-label': 'Probe both gates', onkeydown: (e) => { if (e.key === 'Enter') probe(); } });
      const din = h('input.text.mono', { placeholder: 'distinguishing string', maxlength: 30, 'aria-label': 'Distinguishing string', onkeydown: (e) => { if (e.key === 'Enter') dist(); } });
      const msg = h('div.status');
      const sym = (x) => ([...x].find((c) => !r.alphabet.includes(c)) ? null : x);
      const probe = () => {
        const x = pin.value.replace(/\s/g, ''); if (sym(x) === null) return UI.toast(`Use only {${r.alphabet.join(', ')}}.`, { kind: 'warn' });
        Game.noteTest(s, round + ':' + x); updStats(); UI.sfx.click();
        const a = FA.accepts(r.a, x), b = FA.accepts(r.b, x);
        log.prepend(h('div', h('b', x === '' ? 'ε' : x), '   ', r.nameA, ' ', UI.verdict(a), '   ', r.nameB, ' ', UI.verdict(b), a !== b ? h('b.accent', '  ← they differ!') : '')); pin.value = '';
      };
      const advance = () => { round++; if (round >= ch.rounds.length) return finish(); renderRound(); };
      const dist = () => {
        const x = din.value.replace(/\s/g, ''); Game.noteTest(s, round + ':' + x); const v = G.verifyTwin(ch, round, { w: x });
        msg.className = 'status ' + (v.ok ? 'accept' : 'reject'); msg.textContent = v.msg;
        if (!v.ok) { UI.sfx.bad(); Game.failSpecial(s, x); return; }
        UI.sfx.ok(); if (!v.isShortest) shortestAll = false;
        Game.recordDistinguished().forEach((a) => UI.toast('Achievement unlocked: ' + a.name, { kind: 'gold', icon: a.icon }));
        msg.append(h('div', v.isShortest ? '★ and it is the SHORTEST possible distinguishing string!' : 'A shorter distinguishing string exists — can you find it next time?'), h('button.btn.sm.primary', { type: 'button', style: { marginTop: '.4rem' }, onclick: advance }, round + 1 < ch.rounds.length ? 'Next pair →' : 'Finish →'));
      };
      const claimEq = () => {
        const v = G.verifyTwin(ch, round, { equivalent: true });
        msg.className = 'status ' + (v.ok ? 'accept' : 'reject'); msg.textContent = v.msg;
        if (!v.ok) { UI.sfx.bad(); Game.failSpecial(s, v.shortest); return; }
        UI.sfx.ok(); msg.append(h('div', h('button.btn.sm.primary', { type: 'button', style: { marginTop: '.4rem' }, onclick: advance }, round + 1 < ch.rounds.length ? 'Next pair →' : 'Finish →')));
      };
      view.append(h('div.row', h('h3', { style: { color: '#fff' } }, r.label + ' — ' + r.nameA + ' vs ' + r.nameB)),
        h('div.grid', { style: { gridTemplateColumns: '1fr 1fr', gap: '.8rem' } }, h('div.panel', h('div.sub', r.nameA), UI.mini(r.a, 'tall')), h('div.panel', h('div.sub', r.nameB), UI.mini(r.b, 'tall'))),
        h('div.panel', h('h3', 'Probe both gates'), h('div.probe', pin, h('button.btn.sm.primary', { type: 'button', onclick: probe }, 'Probe')), log),
        h('div.panel', h('h3', 'Your verdict'), h('div.probe', din, h('button.btn.sm.primary', { type: 'button', onclick: dist }, 'Submit distinguishing string')), h('div.row', { style: { margin: '.6rem 0' } }, h('span.muted', 'or, if you believe they are identical:'), h('button.btn.sm', { type: 'button', onclick: claimEq }, '＝ Declare equivalent')), msg));
    };
    const finish = () => {
      const res = Game.completeSpecial(s, { shortestBoth: shortestAll });
      UI.go('results', { id: ch.id, res, verification: { stages: [{ id: 'f', name: 'Equivalence Engine', status: 'pass', detail: 'All three pairs classified correctly using product-automaton equivalence.' }], warnings: [] } });
    };
    root.append(h('div.screen', h('div.mission', { style: { gridTemplateColumns: 'minmax(290px,350px) minmax(0,1fr)' } }, brief, view)));
    renderRound();
  }

  /* ===================================================================== */
  /*                     Void Zone (halting problem)                         */
  /* ===================================================================== */
  function voidScreen(root, ch) {
    const w = worldOf(ch), s = Game.startSession(ch);
    const stats = h('div.mstats', h('div.stat', h('small', ch.id === 'V1' ? 'runs' : 'tries'), h('b', '0')), h('div.stat', h('small', 'hints'), h('b', '0')), h('div.stat', h('small', 'time'), h('b', '0:00')));
    const updStats = () => { const b = stats.querySelectorAll('b'); b[0].textContent = ch.id === 'V1' ? s.tests.size : s.attempts; b[1].textContent = s.hints; };
    const tk = setInterval(() => (stats.querySelectorAll('b')[2].textContent = fmtTime(Game.elapsed(s))), 1000); UI.onCleanup(() => clearInterval(tk));
    const hintsBox = h('div');
    const hintBtn = h('button.btn.sm', { type: 'button', onclick: () => { const r = Game.useHint(s); if (!r) return UI.toast('No more hints.', { kind: 'warn' }); hintsBox.append(h('div.hint-box', h('b', `Hint ${r.level}: `), r.text)); updStats(); if (r.level >= 3) hintBtn.disabled = true; } }, '💡 Hint');
    const brief = h('div.panel.brief', { style: { '--accent': w.color } }, h('button.btn.sm', { type: 'button', onclick: () => UI.go('region', { id: ch.world }) }, '← ' + w.short), h('div.sub', { style: { marginTop: '.5rem' } }, `${w.short} · mission ${ch.order}`), UI.variantBar(ch), h('h2', ch.title), h('div.muted', ch.tagline), h('p.story', ch.story), h('div.formal', ch.formal), h('div.sub', 'Objective'), h('p', ch.objective),
      h('div.opt-goal', h('span', '★'), h('span', h('b', 'Optional objective  '), ch.optional.text)), h('div.row', { style: { margin: '.6rem 0' } }, hintBtn), hintsBox, stats);
    const main = h('div.col');
    const submitBtn = h('button.btn.primary.big', { type: 'button' }, '⚡ Submit answers');
    const report = h('div');
    const finishOk = (extra) => { const out = Game.submit(s, extra.answers); return out; };
    if (ch.id === 'V1') {
      const verdicts = {}; const seenMax = {};
      const labels = { halts: 'PROVEN to halt', loops: 'PROVEN to loop forever', unknown: 'NOTHING proven yet' };
      main.append(h('div.status', 'Press a step limit to run the machine for that many steps. “Loop” is reported only when a configuration repeats exactly.'));
      G.VOID_MACHINES.forEach((vm) => {
        const out = h('div.run-out', 'not run yet'), segs = h('div.seg'), limits = h('div.limits');
        G.VOID_LIMITS.forEach((lim) => limits.append(h('button.chip', { type: 'button', onclick: () => {
          Game.noteTest(s, vm.id + '@' + lim); updStats(); UI.sfx.step();
          const r = Game.voidRun(vm.id, lim); seenMax[vm.id] = Math.max(seenMax[vm.id] || 0, lim);
          out.className = 'run-out ' + (r.status === 'limit' ? 'limit' : r.status === 'loop' ? 'loop' : 'halt');
          out.textContent = r.status === 'limit' ? `⏳ still running after ${UI.fmt(lim)} steps — no conclusion` : r.status === 'loop' ? `♻ exact configuration repeated after ${UI.fmt(r.steps)} steps — can NEVER halt` : `■ halted after ${UI.fmt(r.steps)} steps (${r.status === 'accepted' ? 'in a final state' : 'no applicable move'})`;
        } }, UI.fmt(lim))));
        ['halts', 'loops', 'unknown'].forEach((k) => segs.append(h('button', { type: 'button', dataset: { k }, onclick: (e) => { verdicts[vm.id] = k; UI.$$('button', segs).forEach((b) => b.classList.toggle('on', b === e.currentTarget)); UI.sfx.click(); } }, labels[k])));
        main.append(h('div.panel.vm-card', h('div.col', h('b', { style: { color: '#fff' } }, `Machine ${vm.id} — ${vm.name}`), h('div.muted', vm.blurb), h('div.sub', 'Run for up to … steps'), limits, out, h('div.sub', 'What do your observations prove?'), segs)));
      });
      submitBtn.onclick = () => {
        if (Object.keys(verdicts).length < G.VOID_MACHINES.length) return UI.toast('Give a verdict for every machine.', { kind: 'warn' });
        const out = Game.submit(s, { verdicts }); updStats();
        if (!out.verification.ok) { UI.sfx.bad(); UI.clear(report); report.append(h('div.status.reject', `${out.verification.correct} / ${out.verification.total} correct. Remember: a machine still running after N steps proves NOTHING about step N+1.`)); UI.$$('.vm-card').forEach((c, i) => c.classList.toggle('bad', out.verification.wrong.includes(G.VOID_MACHINES[i].id))); return; }
        UI.go('results', { id: ch.id, res: out.result, verification: { stages: [{ id: 'v', name: 'Void classification', status: 'pass', detail: 'All five verdicts correct.' }, ...G.VOID_MACHINES.map((m) => ({ id: m.id, name: m.name, status: 'skip', detail: m.reveal }))], warnings: [] } });
      };
    } else {
      const proof = {}, classify = {};
      main.append(h('div.panel', h('h3', 'Turing’s diagonal argument'), h('p.muted', 'Assume a perfect halting-decider H exists. Build D(M): “run H(M,M); if it says halts, loop forever; otherwise halt.” Now feed D to itself.'),
        G.VOID_PROOF.map((q) => { const el = h('div.col', { dataset: { qid: q.id }, style: { margin: '.6rem 0' } }, h('b', q.q), q.options.map((o, i) => h('button.quiz-opt', { type: 'button', onclick: (e) => { proof[q.id] = i; UI.$$('.quiz-opt', el).forEach((b) => b.classList.remove('sel')); e.currentTarget.classList.add('sel'); UI.sfx.click(); } }, o))); return el; })));
      main.append(h('div.panel', h('h3', 'Sort the problems'), h('p.muted', 'Is each problem decidable (some algorithm always answers) or undecidable?'),
        G.VOID_CLASSIFY.map((q) => { const seg = h('div.seg', { dataset: { qid: q.id } }); ['decidable', 'undecidable'].forEach((k) => seg.append(h('button', { type: 'button', onclick: (e) => { classify[q.id] = k; UI.$$('button', seg).forEach((b) => b.classList.toggle('on', b === e.currentTarget)); UI.sfx.click(); } }, k))); return h('div.row', { style: { margin: '.4rem 0', justifyContent: 'space-between' } }, h('span', q.text), seg); })));
      submitBtn.onclick = () => {
        if (Object.keys(proof).length < G.VOID_PROOF.length || Object.keys(classify).length < G.VOID_CLASSIFY.length) return UI.toast('Answer every question first.', { kind: 'warn' });
        const out = Game.submit(s, { proof, classify }); updStats();
        if (!out.verification.ok) {
          UI.sfx.bad(); UI.clear(report);
          report.append(h('div.status.reject', `${out.verification.correct} / ${out.verification.total} correct — read the explanations and fix your answers.`), ...out.verification.wrong.map((id) => { const q = G.VOID_PROOF.find((x) => x.id === id) || G.VOID_CLASSIFY.find((x) => x.id === id); return h('div.hint-box', h('b', (q.q || q.text) + ' '), q.why); }));
          return;
        }
        UI.go('results', { id: ch.id, res: out.result, verification: { stages: [{ id: 'p', name: 'Diagonal proof & classification', status: 'pass', detail: 'All answers correct.' }, ...G.VOID_PROOF.map((q) => ({ id: q.id, name: q.q, status: 'skip', detail: q.why }))], warnings: [] } });
      };
    }
    main.append(report, h('div.row', submitBtn));
    root.append(h('div.screen', h('div.mission', { style: { gridTemplateColumns: 'minmax(290px,350px) minmax(0,1fr)' } }, brief, main)));
  }

  /* ===================================================================== */
  /*                            results screen                              */
  /* ===================================================================== */
  UI.confetti = function (n = 70) {
    if (UI.reduceMotion()) return;
    const box = h('div.confetti', { 'aria-hidden': 'true' });
    const cols = ['#22d3ee', '#c084fc', '#fbbf24', '#4ade80', '#fb7185'];
    for (let i = 0; i < n; i++) box.append(h('i', { style: { left: Math.random() * 100 + '%', background: cols[i % cols.length], animationDelay: Math.random() * 0.8 + 's', animationDuration: 2 + Math.random() * 2 + 's', transform: `rotate(${Math.random() * 360}deg)` } }));
    document.body.appendChild(box); setTimeout(() => box.remove(), 4800);
  };
  UI.screens.results = function (root, { id, res, verification }) {
    const ch = G.challengeById(id), w = worldOf(ch);
    if (!res) return UI.go('region', { id: ch.world });
    document.body.dataset.world = ch.world;
    const sc = res.score;
    const num = h('div.res-score', '0');
    const best = res.improved || res.first ? 'NEW BEST' : `best ${UI.fmt(res.best)}`;
    const rows = sc.parts.map((p) => h('div.brk', h('span', p.label), UI.bar(p.got, p.pts, p.got === p.pts ? 'good' : ''), h('b.mono', `${p.got}/${p.pts}`), h('small', p.id === 'efficiency' && ch.sizeLabel ? `${res.ctx.size} ${ch.sizeLabel} used · target ${ch.optimal}` : p.id === 'query' ? `${res.ctx.tests} test strings / probes` : p.id === 'hints' ? `${res.ctx.hints} hint${res.ctx.hints === 1 ? '' : 's'} used` : p.id === 'speed' ? `${fmtTime(res.ctx.time)} (par ${fmtTime(ch.par)})` : p.id === 'optional' ? (res.ctx.optionalMet ? 'completed ✔ — ' + ch.optional.text : 'not completed — ' + ch.optional.text) : p.why)));
    const lv = Game.level();
    const unlocked = [...res.unlocked.worlds.map((x) => '🌍 New region unlocked: ' + G.worldById(x).name), ...res.unlocked.challenges.map((x) => '🔓 Mission unlocked: ' + G.challengeById(x).title)];
    const list = G.challengesOf(ch.world), next = !ch.contract && list[list.indexOf(ch) + 1];
    const acts = h('div.row', { style: { justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' } },
      next && Game.challengeUnlocked(next) ? h('button.btn.primary', { type: 'button', onclick: () => UI.go('mission', { id: next.id }) }, 'Next mission → ' + next.title) : null,
      res.machine && ch.object ? h('button.btn', { type: 'button', onclick: () => UI.deployFlow(res.machine, ch.object, () => UI.go('region', { id: ch.world })) }, '🚀 Deploy to ' + G.objectById(ch.object).name) : null,
      res.machine ? h('button.btn', { type: 'button', onclick: () => UI.go('archive', { select: res.machine.id }) }, '🗄 Open in Archive') : null,
      h('button.btn', { type: 'button', onclick: () => UI.go('mission', { id }) }, '↺ Replay'), h('button.btn', { type: 'button', onclick: () => UI.go('region', { id: ch.world }) }, w.short));
    root.append(h('div.screen', h('div.results', { style: { '--accent': w.color } },
      h('div.panel.res-hero', h('div.sub', ch.contract ? 'CONTRACT FULFILLED' : 'MISSION COMPLETE'), h('h2', ch.title), num, h('div.row', { style: { justifyContent: 'center' } }, h('span.badge.ok', best), h('span.muted', `of ${sc.max} points`), h('span.badge.type', { style: { '--c': '#fbbf24' } }, `+${res.xpGain} XP`)),
        res.levelUp ? h('div.status.accept', { style: { marginTop: '.6rem' } }, `⬆ LEVEL UP! You are now level ${res.levelUp} — ${lv.rank}`) : null),
      h('div.panel', h('h3', 'Score breakdown'), rows, h('div.row', { style: { marginTop: '.6rem' } }, h('span.muted', 'Correctness gates everything: a wrong machine scores 0 no matter how fast it was.'))),
      res.achievements.length ? h('div.col', res.achievements.map((a) => h('div.achv-pop', { style: { '--c': a.color } }, h('span.ic', a.icon), h('div', h('b', 'Achievement unlocked: ' + a.name), h('div.muted', a.desc))))) : null,
      unlocked.length ? h('div.panel', unlocked.map((u) => h('div', { style: { padding: '.2rem 0' } }, u))) : null,
      res.deployed && res.deployed.ok ? h('div.panel', h('h3', '🛠 Patched machine auto-deployed'), UI.showCompliance(res.deployed.compliance, G.objectById(ch.object))) : null,
      ch.levelFile ? h('div.panel', h('h3', '📂 Reference machine — JFLAP file'), h('div.row', h('span.mono', 'jflap/levels/' + ch.levelFile), h('span.muted', 'The game verified your answer against this JFLAP file.'), h('span.sp'),
        h('button.btn.sm', { type: 'button', onclick: () => UI.download(ch.levelFile, G.JFF[ch.levelFile.replace(/\.jff$/, '')], 'application/xml') }, '⬇ .jff'),
        h('button.btn.sm', { type: 'button', onclick: () => UI.openInJflap(G.loadLevelFile(ch.levelFile.replace(/\.jff$/, '')), ch.levelFile) }, '☕ Open in JFLAP'))) : null,
      verification ? h('div.panel', h('h3', ch.kind === 'void' || ch.kind === 'twin' ? 'What you proved' : 'Formal verification report'), UI.verificationView(verification, ch.kind === 'build' || ch.kind === 'ambig' ? ch : null)) : null,
      res.machine ? h('div.panel', h('div.row', h('span', '🗄'), h('b', res.machine.name), UI.typeBadge(res.machine.type), h('span.badge.ok', '✔ verified'), h('span.muted', 'saved to your Machine Archive')), h('div', { style: { height: '170px', marginTop: '.5rem' } }, UI.mini(res.machine.structure))) : null,
      acts)));
    UI.animateNumber(num, sc.total, 1100);
    if (res.first || res.improved) { UI.sfx.win(); UI.confetti(); }
    if (res.achievements.length) setTimeout(() => UI.sfx.unlock(), 700);
    if (res.levelUp) setTimeout(() => UI.sfx.unlock(), 1100);
  };
})();
