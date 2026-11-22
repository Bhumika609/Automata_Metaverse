/* ============================================================================
 * UI LAYER · learning tools ("lenses")
 *   mini graph · Minimization Lens · Subset Lab · CNF Lens · Memory Check · Grammar Garden
 * Each tool calls the real formal engine; nothing here is canned animation.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, F = AM.F, G = AM.G;
  const h = UI.h;
  const FA = F.FA, CFG = F.CFG;

  const modelOf = (m) => (m.type === 'PDA' ? 'PDA' : m.type === 'TM' ? 'TM' : 'FA');
  /** a read-only, auto-fitted picture of any machine */
  UI.mini = function (machine, cls = '') {
    const el = h('div.mini' + (cls ? '.' + cls : ''));
    if (machine.type === 'CFG') { el.className = 'mini panel gram-prev'; el.textContent = CFG.toText(machine); return el; }
    const boot = () => {
      if (!el.isConnected) return requestAnimationFrame(boot);
      const ed = new UI.GraphEditor(el, { model: modelOf(machine), kind: machine.type, allowedKinds: [machine.type], readOnly: true, compact: cls !== 'xl' && cls !== 'tall' });
      ed.setMachine(machine);
      setTimeout(() => ed.fit(), 40);
      if (window.ResizeObserver) { const ro = new ResizeObserver(() => ed.fit()); ro.observe(el); UI.onCleanup(() => ro.disconnect()); }
      el._ed = ed;
    };
    requestAnimationFrame(boot);
    return el;
  };
  const PALETTE = ['#22d3ee', '#c084fc', '#4ade80', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6', '#34d399'];

  /* ---------------- Minimization Lens (Moore partition refinement) ---------------- */
  UI.openMinimizeLens = function (machine, alphabet) {
    const r = FA.minimize(machine, alphabet);
    const body = h('div.col', h('p.muted', 'Two states are equivalent if no string can tell them apart. Start by splitting accepting from non-accepting states, then keep splitting any group whose members send a symbol to different groups. When nothing splits any more, every group becomes ONE state of the minimal DFA.'),
      ...r.rounds.map((rd, i) => h('div.lesson-step', h('b', rd.title), h('div', rd.groups.map((g, k) => h('span.part-group', { style: { '--c': PALETTE[k % PALETTE.length] } }, '{' + g.join(', ') + '}'))))),
      h('div.sub', 'Resulting minimal DFA — ' + r.partialSize + ' state' + (r.partialSize === 1 ? '' : 's') + (r.completeSize !== r.partialSize ? ' (+ a dead state)' : '')), UI.mini(r.min, 'tall'));
    UI.modal({ title: '✂ Minimization Lens', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
  };

  /* ---------------- Subset Lab (NFA → DFA) ---------------- */
  UI.openSubsetLab = function (machine, alphabet) {
    const kind = FA.kindOf(machine);
    if (!machine.states.some((s) => s.initial)) return UI.toast('Add an initial state first.', { kind: 'warn' });
    const res = FA.toDFA(machine, alphabet);
    const tbl = h('table.tbl'), steps = h('div.log', { style: { maxHeight: '180px' } });
    const gwrap = h('div');
    const alpha = res.dfa.alphabet;
    tbl.append(h('tr', h('th', 'DFA state (set of NFA states)'), alpha.map((a) => h('th', a))));
    const body = h('div.grid', { style: { gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)' } },
      h('div.col', h('p.muted', kind === 'ENFA' ? 'Each DFA state is a SET of NFA states (closed under ε). A transition collects where every member can go, then takes the ε-closure.' : 'Each DFA state is a SET of NFA states: all the clones alive at that moment, merged into one super-clone.'), tbl, h('div.sub', 'Construction log'), steps),
      h('div.col', h('div.sub', 'The DFA being forged'), gwrap));
    const m = UI.modal({ title: '⚗ Subset Lab — merge the clones', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
    // reveal the construction row by row (this is the algorithm, not an animation trick)
    let i = 0; const partial = { type: 'DFA', alphabet: alpha, states: [], transitions: [] };
    const shown = new Set();
    const tick = () => {
      if (i >= res.table.length) { gwrap.replaceChildren(UI.mini(res.dfa, 'xl')); return; }
      const row = res.table[i++];
      tbl.append(h('tr.new', h('td', (row.isStart ? '→ ' : '') + (row.isFinal ? '* ' : '') + row.name), alpha.map((a) => h('td', row.trans[a]))));
      for (const s of res.steps.filter((x) => x.from === row.name)) steps.append(h('div', `${s.from} —${s.symbol}→ move ${s.move}${kind === 'ENFA' ? ' → ε-closure ' + s.closure : ''} = ${s.to}${s.isNew ? '   ✦ new state' : ''}`));
      steps.scrollTop = steps.scrollHeight; UI.sfx.step();
      const ids = new Set(res.table.slice(0, i).map((r) => r.name)); for (const r of res.table.slice(0, i)) for (const a of alpha) ids.add(r.trans[a]);
      const sub = { ...res.dfa, states: res.dfa.states.filter((s) => ids.has(s.name)), transitions: res.dfa.transitions.filter((t) => { const f = res.dfa.states.find((s) => s.id === t.from); return res.table.slice(0, i).some((r) => r.name === f.name); }) };
      sub.transitions = sub.transitions.filter((t) => sub.states.some((s) => s.id === t.to));
      gwrap.replaceChildren(UI.mini(sub, 'xl'));
      const id = setTimeout(tick, UI.reduceMotion() ? 10 : 700); UI.onCleanup(() => clearTimeout(id));
    };
    tick();
    return m;
  };

  /* ---------------- CNF Lens ---------------- */
  UI.openCNFLens = function (grammar) {
    if (!grammar || !grammar.productions.length) return UI.toast('Write a grammar first.', { kind: 'warn' });
    const { cnf, steps } = CFG.toCNF(grammar);
    const body = h('div.col', h('p.muted', 'Chomsky Normal Form: every rule is A → BC (two nonterminals) or A → a (one terminal) — derivation trees become neat binary trees. The conversion below runs on YOUR grammar.'),
      steps.map((s, i) => h('div.lesson-step', h('b', `${i}. ${s.title}`), h('p.muted', { style: { margin: '.2rem 0' } }, s.why), h('pre.mono', { style: { margin: 0, color: 'var(--good)', fontSize: '.82rem', whiteSpace: 'pre-wrap' } }, s.text))),
      h('div.status.accept', CFG.isCNF(cnf) ? '✔ Result is in Chomsky Normal Form — ' + cnf.productions.length + ' productions' : 'Result computed'));
    UI.modal({ title: '🌲 CNF Lens', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
  };

  /* ---------------- Memory Check (why a DFA is not enough for aⁿbⁿ) ---------------- */
  UI.openMemoryCheck = function (onDone) {
    const anbnDFA = (k) => {
      const d = {};
      for (let i = 0; i <= k; i++) { d['A' + i] = {}; if (i < k) d['A' + i].a = 'A' + (i + 1); if (i >= 1) d['A' + i].b = 'B' + (i - 1); }
      for (let j = 0; j < k; j++) { d['B' + j] = {}; if (j >= 1) d['B' + j].b = 'B' + (j - 1); }
      d.B0 = d.B0 || {};
      return FA.build({ type: 'DFA', alphabet: 'ab', start: 'A0', finals: ['A0', 'B0'], delta: d });
    };
    let k = 3;
    const out = h('div.col'), slider = h('input', { type: 'range', min: 1, max: 8, value: 3, 'aria-label': 'k', style: { accentColor: 'var(--accent)' } });
    const lab = h('b.mono', 'k = 3');
    const quiz = h('div');
    const draw = () => {
      const m = anbnDFA(k), alpha = ['a', 'b'];
      const comp = FA.complete(m, alpha);
      let rows = [];
      for (let n = 0; n <= k + 2; n++) { const w = 'a'.repeat(n) + 'b'.repeat(n); const got = FA.accepts(m, w); rows.push(h('tr', h('td', n), h('td', w.length > 16 ? w.slice(0, 7) + '…' + w.slice(-7) : w || 'ε'), h('td', UI.verdict(true)), h('td', UI.verdict(got)), h('td', got ? h('span.good', '✔') : h('span.bad', '✘ wrong!')))); }
      // pigeonhole: states reached after a^0 … a^(m) — two must coincide
      const st = new Map(comp.states.map((s) => [s.id, s.name]));
      const seen = new Map(); let pair = null, cur = comp.states.find((s) => s.initial).id;
      for (let i = 0; i <= comp.states.length + 1; i++) { if (seen.has(cur) && !pair) pair = [seen.get(cur), i, st.get(cur)]; seen.set(cur, seen.has(cur) ? seen.get(cur) : i); cur = comp.transitions.find((t) => t.from === cur && t.read === 'a').to; }
      const [i, j, s] = pair;
      const wi = 'a'.repeat(i) + 'b'.repeat(i), wj = 'a'.repeat(j) + 'b'.repeat(i);
      UI.clear(out);
      out.append(h('div.sub', `A DFA built to count up to ${k} (${m.states.length} states)`), UI.mini(m, 'tall'),
        h('table.tbl', h('tr', h('th', 'n'), h('th', 'aⁿbⁿ'), h('th', 'should'), h('th', 'DFA says'), h('th', '')), rows),
        h('div.lesson-step', h('b', 'Pigeonhole'), h('p', `Reading a⁰, a¹, …, a${j} the DFA visits only ${comp.states.length} states, so it must revisit one: after a${i} and after a${j} it is in the same state ${s}. From there the future is identical — so it gives the SAME answer for ${i ? 'a' + i + 'b' + i : 'ε'} and a${j}b${i}.`), h('p', `But ${i ? 'a' + i + 'b' + i : 'ε'} ∈ L and a${j}b${i} ∉ L.  DFA on “${wi || 'ε'}”: ${FA.accepts(comp, wi) ? 'ACCEPT' : 'REJECT'};  DFA on “${wj}”: ${FA.accepts(comp, wj) ? 'ACCEPT' : 'REJECT'}.  ${FA.accepts(comp, wi) === FA.accepts(comp, wj) ? 'Same answer — one of them is wrong!' : ''}`)));
    };
    slider.addEventListener('input', () => { k = +slider.value; lab.textContent = 'k = ' + k; draw(); UI.sfx.step(); });
    draw();
    const q = h('div.col');
    const opts = [['Yes — just use enough states', false], ['No — any DFA has finitely many states, so it eventually forgets how many a’s it saw', true], ['Only if the alphabet is larger', false]];
    q.append(h('b', 'Is there a single DFA that recognises aⁿbⁿ for EVERY n?'), ...opts.map(([t, ok]) => h('button.quiz-opt', { type: 'button', onclick: (e) => { if (ok) { e.target.classList.add('right'); UI.sfx.ok(); const fresh = G.Game.recordMemoryCheck(); UI.toast('Memory Check complete — optional objective unlocked in the Stack Assembler!', { kind: 'gold', icon: '🧠' }); fresh.forEach((a) => UI.toast('Achievement: ' + a.name, { kind: 'gold', icon: a.icon })); if (onDone) onDone(); } else { e.target.classList.add('wrong'); UI.sfx.bad(); } } }, t)));
    quiz.append(q);
    const body = h('div.col', h('p.muted', 'A DFA remembers only which state it is in. To recognise aⁿbⁿ it must remember n. Slide k to give the DFA more states — it always breaks one step later. A stack gives unbounded memory.'), h('div.row', h('span', 'Memory budget'), slider, lab), out, quiz);
    UI.modal({ title: '🧠 Memory Check — is a DFA enough?', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
  };

  /* ---------------- Grammar Garden (manual derivation + Spot the Intruder) ---------------- */
  const PRESETS = [
    { name: 'aⁿbⁿ  (S → aSb | ε)', text: 'S -> aSb | ε', pred: (w) => /^a*b*$/.test(w) && (w.match(/a/g) || []).length === (w.match(/b/g) || []).length, alphabet: ['a', 'b'] },
    { name: 'Balanced parentheses  (S → (S)S | ε)', text: 'S -> (S)S | ε', pred: (w) => { let d = 0; for (const c of w) { d += c === '(' ? 1 : -1; if (d < 0) return false; } return d === 0; }, alphabet: ['(', ')'] },
    { name: 'Palindromes over {a,b}', text: 'S -> aSa | bSb | a | b | ε', pred: (w) => w === [...w].reverse().join(''), alphabet: ['a', 'b'] },
    { name: 'Expressions  (E → a | a+E | a*E)', text: 'E -> a | a+E | a*E', pred: (w) => /^a([+*]a)*$/.test(w), alphabet: ['a', '+', '*'] },
  ];
  UI.openGarden = function (initialGrammar) {
    const sources = PRESETS.map((p) => ({ label: p.name, grammar: CFG.parseText(p.text).grammar, pred: p.pred, alphabet: p.alphabet }));
    for (const m of G.Store.state.machines.filter((x) => x.type === 'CFG')) { const ch = m.challengeId && G.challengeById(m.challengeId); sources.push({ label: '🗄 ' + m.name + (m.verified ? ' ✓' : ''), grammar: m.structure, pred: ch ? ch.pred : null, alphabet: CFG.terminals(m.structure) }); }
    if (initialGrammar && initialGrammar.productions && initialGrammar.productions.length) sources.unshift({ label: '✎ Your grammar (from the editor)', grammar: initialGrammar, pred: null, alphabet: CFG.terminals(initialGrammar) });
    let src = sources[0], root, tab = 'grow';
    const sel = h('select', { 'aria-label': 'Grammar', onchange: () => { src = sources[+sel.value]; reset(); } }, sources.map((s, i) => h('option', { value: i }, s.label)));
    const treeV = new UI.TreeView(), formEl = h('div.mono', { style: { fontSize: '1.1rem', minHeight: '1.6em' } }), rulesEl = h('div.seed-list'), msg = h('div.status', 'Click a glowing nonterminal, then choose a rule (seed) to plant.');
    const countEl = h('b.mono');
    const leaves = (n) => (n.term ? [n] : n.children.length ? n.children.flatMap(leaves) : [n]);
    const nodeCount = (n) => 1 + (n.children || []).reduce((a, c) => a + nodeCount(c), 0);
    const redraw = () => {
      const lv = leaves(root);
      formEl.textContent = lv.map((n) => (n.eps ? '' : n.sym)).join('') || 'ε';
      treeV.set(root, { onPick: pick });
      countEl.textContent = G.Store.state.stats.gardenStrings.length + ' / 10';
      const open = lv.filter((n) => !n.term);
      if (!open.length) finish(lv.map((n) => (n.eps ? '' : n.sym)).join(''));
    };
    const finish = (w) => {
      UI.clear(rulesEl);
      const valid = src.pred ? !!src.pred(w) : CFG.accepts(src.grammar, w);
      const r = G.Game.recordGardenString(w, valid);
      msg.className = 'status ' + (valid ? 'accept' : 'reject'); UI.clear(msg);
      msg.append(h('b', valid ? '✔ Valid string grown: ' : '✘ Not in the target language: '), h('span.mono', '“' + (w || 'ε') + '”'), valid ? h('span', r.added ? '  — new! counted for Grammar Gardener' : '  — already collected') : h('span', ' — this grammar grows strings outside the language'));
      if (valid) UI.sfx.ok(); else UI.sfx.bad();
      (r.fresh || []).forEach((a) => { UI.sfx.unlock(); UI.toast('Achievement unlocked: ' + a.name, { kind: 'gold', icon: a.icon }); });
      countEl.textContent = G.Store.state.stats.gardenStrings.length + ' / 10';
    };
    const pick = (node) => {
      UI.clear(rulesEl);
      msg.className = 'status'; msg.textContent = `Choose a seed for ${node.sym}:`;
      src.grammar.productions.forEach((p, idx) => { if (p.left !== node.sym) return; rulesEl.append(h('button.seed.btnlike', { type: 'button', onclick: () => grow(node, idx) }, CFG.prodText(p))); });
      if (!rulesEl.children.length) rulesEl.append(h('span.bad', `No rule for ${node.sym}!`));
    };
    const grow = (node, idx) => {
      const p = src.grammar.productions[idx];
      if (nodeCount(root) > 70) { msg.className = 'status reject'; msg.textContent = 'The tree got too big — reset and choose terminating seeds sooner.'; return; }
      node.prod = idx; node.children = p.right.length ? p.right.map((t) => (CFG.isNT(t) ? { sym: t, children: [] } : { sym: t, term: true })) : [{ sym: 'ε', term: true, eps: true }];
      UI.clear(rulesEl); UI.sfx.place(); msg.className = 'status'; msg.textContent = 'Planted ' + CFG.prodText(p) + '. Keep growing!'; redraw();
    };
    const reset = () => { root = { sym: src.grammar.start, children: [] }; treeV.clearSeen(); UI.clear(rulesEl); msg.className = 'status'; msg.textContent = 'Click a glowing nonterminal, then choose a rule (seed) to plant.'; redraw(); };
    const auto = async () => {
      reset(); const rng = F.rng(Date.now() & 0xffff);
      const t = CFG.randomDerivation(src.grammar, rng, 14); if (!t) { msg.textContent = 'This grammar cannot derive a string.'; return; }
      // replay the random derivation step by step through the same grow() path
      const queue = [[root, t]];
      while (queue.length) {
        const [n, full] = queue.shift();
        grow(n, full.prod); await UI.sleep(380);
        full.children.forEach((c, i) => { if (!c.term) queue.push([n.children[i], c]); });
        if (!n.isConnected && false) return;
      }
    };
    /* intruder tab */
    const intr = h('div.col'); let round = 0;
    const newRound = () => {
      round++; UI.clear(intr);
      const rng = F.rng(round * 7919 + Date.now() % 1000);
      const inL = src.pred ? (w) => src.pred(w) : (w) => CFG.accepts(src.grammar, w);
      const alpha = src.alphabet.length ? src.alphabet : ['a', 'b'];
      const good = CFG.generate(src.grammar, 8, 40).filter((w) => w.length > 0), pool = [];
      for (let i = 0; i < 4 && good.length; i++) pool.push(good.splice(Math.floor(rng() * good.length), 1)[0]);
      let guard = 0; while (pool.length < 8 && guard++ < 500) { const w = F.randomString(rng, alpha, 2, 8); if (!pool.includes(w) && !inL(w)) pool.push(w); }
      pool.sort(() => rng() - 0.5);
      let score = 0, done = 0;
      const board = h('div.col'); intr.append(h('p.muted', 'Some of these strings grow from the grammar; the rest are intruders. Decide for each — the CYK parser will judge you.'), board);
      pool.forEach((w) => {
        const row = h('div.row'); const label = h('span.mono', { style: { minWidth: '9ch' } }, w || 'ε');
        const act = (guess) => { const truth = CFG.accepts(src.grammar, w); row.replaceChildren(label, truth ? h('span.good', '✔ derivable') : h('span.bad', '✘ intruder'), h('span', guess === truth ? '· you were right' : '· not quite')); if (guess === truth) { score++; UI.sfx.ok(); } else UI.sfx.bad(); if (truth) { const t = CFG.parseTrees(src.grammar, w, 1)[0]; if (t) row.append(h('button.btn.sm', { type: 'button', onclick: () => { treeV.clearSeen(); treeV.set(t); tabBtn('grow'); formEl.textContent = w; msg.textContent = 'Parse tree of “' + w + '”'; } }, 'show tree')); } if (++done === pool.length) board.append(h('div.status.accept', `Round score: ${score} / ${pool.length}`), h('button.btn.sm.primary', { type: 'button', onclick: newRound }, 'Next round')); };
        row.append(label, h('button.btn.sm', { type: 'button', onclick: () => act(true) }, '✔ derivable'), h('button.btn.sm', { type: 'button', onclick: () => act(false) }, '✘ intruder'));
        board.append(row);
      });
    };
    const growPane = h('div.col', h('div.row', h('span.sub', 'Sentential form'), formEl), msg, rulesEl, treeV.el);
    const tabs = h('div.seg'); const tabBtns = {};
    const tabBtn = (t) => { tab = t; growPane.classList.toggle('hidden', t !== 'grow'); intr.classList.toggle('hidden', t !== 'intruder'); Object.entries(tabBtns).forEach(([k, b]) => b.classList.toggle('on', k === t)); if (t === 'intruder' && !intr.children.length) newRound(); };
    [['grow', '🌱 Grow a tree'], ['intruder', '🕵 Spot the intruder']].forEach(([k, t]) => { tabBtns[k] = h('button', { type: 'button', onclick: () => tabBtn(k) }, t); tabs.append(tabBtns[k]); });
    const body = h('div.col', h('div.row', sel, h('span.sp'), h('span.muted', 'Gardener progress:'), countEl, tabs, h('button.btn.sm', { type: 'button', onclick: auto }, '🎲 Auto-grow'), h('button.btn.sm', { type: 'button', onclick: reset }, '↺ Reset')), growPane, intr);
    UI.modal({ title: '🌳 Grammar Garden', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
    reset(); tabBtn('grow');
  };
})();
