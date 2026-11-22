/* ============================================================================
 * UI LAYER · screens: Title, Central Hub (world map), Region, Machine Archive,
 * Achievements, Profile, Lab (sandbox + JFLAP bridge) and the world-object stages.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, F = AM.F, G = AM.G;
  const h = UI.h, S = UI.svg, Game = G.Game, FA = F.FA, CFG = F.CFG;
  UI.screens = UI.screens || {};
  const st = () => G.Store.state;

  /* ---------- shared bits ---------- */
  UI.pickMachine = function (types, title, cb) {
    const mine = st().machines.filter((m) => types.includes(m.type));
    const samples = [];
    const body = h('div.col');
    const add = (label, struct, sub) => body.append(h('button.mission-row', { type: 'button', onclick: () => { m.close(); cb(F.clone(struct), label); } }, h('span.dot', { style: { '--c': G.TYPE_COLOR[struct.type] } }, '⚙'), h('span', h('b', label), h('small', sub))));
    if (mine.length) { body.append(h('div.sub', 'From your Machine Archive')); mine.forEach((r) => add(r.name, r.structure, G.TYPE_LABEL[r.type] + (r.verified ? ' · verified' : ' · draft'))); }
    if (types.includes('DFA')) { body.append(h('div.sub', 'Sample machines')); add('Bloated reactor DFA (6 states)', G.REF.bloated, 'DFA · minimisable'); add('Even number of 1s', G.REF.evenOnes, 'DFA'); }
    if (types.includes('NFA')) { body.append(h('div.sub', 'Sample machines')); add('Third symbol from the end is 1', G.REF.thirdFromEnd, 'NFA · 4 states → 8 DFA states'); add('Contains “ab” or ends in “bb”', G.REF.subsetGiven, 'NFA'); add('Ends with “ab”', G.REF.endsAB, 'NFA'); }
    void samples;
    const m = UI.modal({ title, body, buttons: [{ label: 'Cancel' }] });
  };
  const levelRing = (lv, size = 150) => {
    const r = 62, c = 2 * Math.PI * r;
    return h('div.levelring', { style: { width: size + 'px', height: size + 'px' } },
      S('svg', { viewBox: '0 0 150 150', width: size, height: size }, S('circle', { class: 'ring-bg', cx: 75, cy: 75, r, fill: 'none', 'stroke-width': 10 }), S('circle', { class: 'ring-fg', cx: 75, cy: 75, r, fill: 'none', 'stroke-width': 10, 'stroke-dasharray': `${c * lv.pct} ${c}`, 'stroke-linecap': 'round', transform: 'rotate(-90 75 75)' })),
      h('div.lv', h('small', 'LEVEL'), h('b', lv.level)));
  };
  UI.levelRing = levelRing;

  /* ===================================================================== */
  /*                                 TITLE                                   */
  /* ===================================================================== */
  UI.screens.title = function (root) {
    document.body.dataset.world = 'hub';
    const has = G.Store.hasSave() && (st().attempts.length || st().machines.length || Object.keys(st().progress).length);
    const orbit = S('svg', { class: 'title-orbit', viewBox: '0 0 320 320', 'aria-hidden': 'true' },
      S('defs', null, S('radialGradient', { id: 'tcore' }, S('stop', { offset: 0, 'stop-color': '#fff' }), S('stop', { offset: 1, 'stop-color': '#a78bfa' }))),
      ...[130, 95, 60].map((r, i) => S('circle', { cx: 160, cy: 160, r, fill: 'none', stroke: ['#22d3ee', '#c084fc', '#fbbf24'][i], 'stroke-opacity': 0.55, 'stroke-width': 2, 'stroke-dasharray': '4 10' }, S('animateTransform', { attributeName: 'transform', type: 'rotate', from: `0 160 160`, to: `${i % 2 ? -360 : 360} 160 160`, dur: 24 - i * 6 + 's', repeatCount: 'indefinite' }))),
      S('circle', { cx: 160, cy: 160, r: 22, fill: 'url(#tcore)' }),
      ...G.WORLDS.map((w, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return S('g', { transform: `translate(${160 + Math.cos(a) * 130} ${160 + Math.sin(a) * 130}) scale(.5)` }, S('circle', { r: 30, fill: '#0a102e', stroke: w.color, 'stroke-width': 3 }), UI.worldGlyph(w.id, w.color)); }));
    const nameIn = h('input.text', { value: st().player.name === 'Operator' ? '' : st().player.name, placeholder: 'Operator name (optional)', maxlength: 20, 'aria-label': 'Operator name', style: { maxWidth: '260px', textAlign: 'center' } });
    const enter = () => { if (nameIn.value.trim()) { st().player.name = nameIn.value.trim(); G.Store.save(); } UI.sfx.unlock(); UI.go('hub'); };
    const features = ['DFA', 'NFA · ε-NFA', 'Grammars & parse trees', 'Pushdown stacks', 'Turing tapes', 'Halting problem', 'Machine Archive', 'JFLAP bridge'];
    root.append(h('div.title-screen', h('div.title-card',
      orbit, h('div.sub', 'A GAME-BASED LAB FOR FORMAL LANGUAGES & AUTOMATA THEORY'), h('h1', 'AUTOMATA METAVERSE'),
      h('p.lead', 'A world built from computation. Gates are DFAs, mazes are NFAs, forests are grammars, factories run stacks. Build machines, verify them with real automata algorithms, archive them — and deploy them into the world.'),
      h('div.col', { style: { alignItems: 'center' } }, nameIn,
        h('div.row', { style: { justifyContent: 'center' } },
          h('button.btn.primary.big-btn', { type: 'button', onclick: enter }, has ? 'CONTINUE' : 'ENTER THE METAVERSE'),
          has ? h('button.btn', { type: 'button', onclick: async () => { if (await UI.confirm('Start over? Your current progress, machines and achievements will be erased.', { ok: 'Erase & restart', danger: true })) { G.Store.reset(nameIn.value.trim() || 'Operator'); UI.go('title'); } } }, 'New game') : null,
          h('button.btn', { type: 'button', onclick: () => howTo() }, '? How to play')),
        h('label.row.dim', { style: { fontSize: '.8rem', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: st().settings.demo, onchange: (e) => { st().settings.demo = e.target.checked; G.Store.save(); UI.toast(e.target.checked ? 'Demo mode: every region and mission is unlocked.' : 'Demo mode off.', { icon: '🎬' }); } }), 'Evaluator / demo mode — unlock everything')),
      h('div.title-features', features.map((f) => h('span.chip', f))),
      G.Variants ? h('div.dim', { style: { fontSize: '.78rem', marginTop: '.8rem' } }, G.Variants.classic ? '🎲 Classic challenges (same every visit) — change this in Profile' : `🎲 A fresh set of challenges was rolled for this visit · session #${G.Variants.seed}`) : null)));
  };
  function howTo() {
    UI.modal({ title: 'How to play', wide: true, buttons: [{ label: 'Got it', primary: true }], body: h('div.col',
      [['🌐', 'Explore', 'The Central Hub connects six regions. Finish two missions in a region to open the next one.'],
        ['🛠', 'Build', 'Double-click the canvas to add states, drag from state to state to connect them. Grammars are typed as rules. Press ✓ Test String or ▶ Run to watch your machine compute.'],
        ['⚡', 'Verify', 'The Verification Engine proves your machine correct (exactly for finite automata, up to a length bound for grammars, stacks and tapes) — and hands you a counterexample if not.'],
        ['🗄', 'Archive & Deploy', 'Verified machines go to your Machine Archive. Deploy them into world objects (gates, vending controllers, tape processors) and keep them compliant when policies change.'],
        ['🏆', 'Score', 'Each mission is worth up to 1000 base points: correctness (500), efficiency, probing, no hints, speed and an optional objective. A wrong machine scores nothing.']]
        .map(([i, t, d]) => h('div.lesson-step', h('b', i + '  ' + t), h('div.muted', d)))) });
  }
  UI.howTo = howTo;

  /* ===================================================================== */
  /*                              CENTRAL HUB                                */
  /* ===================================================================== */
  UI.screens.hub = function (root) {
    document.body.dataset.world = 'hub';
    const sum = Game.summary(), lv = sum.level;
    const W = 900, H = 620, cx = W / 2, cy = H / 2 - 5;
    const map = S('svg', { class: 'hub-map', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'World map' });
    map.appendChild(S('defs', null, S('radialGradient', { id: 'coreGrad' }, S('stop', { offset: 0, 'stop-color': '#ede9fe' }), S('stop', { offset: 1, 'stop-color': '#4c1d95' }))));
    const pos = G.WORLDS.map((w, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return { w, x: cx + Math.cos(a) * 285, y: cy + Math.sin(a) * 215 }; });
    for (const p of pos) { const ws = sum.worlds.find((x) => x.id === p.w.id); map.appendChild(S('line', { class: 'hub-link', x1: cx, y1: cy, x2: p.x, y2: p.y, stroke: ws.unlocked ? p.w.color : '#3b4672', style: { animationDuration: ws.unlocked ? '1.4s' : '0s' } })); }
    // progression chain
    for (let i = 0; i < pos.length - 1; i++) map.appendChild(S('line', { x1: pos[i].x, y1: pos[i].y, x2: pos[i + 1].x, y2: pos[i + 1].y, stroke: 'rgba(160,175,255,.16)', 'stroke-width': 1.5 }));
    map.appendChild(S('circle', { class: 'hub-core', cx, cy, r: 54 }));
    map.appendChild(S('g', { transform: `translate(${cx} ${cy}) scale(1.3)` }, UI.worldGlyph('hub', '#fbbf24')));
    map.appendChild(S('text', { x: cx, y: cy + 82, 'text-anchor': 'middle', class: 'nm', fill: '#fff', style: { fontSize: '13px', fill: '#c4b5fd' } }, 'CENTRAL HUB'));
    const hex = (r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }).join(' ');
    for (const p of pos) {
      const w = p.w, ws = sum.worlds.find((x) => x.id === w.id), locked = !ws.unlocked;
      const go = () => { if (locked) { UI.sfx.bad(); return UI.toast(`Locked — complete ${w.unlock.count} missions in ${G.worldById(w.unlock.world).name} first.`, { kind: 'warn', icon: '🔒' }); } UI.sfx.click(); UI.go('region', { id: w.id }); };
      const circ = 2 * Math.PI * 62;
      const g = S('g', { class: 'region-node' + (locked ? ' locked' : ''), transform: `translate(${p.x} ${p.y})`, style: { '--c': w.color }, tabindex: 0, role: 'button', 'aria-label': `${w.name}${locked ? ' (locked)' : ''}: ${ws.done} of ${ws.count} missions complete`, onclick: go, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } },
        S('polygon', { class: 'hexbody', points: hex(66) }),
        S('circle', { r: 62, fill: 'none', stroke: 'rgba(255,255,255,.1)', 'stroke-width': 4 }),
        S('circle', { r: 62, fill: 'none', stroke: w.color, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': `${circ * (ws.done / ws.count || 0)} ${circ}`, transform: 'rotate(-90)' }),
        S('g', { transform: 'translate(0 -10) scale(.85)' }, UI.worldGlyph(w.id, w.color)),
        S('text', { class: 'nm', y: 38, 'text-anchor': 'middle' }, w.short.toUpperCase()),
        S('text', { class: 'cp', y: 54, 'text-anchor': 'middle' }, locked ? '🔒 ' + w.unlock.count + ' in ' + G.worldById(w.unlock.world).short : `${ws.done}/${ws.count} missions`),
        S('text', { class: 'cp', y: 68, 'text-anchor': 'middle', style: { fill: w.color, fontWeight: 700 } }, ({ regular: 'DFA', nfa: 'NFA · ε-NFA', cfg: 'CFG', pda: 'PDA', tm: 'TURING MACHINE', void: 'HALTING PROBLEM' })[w.id]));
      map.appendChild(g);
    }
    // next recommended mission
    let next = null;
    outer: for (const w of G.WORLDS) { if (!Game.worldUnlocked(w)) continue; for (const c of G.challengesOf(w.id)) if (!Game.progress(c.id).completed && Game.challengeUnlocked(c)) { next = c; break outer; } }
    const side = h('div.side-col',
      h('div.panel', h('div.row', levelRing(lv, 110), h('div.col', { style: { gap: '.2rem' } }, h('b', { style: { fontSize: '1.05rem', color: '#fff' } }, st().player.name), h('span.accent', lv.rank), h('span.dim', { style: { fontSize: '.78rem' } }, `${UI.fmt(sum.xp)} XP · ${UI.fmt(lv.hi - sum.xp)} to next level`))),
        h('div.hero-stats', { style: { marginTop: '.8rem' } },
          h('div.stat', h('small', 'Overall score'), h('b', UI.fmt(sum.overall))), h('div.stat', h('small', 'of'), h('b', UI.fmt(sum.overallMax))),
          h('div.stat', h('small', 'Missions'), h('b', `${sum.completed}/${sum.totalChallenges}`)), h('div.stat', h('small', 'Achievements'), h('b', `${sum.achievements}/${sum.achievementsTotal}`)),
          h('div.stat', h('small', 'Machines'), h('b', `${sum.verified}/${sum.machines}`)), h('div.stat', h('small', 'Deployed'), h('b', `${sum.deployed}/${sum.objects}`)))),
      next ? h('div.panel', h('div.sub', 'Continue your journey'), h('button.mission-row', { type: 'button', style: { '--c': G.worldById(next.world).color }, onclick: () => UI.go('mission', { id: next.id }) }, h('span.dot', '▶'), h('span', h('b', next.title), h('small', G.worldById(next.world).short + ' · ' + next.tagline)))) : h('div.panel', h('b', '🎉 Every mission complete!'), h('p.muted', 'Re-run missions for better scores, patch deployed machines with contracts, or experiment in the Lab.')),
      h('div.panel', h('div.sub', 'Region progress'), sum.worlds.map((ws) => { const w = G.worldById(ws.id); return h('div.world-prog', { style: { '--c': w.color } }, h('i.sw'), h('span', w.short), h('b.mono', `${UI.fmt(ws.score)}/${UI.fmt(ws.max)}`)); })),
      h('div.panel', h('div.sub', 'Quick access'), h('div.col',
        h('button.mission-row', { type: 'button', onclick: () => UI.go('archive') }, h('span.dot', { style: { '--c': '#a78bfa' } }, '🗄'), h('span', h('b', 'Machine Archive'), h('small', `${sum.machines} machine${sum.machines === 1 ? '' : 's'} saved · verify, compare, combine, deploy`))),
        h('button.mission-row', { type: 'button', onclick: () => UI.go('lab') }, h('span.dot', { style: { '--c': '#22d3ee' } }, '🧪'), h('span', h('b', 'Sandbox Lab'), h('small', 'Free-build any machine · JFLAP import/export'))),
        h('button.mission-row', { type: 'button', onclick: () => UI.go('achievements') }, h('span.dot', { style: { '--c': '#fbbf24' } }, '🏆'), h('span', h('b', 'Achievements'), h('small', `${sum.achievements} of ${sum.achievementsTotal} unlocked`))))));
    root.append(h('div.screen', h('div.hub-layout', h('div.panel.map-wrap', map), side)));
  };

  /* ===================================================================== */
  /*                        world-object stage (deployment)                  */
  /* ===================================================================== */
  function objectCard(obj, refresh) {
    const w = G.worldById(obj.world), os = G.Store.objectState(obj.id), rec = Game.deployedMachine(obj.id), contract = Game.contractFor(obj.id);
    const icon = UI.objectIcon(obj.id, w.color);
    const conv = h('div.conveyor', h('div.scan')), meter = h('div.meter'), shiftOut = h('div.dim', { style: { fontSize: '.78rem' } }, rec ? 'Run a shift to watch visitors reach the object.' : 'Nothing deployed yet.');
    const card = h('div.panel.obj-card', { style: { '--accent': w.color } },
      h('div.obj-top', icon, h('div.col', { style: { gap: '.1rem', flex: 1 } }, h('b', { style: { color: '#fff' } }, obj.name), h('span.dim', { style: { fontSize: '.76rem' } }, 'runs: ' + obj.accepts.map((t) => G.TYPE_LABEL[t]).join(' / ')), h('span.policy-v', 'policy v' + os.policyVersion))),
      h('p.muted', { style: { fontSize: '.84rem', margin: 0 } }, obj.blurb));
    if (rec) {
      const rep = G.compliance(obj.id, rec.structure, os.policyVersion);
      card.append(h('div.dim.mono', { style: { fontSize: '.74rem' } }, 'policy: ' + G.policyFor(obj.id, os.policyVersion).challenge.formal));
      meter.append(h('span', 'machine: ', h('b', rec.name)), h('span', 'compliance: ', h('b', { class: rep.pct === 100 ? 'good' : 'bad' }, rep.pct + '%')));
      card.append(meter, conv, shiftOut);
      const run = async (btn) => {
        btn.disabled = true; UI.clear(conv); conv.append(h('div.scan'));
        const vis = G.visitorsFor(obj.id, os.policyVersion, 10); let good = 0;
        for (const x of vis) {
          const tok = h('div.tok', { style: { animationDuration: UI.reduceMotion() ? '0.01s' : '1.2s' } }, x === '' ? 'ε' : x); conv.append(tok);
          await UI.sleep(UI.reduceMotion() ? 10 : 520);
          if (!card.isConnected) return;
          let admit, txt;
          if (obj.kind === 'transformer') { const r = F.TM.run(rec.structure, x, { traceLimit: 0, maxSteps: 3000 }); admit = r.status === 'accepted'; txt = admit ? `“${x}” → “${F.TM.trimTape(r.output) || '□'}”` : `“${x}” → fault`; }
          else { admit = G.runMachine(rec.structure, x); txt = `“${x || 'ε'}” → ${admit ? obj.admit : obj.deny}`; }
          const pol = G.policyFor(obj.id, os.policyVersion); const expected = pol.kind === 'transform' ? pol.fn(x) : pol.fn(x);
          const right = obj.kind === 'transformer' ? (admit && F.TM.trimTape(F.TM.run(rec.structure, x, { traceLimit: 0, maxSteps: 3000 }).output) === expected) : admit === expected;
          if (right) good++;
          tok.classList.add(admit ? 'ok' : 'no'); card.classList.remove('admit', 'deny'); void card.offsetWidth; card.classList.add(admit ? 'admit' : 'deny'); admit ? UI.sfx.ok() : UI.sfx.bad();
          shiftOut.textContent = txt + (right ? '' : '   ⚠ violates policy');
          shiftOut.className = right ? 'good' : 'bad'; shiftOut.style.fontSize = '.82rem';
        }
        shiftOut.textContent = `Shift complete: ${good}/${vis.length} visitors handled according to policy.`; shiftOut.className = good === vis.length ? 'good' : 'bad';
        btn.disabled = false;
      };
      const runBtn = h('button.btn.sm.primary', { type: 'button', onclick: (e) => run(e.currentTarget) }, '▶ Run a shift');
      card.append(h('div.row', runBtn,
        h('button.btn.sm', { type: 'button', onclick: () => { UI.modal({ title: obj.name + ' — compliance report', wide: true, body: UI.showCompliance(rep, obj), buttons: [{ label: 'Close', primary: true }] }); } }, '📋 Report'),
        h('button.btn.sm', { type: 'button', onclick: () => UI.go('archive', { select: rec.id }) }, 'Open machine'),
        h('button.btn.sm', { type: 'button', onclick: () => { Game.undeploy(obj.id); refresh(); } }, 'Undeploy')));
    } else {
      const cands = st().machines.filter((m) => G.deployCompat(m, obj).ok);
      card.append(h('div.status', cands.length ? `${cands.length} verified machine${cands.length > 1 ? 's' : ''} can run here.` : 'No verified machine for this object yet — complete the missions of this region.'));
      if (cands.length) card.append(h('div.row', cands.slice(0, 3).map((m) => h('button.btn.sm', { type: 'button', onclick: () => UI.deployFlow(m, obj.id, refresh) }, '🚀 Deploy “' + m.name + '”'))));
    }
    if (contract) {
      const cs = Game.contractStatus(contract.id);
      card.append(h('div.opt-goal', h('span', '📜'), h('span', h('b', contract.title + '  '), cs === 'locked' ? 'Deploy a machine here to receive this maintenance contract.' : cs === 'done' ? '✔ fulfilled' : contract.tagline),
        cs === 'available' || cs === 'active' ? h('button.btn.sm.primary', { type: 'button', style: { marginLeft: 'auto' }, onclick: () => { Game.acceptContract(contract.id); UI.go('mission', { id: contract.id }); } }, cs === 'active' ? 'Continue' : 'Accept') : null));
    }
    return card;
  }

  /* ===================================================================== */
  /*                                 REGION                                  */
  /* ===================================================================== */
  UI.screens.region = function (root, { id }) {
    const w = G.worldById(id);
    if (!w || w.id === 'hub') return UI.go('hub');
    if (!Game.worldUnlocked(w)) { UI.toast('That region is still locked.', { kind: 'warn' }); return UI.go('hub'); }
    document.body.dataset.world = id;
    Game.markVisited(id).forEach((a) => UI.toast('Achievement unlocked: ' + a.name, { kind: 'gold', icon: a.icon }));
    const list = G.challengesOf(id), ws = { score: Game.worldScore(id), max: Game.worldMax(id) };
    const head = h('div.panel.region-head', { style: { '--accent': w.color } }, UI.regionScene(id), h('div.shade'),
      h('div.txt', h('div.row', h('button.btn.sm', { type: 'button', onclick: () => UI.go('hub') }, '← Hub'), h('span.badge', w.concept)), h('h2', w.name), h('p.muted', { style: { margin: '.2rem 0' } }, w.tagline), h('div.lesson', '💡 ' + w.lesson),
        h('div.row', { style: { marginTop: '.6rem' } }, h('b.mono', `${UI.fmt(ws.score)} / ${UI.fmt(ws.max)} pts`), h('div', { style: { width: '220px' } }, UI.bar(ws.score, ws.max)))));
    const cards = h('div.cards');
    list.forEach((c) => {
      const p = Game.progress(c.id), unlocked = Game.challengeUnlocked(c);
      const prev = list[list.indexOf(c) - 1];
      cards.append(h('button.mcard' + (unlocked ? '' : '.locked') + (p.completed ? '.done' : ''), { type: 'button', style: { '--accent': w.color }, 'aria-disabled': !unlocked, onclick: () => { if (!unlocked) { UI.sfx.bad(); return UI.toast(w.unlock && !Game.worldUnlocked(w) ? 'Region locked.' : `Finish “${prev ? prev.title : 'the previous mission'}” first.`, { kind: 'warn', icon: '🔒' }); } UI.sfx.click(); UI.go('mission', { id: c.id }); } },
        h('div.num', `MISSION ${c.order} · ${c.kind === 'twin' ? 'EQUIVALENCE' : c.kind === 'void' ? 'THEORY' : c.kind === 'ambig' ? 'ANALYSIS + BUILD' : 'BUILD'}`), h('h4', c.title), h('div.tag', c.tagline),
        h('div.row', c.concepts ? c.concepts.map((x) => h('span.chip', { style: { fontSize: '.68rem', padding: '.1rem .5rem' } }, x)) : null),
        h('div.foot', unlocked ? (p.completed ? h('span.badge.ok', '✔ ' + UI.fmt(p.best) + ' / ' + c.max) : h('span.badge.no', 'new')) : h('span.lockmsg', '🔒 ' + (prev ? 'after ' + prev.title : 'locked')), h('span.sp'), h('span.dim', p.attempts ? p.attempts + ' attempt' + (p.attempts === 1 ? '' : 's') : ''), UI.typeBadge(c.allowed[0] || (c.kind === 'twin' ? 'DFA' : 'TM')))));
    });
    const toolDefs = {
      regular: [['✂ Minimization Lens', 'Run Moore partition refinement on any DFA', () => UI.pickMachine(['DFA', 'NFA'], 'Choose a machine to minimize', (m) => UI.openMinimizeLens(m, FA.symbols(m)))]],
      nfa: [['⚗ Subset Lab', 'Watch an NFA become a DFA, row by row', () => UI.pickMachine(['NFA'], 'Choose an NFA', (m) => UI.openSubsetLab(m, FA.symbols(m)))], ['✂ Minimization Lens', 'Minimise the DFA you forged', () => UI.pickMachine(['DFA', 'NFA'], 'Choose a machine', (m) => UI.openMinimizeLens(m, FA.symbols(m)))]],
      cfg: [['🌳 Grammar Garden', 'Grow derivation trees by hand · Spot the Intruder', () => UI.openGarden()], ['🌲 CNF Lens', 'Convert any grammar to Chomsky Normal Form', () => { const t = h('textarea.text.mono', { rows: 5, placeholder: 'S -> aSb | ε', style: { width: '100%' } }); UI.modal({ title: 'CNF Lens — enter a grammar', body: t, buttons: [{ label: 'Cancel' }, { label: 'Convert', primary: true, onClick: () => { const r = CFG.parseText(t.value); if (r.errors.length) { UI.toast(r.errors[0], { kind: 'warn' }); return false; } setTimeout(() => UI.openCNFLens(r.grammar), 150); } }] }); }]],
      pda: [['🧠 Memory Check', 'Why no DFA can count — the pigeonhole argument', () => UI.openMemoryCheck()]],
      tm: [], void: [],
    }[id] || [];
    const objs = G.OBJECTS.filter((o) => o.world === id);
    const objWrap = h('div.obj-grid');
    const refresh = () => UI.go('region', { id });
    objs.forEach((o) => objWrap.append(objectCard(o, refresh)));
    const contracts = G.CHALLENGES.filter((c) => c.contract && c.world === id && !objs.some((o) => o.id === c.object));
    root.append(h('div.screen', { style: { '--accent': w.color } }, head,
      h('div.sect', h('h3.sect-t', 'Missions'), cards),
      toolDefs.length ? h('div.sect', h('h3.sect-t', 'Learning tools'), h('div.tools-row', toolDefs.map(([t, d, fn]) => h('button.panel.mission-row', { type: 'button', style: { maxWidth: '360px' }, onclick: fn }, h('span.dot', '🔧'), h('span', h('b', t), h('small', d)))))) : null,
      objs.length ? h('div.sect', h('h3.sect-t', 'World objects · deployment'), objWrap) : null, contracts.length ? null : null));
  };

  /* ===================================================================== */
  /*                            MACHINE ARCHIVE                              */
  /* ===================================================================== */
  UI.screens.archive = function (root, params = {}) {
    document.body.dataset.world = 'hub';
    let filter = 'all', q = '', selected = new Set(params.select ? [params.select] : []);
    const grid = h('div.cards'), tools = h('div.row');
    const render = () => {
      UI.clear(grid); UI.clear(tools);
      const all = st().machines.slice().reverse();
      const ms = all.filter((m) => (filter === 'all' || (filter === 'verified' ? m.verified : filter === 'draft' ? !m.verified : m.type === filter)) && (!q || m.name.toLowerCase().includes(q.toLowerCase())));
      const sel = [...selected].map((id) => G.Store.getMachine(id)).filter(Boolean);
      tools.append(h('span.muted', `${sel.length} selected`),
        h('button.btn.sm', { type: 'button', disabled: sel.length !== 2, title: 'Equivalence check with a shortest counterexample', onclick: () => compareDlg(sel[0], sel[1]) }, '⚖ Compare'),
        h('button.btn.sm', { type: 'button', disabled: sel.length !== 2, title: 'Product construction', onclick: () => combineDlg(sel[0], sel[1], render) }, '⊗ Combine'),
        h('button.btn.sm', { type: 'button', onclick: async () => { const f = await UI.pickFile('.jff,.xml'); if (!f) return; try { const m = F.JFLAP.importXML(f.text); const rec = Game.saveLabMachine(f.name.replace(/\.(jff|xml)$/i, ''), m); selected = new Set([rec.id]); UI.toast('Imported from JFLAP — saved as an unverified draft.', { kind: 'good', icon: '⬆' }); render(); } catch (e) { UI.toast('Import failed: ' + e.message, { kind: 'bad' }); } } }, '⬆ Import .jff'));
      if (!ms.length) { grid.append(h('div.panel.empty', { style: { gridColumn: '1/-1', textAlign: 'center', padding: '2.5rem' } }, h('div', { style: { fontSize: '2rem' } }, '🗄'), h('b', all.length ? 'Nothing matches this filter.' : 'Your archive is empty.'), h('p.muted', all.length ? '' : 'Complete a mission to archive your first verified machine, or import one from JFLAP.'))); return; }
      ms.forEach((m) => {
        const deployedIn = G.OBJECTS.filter((o) => { const s = G.Store.objectState(o.id); return s.deployed && s.deployed.machineId === m.id; });
        const card = h('div.panel.m-card' + (selected.has(m.id) ? '.sel' : ''), { style: { '--accent': G.TYPE_COLOR[m.type] } },
          h('div.row', h('input', { type: 'checkbox', checked: selected.has(m.id), 'aria-label': 'Select ' + m.name, onchange: (e) => { e.target.checked ? selected.add(m.id) : selected.delete(m.id); if (selected.size > 2) selected = new Set([...selected].slice(-2)); render(); } }), h('h4', m.name)),
          h('div', { style: { height: '120px' } }, UI.mini(m.structure)),
          h('div.meta', UI.typeBadge(m.type), m.verified ? h('span.badge.ok', '✔ verified') : h('span.badge.no', 'draft'), m.score ? h('span.badge', UI.fmt(m.score) + ' pts') : null, m.origin ? h('span.badge', m.origin) : null, ...deployedIn.map((o) => h('span.badge.type', { style: { '--c': '#34d399' } }, '🚀 ' + o.name))),
          h('div.dim', { style: { fontSize: '.72rem' } }, `${G.machineSize(m.structure)} ${m.type === 'CFG' ? 'productions' : m.type === 'PDA' || m.type === 'TM' ? 'transitions' : 'states'} · ${UI.date(m.updated)}${m.challengeId ? ' · mission ' + m.challengeId : ''}`),
          h('div.acts', h('button.btn.sm', { type: 'button', onclick: () => detailDlg(m, render) }, 'Details'), h('button.btn.sm' + (m.verified ? '.primary' : ''), { type: 'button', title: m.verified ? 'Deploy into a world object' : 'Only verified machines can be deployed', onclick: () => UI.deployFlow(m, null, render) }, '🚀 Deploy'),
            h('button.btn.sm', { type: 'button', onclick: () => UI.go('lab', { load: m.id }) }, 'Open in Lab')));
        grid.append(card);
      });
    };
    const filters = h('div.filters', ['all', 'verified', 'draft', 'DFA', 'NFA', 'ENFA', 'CFG', 'PDA', 'TM'].map((f) => h('button.chip' + (f === filter ? '.on' : ''), { type: 'button', onclick: (e) => { filter = f; UI.$$('.chip', filters).forEach((b) => b.classList.toggle('on', b === e.currentTarget)); render(); } }, f === 'ENFA' ? 'ε-NFA' : f)),
      h('input.text', { placeholder: 'search…', 'aria-label': 'Search archive', style: { maxWidth: '200px', marginLeft: 'auto' }, oninput: (e) => { q = e.target.value; render(); } }));
    root.append(h('div.screen', h('div.row', h('h2', { style: { color: '#fff' } }, '🗄 Machine Archive'), h('span.sp'), h('span.muted', 'Verified machines can be deployed, compared, combined and reused.')), filters, h('div.panel', { style: { margin: '.8rem 0' } }, tools), grid));
    render();
  };
  function detailDlg(m, rerender) {
    const nm = h('input.text', { value: m.name, maxlength: 48, 'aria-label': 'Machine name' });
    const hist = m.history && m.history.length ? m.history.slice().reverse().map((x) => h('div', { style: { fontSize: '.8rem' } }, `${UI.date(x.at)} · ${x.result} · ${x.score ?? ''} pts · mission ${x.challengeId}`)) : [h('span.dim', 'no verification history')];
    const struct = m.type === 'CFG' ? h('pre.panel.mono', { style: { padding: '.6rem', margin: 0 } }, CFG.toText(m.structure)) : UI.mini(m.structure, 'tall');
    const body = h('div.col', h('div.row', nm, UI.typeBadge(m.type), m.verified ? h('span.badge.ok', '✔ verified') : h('span.badge.no', 'unverified draft')), m.type === 'CFG' ? struct : h('div', { style: { height: '300px' } }, struct),
      m.type === 'DFA' || m.type === 'NFA' || m.type === 'ENFA' ? h('div.row', h('span.dim', `Kind: ${G.TYPE_LABEL[FA.kindOf(m.structure)]} · ε-moves: ${FA.epsCount(m.structure)} · ${FA.isDeterministic(m.structure) ? 'deterministic' : 'nondeterministic'} · ${FA.isComplete(m.structure, FA.symbols(m.structure)) ? 'complete' : 'partial'}`)) : null,
      h('div.sub', 'History'), ...hist, h('div.sub', 'Deployments'), ...(m.deployments.length ? m.deployments.map((d) => h('div', { style: { fontSize: '.8rem' } }, `${G.objectById(d.objectId).name} · ${UI.date(d.at)} ${d.active ? '· ACTIVE' : ''}`)) : [h('span.dim', 'never deployed')]));
    UI.modal({ title: 'Machine details', body, wide: true, buttons: [
      { label: '🗑 Delete', danger: true, onClick: (close) => { UI.confirm(`Delete “${m.name}”? Any deployment of it is removed too.`, { ok: 'Delete', danger: true }).then((ok) => { if (ok) { Game.deleteMachine(m.id); rerender(); } }); return true; } },
      { label: '⬇ Export .jff', onClick: () => { UI.download(`${UI.safeName(m.name)}.jff`, F.JFLAP.exportMachine(m.structure), 'application/xml'); UI.toast('JFLAP file exported.', { icon: '⬇' }); return false; }, keepOpen: true },
      { label: 'Save name', primary: true, onClick: () => { G.Store.renameMachine(m.id, nm.value); rerender(); } }] });
  }
  function compareDlg(a, b) {
    const r = Game.compare(a.id, b.id);
    if (!r.ok) return UI.toast(r.reason, { kind: 'warn' });
    const inp = h('input.text.mono', { placeholder: 'try to distinguish them…', maxlength: 30 }), out = h('div.status');
    const alpha = [...new Set([...FA.symbols(a.structure), ...FA.symbols(b.structure)])];
    const body = h('div.col', r.equal ? h('div.status.accept', '＝ Equivalent: the product automaton explored ' + r.explored + ' state-pairs and found NO string they treat differently. They define the same language.') : h('div.status.reject', ['≠ Different. Shortest distinguishing string: ', h('b.mono', r.shortest === '' ? 'ε' : r.shortest), `  — ${a.name} ${r.inA ? 'accepts' : 'rejects'}, ${b.name} ${r.inB ? 'accepts' : 'rejects'}.`]),
      !r.equal ? h('div.col', h('div.sub', 'Your turn — beat the Equivalence Engine'), h('div.probe', inp, h('button.btn.sm.primary', { type: 'button', onclick: () => { const x = inp.value.replace(/\s/g, ''); if ([...x].some((c) => !alpha.includes(c))) return UI.toast(`Use only {${alpha.join(', ')}}`, { kind: 'warn' }); const rr = Game.submitDistinguisher(a.id, b.id, x); out.className = 'status ' + (rr.ok ? 'accept' : 'reject'); out.textContent = rr.ok ? `✔ “${x || 'ε'}” distinguishes them (${a.name}: ${rr.a ? 'accept' : 'reject'}, ${b.name}: ${rr.b ? 'accept' : 'reject'}).` : `Both ${rr.a ? 'accept' : 'reject'} “${x || 'ε'}”.`; if (rr.ok) { UI.sfx.ok(); (rr.achievements || []).forEach((q) => UI.toast('Achievement unlocked: ' + q.name, { kind: 'gold', icon: q.icon })); } else UI.sfx.bad(); } }, 'Submit')), out) : null,
      h('div.grid', { style: { gridTemplateColumns: '1fr 1fr', gap: '.6rem' } }, h('div', h('div.sub', a.name), UI.mini(a.structure, 'tall')), h('div', h('div.sub', b.name), UI.mini(b.structure, 'tall'))));
    UI.modal({ title: '⚖ Equivalence Engine', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
  }
  function combineDlg(a, b, rerender) {
    let op = 'and';
    const names = { and: 'AND — both accept (intersection)', or: 'OR — either accepts (union)', xor: 'XOR — exactly one accepts (symmetric difference)', diff: 'A \\ B — A accepts but B does not' };
    const seg = h('div.seg', Object.entries(names).map(([k, t]) => h('button' + (k === op ? '.on' : ''), { type: 'button', onclick: (e) => { op = k; UI.$$('button', seg).forEach((x) => x.classList.toggle('on', x === e.currentTarget)); } }, t.split(' ')[0] === 'A' ? 'A \\ B' : k.toUpperCase())));
    const body = h('div.col', h('p.muted', `Build a product automaton from “${a.name}” and “${b.name}”. The result is a new DFA saved to your archive as an unverified draft — verify it by using it in a mission, or open it in the Lab.`), seg, h('div.dim', 'AND = intersection · OR = union · XOR = symmetric difference · A \\ B = difference'));
    UI.modal({ title: '⊗ Combine machines', body, buttons: [{ label: 'Cancel' }, { label: 'Build product', primary: true, onClick: () => { const r = Game.combine(a.id, b.id, op); if (!r.ok) { UI.toast(r.reason, { kind: 'warn' }); return false; } UI.toast(`Created “${r.machine.name}” (${r.machine.structure.states.length} states).`, { kind: 'good', icon: '⊗' }); rerender(); } }] });
  }

  /* ===================================================================== */
  /*                              ACHIEVEMENTS                               */
  /* ===================================================================== */
  UI.screens.achievements = function (root) {
    document.body.dataset.world = 'hub';
    const s = st(), got = G.ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
    const cards = G.ACHIEVEMENTS.map((a) => {
      const have = s.achievements[a.id], p = Math.min(a.goal, a.progress(s));
      return h('div.panel.ach' + (have ? '.got' : '.locked'), { style: { '--c': a.color } }, h('div.ic', a.icon), h('div.col', { style: { gap: '.1rem', flex: 1 } }, h('b', a.name + (a.extra ? '  ' : ''), a.extra ? h('span.badge', 'bonus') : null), h('small', a.desc), have ? h('span.good', { style: { fontSize: '.74rem' } }, '✔ unlocked ' + UI.date(have.at)) : h('div.row', { style: { gap: '.5rem' } }, h('div', { style: { flex: 1 } }, UI.bar(p, a.goal)), h('span.mono.dim', { style: { fontSize: '.74rem' } }, `${p}/${a.goal}`))));
    });
    root.append(h('div.screen', h('div.row', h('h2', { style: { color: '#fff' } }, '🏆 Achievements'), h('span.sp'), h('span.badge.ok', `${got} / ${G.ACHIEVEMENTS.length} unlocked`)), h('div.cards', { style: { marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))' } }, cards)));
  };

  /* ===================================================================== */
  /*                                PROFILE                                  */
  /* ===================================================================== */
  function radar(sum) {
    const n = sum.worlds.length, R = 120, c = 150;
    const pt = (i, k) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return [c + Math.cos(a) * R * k, c + Math.sin(a) * R * k]; };
    const svg = S('svg', { viewBox: '0 0 300 300', style: { width: '100%', maxWidth: '340px' }, role: 'img', 'aria-label': 'Mastery radar chart' });
    [0.25, 0.5, 0.75, 1].forEach((k) => svg.appendChild(S('polygon', { points: sum.worlds.map((_, i) => pt(i, k).join(',')).join(' '), fill: 'none', stroke: 'rgba(160,175,255,.2)' })));
    sum.worlds.forEach((w, i) => { const [x, y] = pt(i, 1); svg.appendChild(S('line', { x1: c, y1: c, x2: x, y2: y, stroke: 'rgba(160,175,255,.15)' })); const [lx, ly] = pt(i, 1.2); svg.appendChild(S('text', { x: lx, y: ly + 3, 'text-anchor': 'middle', fill: G.worldById(w.id).color, style: { fontSize: '9px', fontWeight: 700 } }, G.worldById(w.id).short.split(' ')[0].toUpperCase())); });
    svg.appendChild(S('polygon', { points: sum.worlds.map((w, i) => pt(i, w.max ? w.score / w.max : 0).join(',')).join(' '), fill: 'rgba(34,211,238,.25)', stroke: '#22d3ee', 'stroke-width': 2 }));
    sum.worlds.forEach((w, i) => { const [x, y] = pt(i, w.max ? w.score / w.max : 0); svg.appendChild(S('circle', { cx: x, cy: y, r: 3.5, fill: G.worldById(w.id).color })); });
    return svg;
  }
  UI.screens.profile = function (root) {
    document.body.dataset.world = 'hub';
    const sum = Game.summary(), s = st(), lv = sum.level;
    const set = (k, v) => { s.settings[k] = v; G.Store.save(); UI.applySettings(); };
    const toggle = (label, key, desc) => h('label.row', { style: { cursor: 'pointer', justifyContent: 'space-between', padding: '.35rem 0' } }, h('span', h('b', label), h('div.dim', { style: { fontSize: '.74rem' } }, desc)), h('input', { type: 'checkbox', checked: s.settings[key], onchange: (e) => { set(key, e.target.checked); if (key === 'demo') UI.toast(e.target.checked ? 'Demo mode on — everything unlocked.' : 'Demo mode off.', { icon: '🎬' }); } }));
    const att = s.attempts.slice(-40).reverse();
    const nameIn = h('input.text', { value: s.player.name, maxlength: 20, 'aria-label': 'Operator name', onchange: (e) => { s.player.name = e.target.value.trim() || 'Operator'; G.Store.save(); UI.refreshHud(); } });
    const left = h('div.col',
      h('div.panel', { style: { textAlign: 'center' } }, levelRing(lv), h('h3', { style: { color: '#fff', marginTop: '.6rem' } }, lv.rank), h('div.muted', `${UI.fmt(sum.xp)} XP · level ${lv.level}`), UI.bar(lv.into, lv.span), h('div.row', { style: { marginTop: '.8rem' } }, h('span.muted', 'Name'), nameIn)),
      G.Variants ? h('div.panel', h('h3', '🎲 This visit’s challenges'), h('p.dim', { style: { fontSize: '.76rem', margin: '0 0 .4rem' } }, G.Variants.classic ? 'Classic mode: every mission is the original challenge.' : `Session #${G.Variants.seed} · ${G.Variants.totalVariants() - G.Variants.slots().length} extra challenges are in the pool (${G.Variants.totalVariants()} counting the originals).`),
        h('div.chips', G.Variants.slots().map((sl) => { const i = G.Variants.info(sl); return h('span.chip', { title: G.challengeById(sl).title }, `${sl}: ${i.id === 'base' ? 'Classic' : i.label}`); })),
        h('button.btn.sm', { type: 'button', style: { marginTop: '.6rem' }, onclick: () => { G.Variants.rollAll({ classic: false }); UI.toast('Re-rolled every mission.', { icon: '🎲' }); UI.go('profile'); } }, '🎲 Re-roll every mission')) : null,
      h('div.panel', h('h3', 'Mastery radar'), h('div', { style: { display: 'grid', placeItems: 'center' } }, radar(sum))),
      h('div.panel', h('h3', 'Settings'), toggle('Sound effects', 'sound', 'Synthesised in the browser — no files'), toggle('Reduce motion', 'reduceMotion', 'Skips orb animations & confetti'), toggle('High contrast', 'highContrast', 'Stronger borders and text'), toggle('Demo mode', 'demo', 'Unlocks every region and mission for evaluators'),
        h('label.row', { style: { cursor: 'pointer', justifyContent: 'space-between', padding: '.35rem 0' } }, h('span', h('b', 'Different challenges every visit'), h('div.dim', { style: { fontSize: '.74rem' } }, 'Off = the same classic challenges every time')), h('input', { type: 'checkbox', checked: s.settings.randomize !== false, onchange: (e) => { set('randomize', e.target.checked); G.Variants.rollAll({ classic: !e.target.checked }); UI.toast(e.target.checked ? 'A fresh set of challenges was rolled.' : 'Classic challenges restored.', { icon: '🎲' }); UI.go('profile'); } })),
        h('div.row', { style: { justifyContent: 'space-between' } }, h('b', 'Text size'), h('input', { type: 'range', min: 0.85, max: 1.3, step: 0.05, value: s.settings.fontScale, 'aria-label': 'Text size', oninput: (e) => set('fontScale', +e.target.value) }))));
    const rows = sum.worlds.map((ws) => { const w = G.worldById(ws.id); return h('tr', h('td', { style: { color: w.color, fontWeight: 700 } }, w.name), h('td.mono', `${ws.done}/${ws.count}`), h('td.mono', UI.fmt(ws.score)), h('td.mono', UI.fmt(ws.max)), h('td', { style: { minWidth: '120px' } }, UI.bar(ws.score, ws.max))); });
    const contractPts = G.Score.contractBonus(s.progress, G.CHALLENGES);
    const right = h('div.col',
      h('div.panel', h('h3', 'Score summary'), h('table.tbl', h('tr', h('th', 'Region'), h('th', 'Missions'), h('th', 'Score'), h('th', 'Max'), h('th', '')), rows, h('tr', h('td', 'Maintenance contracts'), h('td', ''), h('td.mono', UI.fmt(contractPts)), h('td.dim', 'bonus'), h('td')), h('tr', h('td', h('b', 'OVERALL')), h('td'), h('td.mono', h('b', UI.fmt(sum.overall))), h('td.mono', UI.fmt(sum.overallMax)), h('td', UI.bar(sum.overall, sum.overallMax)))),
        h('p.dim', { style: { fontSize: '.76rem' } }, 'Level score = correctness (500) + efficiency (150) + probing (100) + no hints (100) + speed (50) + optional objective (100), scaled per mission. World score = sum of best level scores. Overall score = sum of world scores (+ contract bonuses).')),
      h('div.panel', h('h3', 'Learning analytics'), h('div.hero-stats', { style: { gridTemplateColumns: 'repeat(4,1fr)' } }, h('div.stat', h('small', 'Attempts'), h('b', sum.attempts)), h('div.stat', h('small', 'Failed'), h('b', sum.failed)), h('div.stat', h('small', 'Probes'), h('b', s.stats.probes)), h('div.stat', h('small', 'Tests run'), h('b', s.stats.tests)))),
      h('div.panel', h('h3', 'Recent attempts'), h('div.att', att.length ? h('table.tbl', h('tr', h('th', 'mission'), h('th', 'result'), h('th', 'hints'), h('th', 'tests'), h('th', 'time'), h('th', 'when')), att.map((a) => h('tr', h('td', a.challengeId), h('td', h('span.' + (a.result === 'verified' ? 'good' : 'bad'), a.result)), h('td', a.hints), h('td', a.tests), h('td', a.time + 's'), h('td.dim', UI.date(a.at))))) : h('span.dim', 'No attempts yet.'))),
      h('div.panel', h('h3', 'Save data'), h('p.muted', G.Store.persistent ? 'Progress is saved automatically in this browser.' : 'Browser storage is unavailable — progress lasts only for this session. Export a save file to keep it.'),
        h('div.row', h('button.btn.sm', { type: 'button', onclick: () => { UI.download('automata-metaverse-save.json', G.Store.exportJSON(), 'application/json'); UI.toast('Save file exported.', { icon: '⬇' }); } }, '⬇ Export save'),
          h('button.btn.sm', { type: 'button', onclick: async () => { const f = await UI.pickFile('.json'); if (!f) return; try { G.Store.importJSON(f.text); UI.applySettings(); UI.toast('Save imported.', { kind: 'good' }); UI.go('profile'); } catch (e) { UI.toast(e.message, { kind: 'bad' }); } } }, '⬆ Import save'),
          h('button.btn.sm.danger', { type: 'button', onclick: async () => { if (await UI.confirm('Erase ALL progress, machines and achievements?', { ok: 'Erase everything', danger: true })) { G.Store.reset(); UI.applySettings(); UI.go('title'); } } }, '🗑 Reset progress'))));
    root.append(h('div.screen', h('h2', { style: { color: '#fff', marginBottom: '.8rem' } }, '👤 Profile'), h('div.profile-grid', left, right)));
  };

  /* ===================================================================== */
  /*                       LAB — sandbox + JFLAP bridge                      */
  /* ===================================================================== */
  UI.screens.lab = function (root, params = {}) {
    document.body.dataset.world = 'hub';
    const types = [['FA', 'Finite automaton (DFA / NFA / ε-NFA)'], ['CFG', 'Context-free grammar'], ['PDA', 'Pushdown automaton'], ['TM', 'Turing machine']];
    let kind = 'FA', editor = null, ged = null, deck = null;
    const work = h('div'), tabs = h('div.seg');
    const loaded = params.machine ? { structure: params.machine, type: params.machine.type, name: params.name || 'JFLAP machine' } : params.load ? G.Store.getMachine(params.load) : null;
    const getM = () => (kind === 'CFG' ? ged.getMachine() : editor.getMachine());
    const validate = () => (kind === 'CFG' ? ged.validate() : editor.validate());
    const build = (k, preset) => {
      kind = k; UI.clear(work); UI.runCleanups(); editor = ged = deck = null;
      UI.$$('button', tabs).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      const stage = h('div.stage'), side = h('div.side-col');
      work.append(h('div.mission', { style: { gridTemplateColumns: 'minmax(0,1fr) minmax(310px,420px)' } }, stage, side));
      if (k === 'CFG') {
        ged = new UI.GrammarEditor(stage, { alphabet: null });
        deck = new UI.GrammarDeck(side, { getGrammar: () => ged.getMachine(), validate: () => ged.validate(), onTest: () => {} });
        ged.setText(preset ? CFG.toText(preset) : 'S -> aSb | ε');
      } else {
        editor = new UI.GraphEditor(stage, { model: k, kind: k === 'FA' ? 'NFA' : k, allowedKinds: k === 'FA' ? ['DFA', 'NFA', 'ENFA'] : [k], alphabet: null });
        deck = new UI.SimDeck(side, { model: k, editor, getMachine: () => editor.getMachine(), validate: () => editor.validate(), onTest: () => {} });
        if (preset) requestAnimationFrame(() => editor.setMachine(preset));
      }
    };
    const toolbar = h('div.row.panel', { style: { padding: '.6rem .8rem', margin: '.8rem 0' } },
      h('button.btn.sm.primary', { type: 'button', onclick: async () => { const v = validate(); if (!v.ok) return UI.toast(v.errors[0], { kind: 'warn' }); const name = await UI.prompt('Name this machine', 'Lab machine'); if (name === null) return; const rec = Game.saveLabMachine(name, getM()); UI.toast(`Saved “${rec.name}” to the Archive as an unverified draft.`, { kind: 'good', icon: '🗄' }); } }, '💾 Save to Archive'),
      h('button.btn.sm', { type: 'button', onclick: () => { const m = getM(); if (kind === 'CFG') { if (!m.productions.length) return UI.toast('Write a grammar first.', { kind: 'warn' }); return UI.download('grammar.jff', F.JFLAP.exportMachine(m), 'application/xml'); } if (!m.states.length) return UI.toast('Draw a machine first.', { kind: 'warn' }); UI.download(`lab_${m.type}.jff`, F.JFLAP.exportMachine(m), 'application/xml'); UI.toast('Exported a JFLAP-compatible .jff.', { icon: '⬇' }); } }, '⬇ Export .jff (JFLAP)'),
      h('button.btn.sm', { type: 'button', onclick: async () => { const f = await UI.pickFile('.jff,.xml'); if (!f) return; try { const m = F.JFLAP.importXML(f.text); const k = m.type === 'CFG' ? 'CFG' : ['DFA', 'NFA', 'ENFA'].includes(m.type) ? 'FA' : m.type; build(k, m.type === 'CFG' ? m : m); UI.toast(`Imported ${f.name} (${G.TYPE_LABEL[m.type] || m.type}).`, { kind: 'good', icon: '⬆' }); } catch (e) { UI.toast('Import failed: ' + e.message, { kind: 'bad' }); } } }, '⬆ Import .jff'),
      h('span.sp'),
      h('button.btn.sm', { type: 'button', onclick: () => { if (kind !== 'FA') return UI.toast('Subset construction applies to finite automata.', { kind: 'warn' }); const m = getM(); UI.openSubsetLab(m, FA.symbols(m)); } }, '⚗ NFA→DFA'),
      h('button.btn.sm', { type: 'button', onclick: () => { if (kind !== 'FA') return UI.toast('Minimisation applies to finite automata.', { kind: 'warn' }); const m = getM(); if (!m.states.some((x) => x.initial)) return UI.toast('Add an initial state first.', { kind: 'warn' }); UI.openMinimizeLens(m, FA.symbols(m)); } }, '✂ Minimize'),
      h('button.btn.sm', { type: 'button', onclick: () => { if (kind !== 'FA') return UI.toast('Complement applies to finite automata.', { kind: 'warn' }); const m = getM(); if (!m.states.some((x) => x.initial)) return UI.toast('Add an initial state first.', { kind: 'warn' }); const c = FA.complement(m, FA.symbols(m)); editor.setMachine(c, { silent: false }); UI.toast('Replaced by the complement DFA (accepting ⇄ rejecting, completed).', { icon: '¬' }); } }, '¬ Complement'),
      h('button.btn.sm', { type: 'button', onclick: () => { if (kind !== 'CFG') return UI.toast('CNF conversion applies to grammars.', { kind: 'warn' }); UI.openCNFLens(ged.getMachine()); } }, '🌲 CNF'),
      h('button.btn.sm', { type: 'button', onclick: () => { if (kind !== 'CFG') return UI.toast('Open a grammar tab first.', { kind: 'warn' }); UI.openGarden(ged.getMachine()); } }, '🌳 Garden'));
    tabs.append(...types.map(([k, t]) => h('button', { type: 'button', dataset: { k }, onclick: () => build(k) }, t)));
    root.append(h('div.screen', h('div.row', h('h2', { style: { color: '#fff' } }, '🧪 Sandbox Lab'), h('span.sp'), h('span.muted', 'Free-build any machine, test it, and move it to and from JFLAP.')), h('div', { style: { marginTop: '.6rem' } }, tabs), toolbar, work));
    const startKind = loaded ? (loaded.type === 'CFG' ? 'CFG' : ['DFA', 'NFA', 'ENFA'].includes(loaded.type) ? 'FA' : loaded.type) : 'FA';
    build(startKind, loaded ? loaded.structure : null);
    if (loaded) UI.toast(`Loaded “${loaded.name}” into the Lab.`, { icon: '🧪' });
  };
})();
