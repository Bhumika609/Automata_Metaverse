/* ============================================================================
 * UI LAYER · JFLAP Workbench — JFLAP's Convert / Input / Test tools, natively,
 * plus a bridge that opens machines in the REAL JFLAP.jar when it is installed.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, F = AM.F, G = AM.G;
  const h = UI.h, JT = F.JT, FA = F.FA, CFG = F.CFG, S = UI.svg;
  UI.screens = UI.screens || {};
  const save = (name, m) => { const r = G.Game.saveLabMachine(name, m); UI.toast(`Saved “${r.name}” to the Archive (unverified draft).`, { kind: 'good', icon: '🗄' }); };
  const toLab = (m, name) => UI.go('lab', { machine: m, name });
  const actions = (m, name) => h('div.row', h('button.btn.sm', { type: 'button', onclick: () => toLab(m, name) }, '🧪 Open in Lab'), h('button.btn.sm', { type: 'button', onclick: () => save(name, m) }, '🗄 Save to Archive'),
    h('button.btn.sm', { type: 'button', onclick: () => UI.download(UI.safeName(name) + '.jff', F.JFLAP.exportMachine(m), 'application/xml') }, '⬇ .jff'), h('button.btn.sm', { type: 'button', onclick: () => openInJflap(m, name) }, '☕ Open in real JFLAP'));
  const stepsBox = (arr) => h('div.log', { style: { maxHeight: '190px' } }, arr.map((x) => h('div', x)));

  /* ---------- real JFLAP bridge (needs `node serve.js`) ---------- */
  let bridge = null;
  async function bridgeStatus() {
    if (bridge) return bridge;
    try { const r = await fetch('/api/jflap/status', { headers: { 'X-AM': '1' } }); bridge = r.ok ? await r.json() : { server: false }; bridge.server = r.ok; } catch (e) { bridge = { server: false }; }
    return bridge;
  }
  async function openInJflap(m, name) {
    const st = await bridgeStatus(); const xml = F.JFLAP.exportMachine(m), file = UI.safeName(name) + '.jff';
    if (st.server && st.jar && st.java) {
      try { const r = await fetch('/api/jflap/open', { method: 'POST', headers: { 'X-AM': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file, xml }) }); const j = await r.json(); if (j.ok) return UI.toast('Launching real JFLAP with your machine…', { kind: 'good', icon: '☕' }); throw new Error(j.error || 'failed'); } catch (e) { UI.toast('Could not launch JFLAP: ' + e.message, { kind: 'bad' }); }
    }
    UI.download(file, xml, 'application/xml');
    UI.toast(st.server ? (st.jar ? 'Java not found — downloaded the .jff instead. Open it in JFLAP.' : 'JFLAP.jar not found in the jflap/ folder — downloaded the .jff instead.') : 'Not running via “node serve.js” — downloaded the .jff. Open it in JFLAP.', { icon: '⬇', ms: 6000 });
  }

  UI.openInJflap = openInJflap;

  /* ---------- tabs ---------- */
  function regexTab() {
    const out = h('div.col'), inp = h('input.text.mono', { value: '(a|b)*abb', maxlength: 60, 'aria-label': 'Regular expression', onkeydown: (e) => { if (e.key === 'Enter') go(); } });
    const go = () => {
      UI.clear(out);
      try {
        const { machine } = JT.regexToENFA(inp.value);
        const { nfa, steps } = JT.enfaToNFA(machine);
        const dfa = FA.minimize(FA.toDFA(nfa, machine.alphabet).dfa, machine.alphabet);
        out.append(h('div.sub', `ε-NFA by Thompson's construction (${machine.states.length} states)`), h('div', { style: { height: '300px' } }, UI.mini(machine, 'tall')), actions(machine, 'Regex ' + inp.value),
          h('div.sub', `Remove ε-moves → NFA (${nfa.states.length} states, no ε)`), h('div', { style: { height: '260px' } }, UI.mini(nfa, 'tall')), stepsBox(steps), actions(nfa, 'NFA of ' + inp.value),
          h('div.sub', `Subset construction + minimization → minimal DFA (${dfa.partialSize} states)`), h('div', { style: { height: '260px' } }, UI.mini(dfa.min, 'tall')), actions(dfa.min, 'Min DFA of ' + inp.value));
      } catch (e) { out.append(h('div.status.reject', '⚠ ' + e.message)); }
    };
    const back = h('div.col');
    const rev = () => UI.pickMachine(['DFA', 'NFA'], 'Choose a finite automaton', (m, label) => {
      const r = JT.faToRegex(m); UI.clear(back);
      back.append(h('div.status.accept', ['Regular expression:  ', h('b.mono', r.regex)]), stepsBox(r.steps), h('button.btn.sm', { type: 'button', onclick: () => { inp.value = r.regex; go(); window.scrollTo(0, 0); } }, '↑ Build it back into an NFA (round trip)'));
      back.prepend(h('div.sub', 'From “' + label + '”'));
    });
    go();
    return h('div.col', h('p.muted', 'JFLAP “Convert → Regular expression to NFA”. Operators: | union · * star · + plus · ? optional · ( ) grouping · ε empty string.'), h('div.row', inp, h('button.btn.primary.sm', { type: 'button', onclick: go }, 'Convert')), out,
      h('div.sect', h('h3.sect-t', 'FA → regular expression (state elimination)'), h('button.btn.sm', { type: 'button', onclick: rev }, 'Choose an automaton…'), back));
  }
  function pdaTab() {
    const ta = h('textarea.text.mono', { rows: 5, style: { width: '100%' } }, 'S -> aSb | ε'), out = h('div.col');
    const go = () => {
      UI.clear(out); const r = CFG.parseText(ta.value); if (r.errors.length) return out.append(h('div.status.reject', '⚠ ' + r.errors[0]));
      const { pda, rules } = JT.cfgToPDA(r.grammar);
      const inp = h('input.text.mono', { placeholder: 'test string', maxlength: 20, 'aria-label': 'Test string' }), res = h('div.status');
      const test = () => { const w = inp.value.replace(/\s/g, ''); const a = CFG.accepts(r.grammar, w), b = F.PDA.accepts(pda, w, { maxNodes: 40000, maxStack: 60 }); res.className = 'status ' + (a === b ? (a ? 'accept' : 'reject') : 'reject'); res.textContent = `CFG (CYK): ${a ? 'ACCEPT' : 'REJECT'}   ·   converted PDA: ${b ? 'ACCEPT' : 'REJECT'}   ${a === b ? '✔ they agree' : '✘ DISAGREE'}`; };
      out.append(h('div.sub', 'Resulting PDA — one state, acceptance by EMPTY STACK, stack starts with the start symbol'), h('div', { style: { height: '220px' } }, UI.mini(pda, 'tall')), h('div.sub', 'Transition rules'), stepsBox(rules),
        h('div.probe', inp, h('button.btn.sm.primary', { type: 'button', onclick: test }, 'Test both')), res, actions(pda, 'PDA from grammar'));
    };
    go();
    return h('div.col', h('p.muted', 'JFLAP “Convert → Convert CFG to PDA”. Each production becomes a pop-and-push move; each terminal becomes a match move.'), ta, h('button.btn.primary.sm', { type: 'button', style: { alignSelf: 'start' }, onclick: go }, 'Convert'), out);
  }
  function llTab() {
    const ta = h('textarea.text.mono', { rows: 5, style: { width: '100%' } }, "E -> TX\nX -> +TX | ε\nT -> a | (E)"), out = h('div.col');
    const go = () => {
      UI.clear(out); const r = CFG.parseText(ta.value); if (r.errors.length) return out.append(h('div.status.reject', '⚠ ' + r.errors[0]));
      const g = r.grammar, i = JT.ll1(g), set = (s) => '{' + [...s].join(', ') + '}';
      const cell = (nt, a) => { const v = i.table.get(nt + '|' + a); return h('td' + (v && v.length > 1 ? '.badrow' : ''), v ? v.map((k) => CFG.prodText(g.productions[k])).join(' ; ') : ''); };
      const inp = h('input.text.mono', { placeholder: 'string to parse, e.g. a+(a+a)', maxlength: 30, 'aria-label': 'Parse string' }), trace = h('div');
      const parse = () => { const p = JT.ll1Parse(g, i, inp.value.replace(/\s/g, '')); UI.clear(trace); trace.append(h('div.status ' + (p.accepted ? 'accept' : 'reject'), p.accepted ? '✔ accepted by the predictive parser' : '✘ rejected'), h('div', { style: { maxHeight: '240px', overflow: 'auto' } }, h('table.tbl', h('tr', h('th', 'stack (top left)'), h('th', 'input'), h('th', 'action')), p.steps.map((s) => h('tr', h('td.mono', s.stack), h('td.mono', s.input), h('td', s.action)))))); };
      out.append(h('div.status ' + (i.isLL1 ? 'accept' : 'reject'), i.isLL1 ? '✔ This grammar is LL(1): every table cell has at most one rule.' : `✘ Not LL(1): ${i.conflicts.length} conflicting cell(s) (highlighted) — e.g. ambiguity or left recursion.`),
        h('table.tbl', h('tr', h('th', 'nonterminal'), h('th', 'FIRST'), h('th', 'FOLLOW')), i.nts.map((n) => h('tr', h('td.mono', n), h('td.mono', set(i.first.get(n))), h('td.mono', set(i.follow.get(n)))))),
        h('div.sub', 'LL(1) parse table'), h('div', { style: { overflow: 'auto' } }, h('table.tbl', h('tr', h('th', ''), i.terms.map((a) => h('th.mono', a))), i.nts.map((n) => h('tr', h('th.mono', n), i.terms.map((a) => cell(n, a)))))),
        h('div.sub', 'Parse an input'), h('div.probe', inp, h('button.btn.sm.primary', { type: 'button', onclick: parse }, 'Parse')), trace);
    };
    go();
    return h('div.col', h('p.muted', 'JFLAP “Input → Build LL(1) Parse Table”: FIRST and FOLLOW sets, the predictive table, conflicts, and a step-by-step parse.'), ta, h('button.btn.primary.sm', { type: 'button', style: { alignSelf: 'start' }, onclick: go }, 'Build table'), out);
  }
  function multiTab() {
    const out = h('div.col'), ta = h('textarea.text.mono', { rows: 8, style: { width: '100%' }, 'aria-label': 'Inputs, one per line' }, 'ab\naabb\naab\n\nba'); let machine = null, label = '';
    const info = h('div.status', 'Choose a machine first.');
    const run = () => {
      if (!machine) return UI.toast('Choose a machine first.', { kind: 'warn' });
      const ins = ta.value.split('\n').map((x) => x.replace(/\s/g, ''));
      const rows = JT.multiRun(machine, ins);
      UI.clear(out); out.append(h('div.status', `${rows.filter((r) => r.accepted).length} of ${rows.length} inputs accepted`), h('table.tbl', h('tr', h('th', 'input'), h('th', 'result'), h('th', 'details')), rows.map((r) => h('tr', h('td.mono', r.w === '' ? 'ε' : r.w), h('td', UI.verdict(r.accepted)), h('td.dim', r.detail)))));
    };
    const choose = () => UI.pickMachine(['DFA', 'NFA', 'ENFA', 'CFG', 'PDA', 'TM'], 'Choose a machine for Multiple Run', (m, l) => { machine = m; label = l; info.textContent = `Machine: ${l} (${G.TYPE_LABEL[m.type]})`; });
    return h('div.col', h('p.muted', 'JFLAP “Input → Multiple Run”: feed many strings (one per line; an empty line is ε) through any machine at once.'), h('div.row', h('button.btn.sm', { type: 'button', onclick: choose }, 'Choose machine…'), info), ta, h('button.btn.primary.sm', { type: 'button', style: { alignSelf: 'start' }, onclick: run }, '▶ Run all'), out);
  }
  function levelsTab() {
    const demo = G.Store.state.settings.demo;
    const V = G.Variants, files = G.levelFiles().map((f) => Object.assign(f, { active: !V || V.current[f.level] === undefined || V.current[f.level] === f.variant }));
    files.sort((a, b) => (b.active - a.active) || (a.file < b.file ? -1 : 1));
    const rows = files.map((f) => {
      const ch = f.challenge, pr = ch && G.Game.progress(ch.id), done = pr && (pr.completed && (!f.variant || f.variant === 'base' || (pr.variants && pr.variants[f.variant] !== undefined)));
      const pub = /blueprint|given|round|machine/i.test(f.role);              // public parts of a level are never spoilers
      const open = demo || done || pub;
      const m = (() => { try { return G.loadLevelFile(f.key); } catch (e) { return null; } })();
      return h('tr', h('td.mono', (f.active ? '● ' : '') + f.file), h('td', f.level + (f.variant && f.variant !== 'base' ? ' · ' + f.variant : ' · classic')), h('td', f.role.replace(new RegExp('^' + (f.variant || '') + ' '), '')), h('td', m ? G.TYPE_LABEL[m.type] || m.type : '?'),
        h('td', open ? h('div.row', h('button.btn.sm', { type: 'button', onclick: () => UI.download(f.file, G.JFF[f.key], 'application/xml') }, '⬇ .jff'), h('button.btn.sm', { type: 'button', onclick: () => openInJflap(m, f.key) }, '☕ JFLAP'), h('button.btn.sm', { type: 'button', onclick: () => toLab(m, f.key) }, '🧪 Lab')) : h('span.dim', '🔒 reference — finish the level to open')));
    });
    return h('div.col', h('p.muted', 'Every level’s reference machine — for the classic challenge AND every extra challenge variant — is a real JFLAP file in the project’s jflap/levels/ folder (● = in play during this visit). The game loads these files to verify your machines. Edit one in JFLAP, save it, and run  node tools/build-levels.js  to update the game.'),
      h('div', { style: { overflow: 'auto' } }, h('table.tbl', h('tr', h('th', 'JFLAP file'), h('th', 'level'), h('th', 'role'), h('th', 'type'), h('th', '')), rows)));
  }
  function realTab() {
    const box = h('div.status', 'Checking for the JFLAP bridge…');
    bridge = null;
    bridgeStatus().then((st) => {
      box.className = 'status ' + (st.server && st.jar && st.java ? 'accept' : 'reject');
      box.textContent = !st.server ? 'Not running through serve.js — “Open in real JFLAP” will download the .jff instead. Start the app with:  node serve.js' : !st.java ? 'serve.js is running, but Java was not found on this computer (install a JRE).' : !st.jar ? 'serve.js and Java are ready — add JFLAP.jar to the jflap/ folder.' : '✔ Real JFLAP is connected: ' + st.jar;
    });
    return h('div.col', box, h('div.lesson-step', h('b', 'Use the real JFLAP with this game'), h('ol', { style: { margin: '.4rem 0 0 1.1rem' } },
      h('li', 'Download JFLAP.jar from https://www.jflap.org (free for education; its licence does not allow us to bundle it).'), h('li', 'Put it in the project’s jflap/ folder (jflap/JFLAP.jar).'), h('li', 'Install Java and start the game with  node serve.js  — then every “☕ Open in real JFLAP” button launches JFLAP with that machine loaded.'), h('li', 'Without the jar, those buttons download a .jff you can open in JFLAP by hand. JFLAP files can also be imported with ⬆ .jff in the Lab and Archive.'))),
      h('div.row', h('button.btn.primary', { type: 'button', onclick: () => UI.pickMachine(['DFA', 'NFA', 'ENFA', 'CFG', 'PDA', 'TM'], 'Open which machine in JFLAP?', (m, l) => openInJflap(m, l)) }, '☕ Open an archived machine in JFLAP…'),
        h('button.btn', { type: 'button', onclick: async () => { const f = await UI.pickFile('.jff,.xml'); if (!f) return; try { const m = F.JFLAP.importXML(f.text); toLab(m, f.name.replace(/\.jff$/i, '')); } catch (e) { UI.toast('Import failed: ' + e.message, { kind: 'bad' }); } } }, '⬆ Import a JFLAP file into the Lab')));
  }

  UI.screens.jflap = function (root, params = {}) {
    document.body.dataset.world = 'hub';
    const tabs = [['regex', '🔤 Regex ↔ FA', regexTab], ['pda', '🥞 CFG → PDA', pdaTab], ['ll1', '📋 LL(1) table', llTab], ['levels', '📂 Level files', levelsTab], ['multi', '▶▶ Multiple Run', multiTab], ['real', '☕ Real JFLAP', realTab]];
    const body = h('div'), seg = h('div.seg');
    const show = (k) => { UI.runCleanups(); UI.clear(body); UI.$$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.k === k)); body.append(h('div.panel', { style: { padding: '1rem' } }, tabs.find((t) => t[0] === k)[2]())); };
    tabs.forEach(([k, t]) => seg.append(h('button', { type: 'button', dataset: { k }, onclick: () => show(k) }, t)));
    root.append(h('div.screen', h('div.row', h('h2', { style: { color: '#fff' } }, '☕ JFLAP Workbench'), h('span.sp'), h('span.muted', 'JFLAP’s conversion and analysis tools, built in — plus a bridge to the real JFLAP.')), h('div', { style: { margin: '.7rem 0' } }, seg), body));
    show(params.tab || 'levels');
  };
})();
