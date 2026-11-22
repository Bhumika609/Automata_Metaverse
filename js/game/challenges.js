/* ============================================================================
 * GAME WORLD LAYER · challenges + formal verification
 * Every story has a precise formal objective underneath (blueprint §10).
 *   Regular languages  → EXACT verification (product-automaton equivalence)
 *   CFG / PDA / TM     → BOUNDED verification (all strings up to a length);
 *                        equivalence of these models is undecidable in general —
 *                        the game says so explicitly rather than pretending.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F, FA = F.FA, CFG = F.CFG, PDA = F.PDA, TM = F.TM;
  const G = (AM.G = AM.G || {});
  const rev = (s) => [...s].reverse().join('');
  const B = FA.build;
  const C = (G.CHALLENGES = []);
  G.challengeById = (id) => C.find((c) => c.id === id);
  G.challengesOf = (world) => C.filter((c) => c.world === world && !c.contract);
  const def = (o) => { o.tags = o.tags || []; o.hints = o.hints || []; C.push(o); return o; };

  /* ======================= reference machines & predicates ======================= */
  /* Every level's reference machine is a real JFLAP file in jflap/levels/*.jff (packed into G.JFF by tools/build-levels.js).
   * The game LOADS them here; edit a level in JFLAP, save the .jff, run `node tools/build-levels.js`. */
  const JFF = (id) => { const x = G.JFF && G.JFF[id]; if (!x) throw new Error('Missing JFLAP level file: ' + id); const m = F.JFLAP.importXML(x); m.levelFile = id + '.jff'; return m; };
  G.loadLevelFile = JFF;
  /** every JFLAP level file and what it is used for (powers the "Level files" browser) */
  G.levelFiles = () => Object.keys(G.JFF).map((k) => { const lv = k.split('_')[0]; const ch = G.challengeById(lv) || (lv === 'C1' || lv === 'C2' ? G.challengeById(lv) : null); return { key: k, file: k + '.jff', level: lv, variant: G.Variants ? G.Variants.fileVariant(k) : 'base', role: k.replace(lv + '_', '').replace(/_/g, ' '), challenge: ch || (lv === 'R5' ? G.challengeById('R5') : null) }; });
  const evenOnes = JFF('R1_reference');
  const noBB = JFF('R2_reference');
  const div3 = JFF('R3_reference');
  const mod3a = JFF('R4_reference');
  const bloated = JFF('R4_blueprint');
  const hasABA = JFF('R6_reference');
  const endsAB = JFF('N1_reference');
  const aStarBStarCStar = JFF('N2_reference');
  const thirdFromEnd = JFF('N3_reference');
  const subsetGiven = JFF('N4_reference');
  G.REF = { evenOnes, noBB, div3, mod3a, bloated, hasABA, endsAB, thirdFromEnd, subsetGiven };

  const balanced = (w) => { let d = 0; for (const c of w) { d += c === '(' ? 1 : c === ')' ? -1 : 0; if (d < 0) return false; } return d === 0; };
  const anbn = (w) => /^a*b*$/.test(w) && (w.match(/a/g) || []).length === (w.match(/b/g) || []).length;
  const palin = (w) => w === rev(w);
  const exprOK = (w) => /^a([+*]a)*$/.test(w);
  const wcwr = (w) => { const i = w.indexOf('c'); if (i < 0 || w.indexOf('c', i + 1) >= 0) return false; const l = w.slice(0, i), r = w.slice(i + 1); return r === rev(l); };
  const incr = (w) => (parseInt(w || '0', 2) + 1).toString(2).padStart(w.length, '0');
  const flip = (w) => [...w].map((c) => (c === '0' ? '1' : '0')).join('');

  /* ======================= test-set generation ======================= */
  function genTests(pred, alphabet, { maxLen = 8, nPos = 8, nNeg = 8, longLen = [9, 12], nLong = 6, seed = 7, extra = [] } = {}) {
    const pos = [], neg = [];
    for (const w of F.strings(alphabet, maxLen)) {
      if (pred(w)) { if (pos.length < nPos) pos.push(w); } else if (neg.length < nNeg) neg.push(w);
      if (pos.length >= nPos && neg.length >= nNeg) break;
    }
    const rng = F.rng(seed);
    let la = 0, lb = 0, guard = 0;
    while ((la < nLong / 2 || lb < nLong / 2) && guard++ < 5000) {
      const w = F.randomString(rng, alphabet, longLen[0], longLen[1]);
      if (pred(w)) { if (la < nLong / 2) { pos.push(w); la++; } } else if (lb < nLong / 2) { neg.push(w); lb++; }
    }
    for (const w of extra) if (!pos.includes(w) && !neg.includes(w)) (pred(w) ? pos : neg).push(w);
    return [...pos.map((w) => ({ w, accept: true })), ...neg.map((w) => ({ w, accept: false }))];
  }
  /** a varied, readable sample for the "examples" panel */
  function pickExamples(pred, alphabet, n = 5) {
    const all = F.strings(alphabet, 7);
    const acc = all.filter(pred), rej = all.filter((w) => !pred(w));
    const spread = (arr) => { if (arr.length <= n) return arr; const out = []; for (let i = 0; i < n; i++) out.push(arr[Math.floor((i * (arr.length - 1)) / (n - 1) * (i === 0 ? 0.0 : 0.55))]); return [...new Set(out)]; };
    return { accept: spread(acc), reject: spread(rej) };
  }
  const predOf = (ch) => ch.pred || (ch.pred = ch.reference ? (w) => FA.accepts(ch.reference, w) : () => false);
  const _testCache = new Map(), _exCache = new Map();
  const ckey = (ch) => ch.id + ':' + (ch.variantId || 'base');
  G.testsFor = (ch) => {
    if (_testCache.has(ckey(ch))) return _testCache.get(ckey(ch));
    let t;
    if (ch.model === 'TM') {
      t = F.strings(ch.alphabet, ch.tmMaxLen).filter((w) => !ch.tmSkipEmpty || w.length).filter((w) => !ch.tmFilter || ch.tmFilter(w)).map((w) => ({ w, expected: ch.tmKind === 'transform' ? ch.transform(w) : ch.pred(w) }));
    } else t = genTests(predOf(ch), ch.alphabet, ch.testOpts || {});
    _testCache.set(ckey(ch), t); return t;
  };
  G.examplesFor = (ch) => {
    if (_exCache.has(ckey(ch))) return _exCache.get(ckey(ch));
    let e;
    if (ch.model === 'TM' && ch.tmKind === 'transform') { const ins = ['0', '10', '0110', '1011', '11111', '100', '011'].filter((w) => !ch.tmFilter || ch.tmFilter(w)); e = { pairs: ins.map((w) => [w, ch.transform(w)]).filter(([, o]) => o !== null).slice(0, 5) }; }
    else if (ch.model === 'TM') e = pickExamples(ch.pred, ch.alphabet, 5);
    else e = pickExamples(predOf(ch), ch.alphabet, 5);
    if (ch.extraExamples) for (const w of ch.extraExamples) (predOf(ch)(w) ? e.accept : e.reject).push(w);
    _exCache.set(ckey(ch), e); return e;
  };

  /** size metric used for the efficiency score */
  G.sizeOf = (ch, m) => (ch.model === 'FA' ? m.states.length : ch.model === 'CFG' ? m.productions.length : m.transitions.length);

  /** ============================ REGULAR CITY ============================ */
  def({ id: 'R1', world: 'regular', order: 1, kind: 'build', model: 'FA', allowed: ['DFA'], alphabet: ['0', '1'], tags: ['dfa'], max: 700, optimal: 2, sizeLabel: 'states', budget: 8, par: 240, hidden: true,
    title: 'The Even-One Security Gate', tagline: 'Infer the hidden rule from evidence', archiveName: 'Even-One Security DFA', object: 'gate_main',
    story: `Regular City's Main Security Gate flashes red. The guards will not tell you the rule — but they will let you probe it: type a pass-code and the gate answers ACCEPT or REJECT. Study the examples, probe a few strings, infer the language, then build the DFA that powers the gate.`,
    formal: 'L = { w ∈ {0,1}* | w contains an even number of 1s }', objective: 'Build a DFA over {0,1} that accepts exactly the language of the gate.',
    reference: evenOnes, optional: { text: 'Use the minimum number of states (2).', check: (m) => FA.isMinimal(m, ['0', '1']) },
    hints: ['Formal rule revealed: the gate accepts strings with an EVEN number of 1s (zero counts as even, so the empty string is accepted).', 'You only need to remember one fact about everything read so far: is the count of 1s even or odd? That is two states.', 'Blueprint: state “even” (initial AND accepting) and state “odd”. Reading 1 flips between them; reading 0 loops on the same state.'],
    concepts: ['Alphabet, strings, languages', 'DFA & deterministic transitions'] });

  def({ id: 'R2', world: 'regular', order: 2, kind: 'build', model: 'FA', allowed: ['DFA'], alphabet: ['a', 'b'], tags: ['dfa'], max: 600, optimal: 2, sizeLabel: 'states', budget: 8, par: 240, hidden: false,
    title: 'The Jam-Proof Vending Controller', tagline: 'Forbid a pattern', archiveName: 'No-Double-B Vending DFA', object: 'vending',
    story: `The vending controller jams whenever a customer presses button b twice in a row. Engineers want a DFA that dispenses (accepts) every button sequence that never contains bb. Buttons: a and b.`,
    formal: 'L = { w ∈ {a,b}* | w does not contain the substring "bb" }', objective: 'Build a DFA over {a,b} that rejects exactly the strings containing bb.',
    reference: noBB, optional: { text: 'Make the DFA complete: every state has a transition on every symbol (no implicit dead state).', check: (m) => FA.isDeterministic(m) && FA.isComplete(m, ['a', 'b']) },
    hints: ['Think about what you need to remember: only whether the LAST symbol was a b.', 'States: “safe” (last symbol was not b) and “just-b”. Reading b from just-b is the forbidden pattern.', 'A missing transition rejects automatically. To make the machine complete add a trap state “dead” that loops on a and b.'],
    concepts: ['Forbidden substrings', 'Implicit vs explicit dead state'] });

  def({ id: 'R3', world: 'regular', order: 3, kind: 'build', model: 'FA', allowed: ['DFA'], alphabet: ['0', '1'], tags: ['dfa'], max: 800, optimal: 3, sizeLabel: 'states', budget: 10, par: 300, hidden: true,
    title: 'Checkpoint Delta — Divisible by Three', tagline: 'Arithmetic with finite memory', archiveName: 'Div-by-3 Checkpoint DFA',
    story: `Checkpoint Delta reads binary tokens, most significant bit first. Some tokens glow green. Probe the checkpoint, find what the green tokens have in common, and build the DFA that validates them.`,
    formal: 'L = { w ∈ {0,1}* | the binary number w is divisible by 3 }   (ε counts as 0)', objective: 'Build the minimal-memory DFA for binary multiples of 3.',
    reference: div3, optional: { text: 'Use exactly the minimum number of states (3).', check: (m) => FA.isMinimal(m, ['0', '1']) },
    hints: ['Formal rule revealed: w is accepted iff its binary value is a multiple of 3 (the empty string is 0).', 'Track the remainder mod 3. Reading bit b turns value v into 2v + b, so the new remainder is (2r + b) mod 3.', 'States r0 (initial, accepting), r1, r2. r0: 0→r0, 1→r1.  r1: 0→r2, 1→r0.  r2: 0→r1, 1→r2.'],
    concepts: ['Regular languages', 'Modular arithmetic in states'] });

  def({ id: 'R4', world: 'regular', order: 4, kind: 'build', model: 'FA', allowed: ['DFA'], alphabet: ['a', 'b'], tags: ['dfa'], max: 500, optimal: 3, sizeLabel: 'states', budget: 8, par: 300, hidden: false, requireMinimal: true,
    title: 'Reactor Audit — Minimize It', tagline: 'Replace a bloated machine with a minimal one', archiveName: 'Minimal Reactor DFA',
    story: `The legacy reactor controller counts pulses (a) modulo 6 but only cares whether the count is divisible by 3 — it wastes power on 6 states. The audit demands a replacement that accepts the SAME language with the minimum possible number of states.`,
    formal: 'Replace the 6-state blueprint by a minimal DFA with the same language: L = { w | #a(w) ≡ 0 (mod 3) }.', objective: 'Build a DFA equivalent to the blueprint with exactly the minimum number of states.',
    reference: mod3a, blueprint: bloated, blueprintLabel: 'Legacy reactor DFA (6 states)', optional: { text: 'Make the DFA complete (a transition on every symbol from every state).', check: (m) => FA.isDeterministic(m) && FA.isComplete(m, ['a', 'b']) },
    hints: ['States are equivalent if no string can tell them apart. Which of the six states behave identically?', 'k0 and k3 are both accepting and have the same future; so are k1/k4 and k2/k5 (counting mod 6 vs mod 3).', 'Open the Minimization Lens (costs a hint): partition refinement shows exactly which states merge → 3 states.'],
    concepts: ['DFA minimization', 'State equivalence'], lens: 'minimize' });

  def({ id: 'R5', world: 'regular', order: 5, kind: 'twin', model: 'FA', allowed: ['DFA'], alphabet: [], tags: ['equivalence'], max: 500, optimal: 0, sizeLabel: '', budget: 12, par: 300, hidden: false,
    title: 'Twin Gates — Spot the Difference', tagline: 'Counterexamples & equivalence', archiveName: 'Twin Gates Report',
    story: `Three pairs of gates look identical from the street. Are they running the same program? Probe each pair with strings. If they differ, find a string that exactly ONE gate accepts. If you believe they are equivalent, declare it — the Equivalence Engine will check your claim with a product automaton.`,
    formal: 'For each pair (A, B): decide whether L(A) = L(B); if not, exhibit w ∈ L(A) △ L(B).', objective: 'Solve all three rounds.',
    rounds: [
      { label: 'Round 1', alphabet: ['0', '1'], a: JFF('R5_round1_A'), b: JFF('R5_round1_B'), nameA: 'Gate A', nameB: 'Gate B' },
      { label: 'Round 2', alphabet: ['a', 'b'], a: JFF('R5_round2_C'), b: JFF('R5_round2_D'), nameA: 'Gate C', nameB: 'Gate D' },
      { label: 'Round 3', alphabet: ['0', '1'], a: JFF('R5_round3_E'), b: JFF('R5_round3_F'), nameA: 'Gate E', nameB: 'Gate F' },
    ],
    optional: { text: 'Submit the SHORTEST possible distinguishing string in both rounds that differ.', check: (_m, ctx) => !!ctx.shortestBoth },
    hints: ['Probe the pair with the empty string and with each single symbol first — differences are often tiny.', 'Round 2 looks different but is it? Compare what each gate remembers: does Gate D’s second counter ever affect acceptance?', 'The shortest distinguishing string has length 3 in Round 1 and length 4 in Round 3; Round 2 are equivalent (declare it!).'],
    concepts: ['Equivalence of DFAs', 'Counterexample (distinguishing string)', 'Product construction'] });

  def({ id: 'R6', world: 'regular', order: 6, kind: 'build', model: 'FA', allowed: ['DFA'], alphabet: ['a', 'b'], tags: ['dfa'], max: 400, optimal: 4, sizeLabel: 'states', budget: 10, par: 300, hidden: true,
    title: 'Traffic Light Sequencer', tagline: 'Detect a pattern in a stream', archiveName: 'Pattern-ABA Sequencer DFA',
    story: `The traffic sequencer must flash the emergency lane the moment a certain signal pattern appears anywhere in the stream — and then keep it flashing. Probe the sequencer and find the pattern.`,
    formal: 'L = { w ∈ {a,b}* | w contains the substring "aba" }', objective: 'Build the DFA that accepts exactly the signal streams containing the pattern.',
    reference: hasABA, optional: { text: 'Use exactly the minimum number of states (4).', check: (m) => FA.isMinimal(m, ['a', 'b']) },
    hints: ['Formal rule revealed: accept every string that contains the substring aba.', 'Remember how much of “aba” you have matched so far: nothing, “a”, “ab”, or all of it.', 'States s0,s1,s2,s3 = matched 0,1,2,3 symbols. After “ab” an a completes the match; after “a” another a stays at s1; a b from s2 restarts at s0. s3 is accepting and loops on everything.'],
    concepts: ['Substring recognition', 'KMP-style state design'] });

  /** ============================ NFA DISTRICT ============================ */
  def({ id: 'N1', world: 'nfa', order: 1, kind: 'build', model: 'FA', allowed: ['NFA', 'ENFA'], alphabet: ['a', 'b'], tags: ['nfa'], max: 800, optimal: 3, sizeLabel: 'states', budget: 8, par: 240, hidden: false,
    title: 'The Clone Maze', tagline: 'Nondeterminism = physical cloning', archiveName: 'Ends-With-AB Clone NFA', object: 'scanner',
    story: `You step into a maze with many possible paths. At a fork your character SPLITS into clones — each clone explores one path. If ANY clone reaches the exit the input is accepted. Dead clones simply vanish. Build the NFA whose exit opens exactly when the input ends in “ab”.`,
    formal: 'L = { w ∈ {a,b}* | w ends with "ab" }', objective: 'Build an NFA (or ε-NFA) for the language of strings that end with ab.',
    reference: endsAB, optional: { text: 'Use real nondeterminism: at least one state with two moves on the same symbol.', check: (m) => !FA.isDeterministic(m) },
    hints: ['The NFA can GUESS that the final “ab” starts right now. A clone that guesses wrong just dies.', 'State p loops on a and b. On an a it may also move to q (the guess). From q a b leads to r.', 'p —a→ p, p —b→ p, p —a→ q, q —b→ r. Make p initial and r accepting.'],
    concepts: ['NFA', 'Nondeterministic branching', 'Acceptance by ANY path'] });

  def({ id: 'N2', world: 'nfa', order: 2, kind: 'build', model: 'FA', allowed: ['ENFA'], alphabet: ['a', 'b', 'c'], tags: ['nfa', 'enfa'], max: 700, optimal: 3, sizeLabel: 'states', budget: 10, par: 300, hidden: false,
    title: 'Epsilon Portals', tagline: 'Teleport without reading input', archiveName: 'A*B*C* Portal ε-NFA',
    story: `Three districts are chained together: first only a-streets, then only b-streets, then only c-streets. Between districts sit ε-portals — they teleport your clone without consuming any input symbol. Build an ε-NFA for walks that visit the districts in order (any district may be skipped).`,
    formal: 'L = { aⁱ bʲ cᵏ | i, j, k ≥ 0 }  (a*b*c*)', objective: 'Build an ε-NFA for a*b*c* using ε-portals.',
    reference: aStarBStarCStar, optional: { text: 'Use at least two ε-portals.', check: (m) => FA.epsCount(m) >= 2 },
    hints: ['Give each district its own state that loops on its own letter.', 'A portal (ε-transition) lets a clone move on to the next district without reading anything — this also lets districts be skipped.', 'q0 loops a, q1 loops b, q2 loops c. Add ε from q0→q1 and q1→q2. All three states are accepting… or make q2 accepting and keep the ε-portals.'],
    concepts: ['ε-NFA', 'ε-closure', 'Concatenation of languages'] });

  def({ id: 'N3', world: 'nfa', order: 3, kind: 'build', model: 'FA', allowed: ['NFA', 'ENFA'], alphabet: ['0', '1'], tags: ['nfa'], max: 700, optimal: 4, sizeLabel: 'states', budget: 4, par: 300, hidden: false,
    title: 'Third From the Last', tagline: 'Why nondeterminism is succinct', archiveName: 'Third-From-Last NFA',
    story: `A prophecy engine reads a binary stream. It fires when the THIRD symbol from the end is a 1. A DFA must remember the last three symbols (8 states!), but a clone can simply guess “this is the third-to-last symbol” and verify two more. Solve it using as few probes as you can — reason, don't guess.`,
    formal: 'L = { w ∈ {0,1}* | |w| ≥ 3 and the 3rd symbol from the right is 1 }', objective: 'Build an NFA with 4 states.',
    reference: thirdFromEnd, optional: { text: 'Solve it with FEWER THAN 5 test strings.', check: (_m, ctx) => (ctx.tests || 0) < 5 },
    hints: ['Let one state loop on everything, waiting. On a 1 it can ALSO guess “this 1 is the one”.', 'After the guessed 1, exactly two more symbols (any) must follow, then the string must end.', 'a loops on 0,1; a —1→ b; b —0,1→ c; c —0,1→ d; d accepting.'],
    concepts: ['NFA vs DFA size', 'Exponential blow-up of subset construction'] });

  def({ id: 'N4', world: 'nfa', order: 4, kind: 'build', model: 'FA', allowed: ['DFA'], alphabet: ['a', 'b'], tags: ['dfa', 'subset'], max: 700, optimal: 'auto', sizeLabel: 'states', budget: 10, par: 420, hidden: false,
    title: 'Subset Forge', tagline: 'Merge the clones into one super-state', archiveName: 'Forged Subset DFA',
    story: `The district's ancient NFA works, but the Forge only accepts deterministic machines. Convert it! The trick is subset construction: all clones alive at the same moment are merged into ONE super-state {p,q,…}. Build a DFA with exactly the same language.`,
    formal: 'Find a DFA D with L(D) = L(N) where N is the blueprint NFA (accepts strings containing “ab” or ending in “bb”).', objective: 'Build a DFA equivalent to the blueprint NFA.',
    reference: subsetGiven, blueprint: subsetGiven, blueprintLabel: 'Blueprint NFA', optional: { text: 'Make your DFA minimal.', check: (m) => FA.isMinimal(m, ['a', 'b']) },
    hints: ['Start from the set {p}. For each symbol compute where ALL states of the set can go — that set is a new DFA state.', '{p} —a→ {p,q}, {p} —b→ {p,s}. A set is accepting if it contains r or t. Continue until no new sets appear.', 'Open the Subset Lab (costs a hint): it builds the subset-construction table step by step.'],
    concepts: ['Subset construction', 'NFA → DFA'], lens: 'subset' });

  /** ============================ GRAMMAR FOREST ============================ */
  def({ id: 'G1', world: 'cfg', order: 1, kind: 'build', model: 'CFG', allowed: ['CFG'], alphabet: ['a', 'b'], tags: ['cfg'], max: 800, optimal: 2, sizeLabel: 'productions', budget: 8, par: 300, hidden: false, maxLen: 11,
    title: 'Mirror Trees — aⁿbⁿ', tagline: 'Plant seeds, grow a derivation tree', archiveName: 'Mirror-Tree Grammar', object: 'seeder', pred: anbn,
    story: `In the Grammar Forest, production rules are SEEDS. Each rule expands a nonterminal and the derivation tree grows. The ancient Mirror Trees grow equal numbers of a-leaves on the left and b-leaves on the right. Write the grammar that grows exactly them.`,
    formal: 'L = { aⁿbⁿ | n ≥ 0 }', objective: 'Write a context-free grammar for aⁿbⁿ.',
    optional: { text: 'Submit the grammar in Chomsky Normal Form.', check: (g) => CFG.isCNF(g) },
    hints: ['The two ends grow together: whenever you add an a on the left you add a b on the right.', 'S → a S b wraps a smaller tree; you also need a way to stop: S → ε.', 'S -> aSb | ε   (two productions).'],
    concepts: ['CFG', 'Derivations', 'Parse trees'], lens: 'cnf', extraExamples: [] , testOpts: { maxLen: 8, extra: ['aaaaabbbbb', 'aaaaaaabbbbbbb'] } });

  def({ id: 'G2', world: 'cfg', order: 2, kind: 'build', model: 'CFG', allowed: ['CFG'], alphabet: ['(', ')'], tags: ['cfg'], max: 700, optimal: 2, sizeLabel: 'productions', budget: 8, par: 300, hidden: false, maxLen: 11,
    title: 'Balanced Canopy — Parentheses', tagline: 'Nested structure', archiveName: 'Balanced-Parentheses Grammar', pred: balanced,
    story: `The canopy is held up by balanced branches: every ( must be closed by a matching ), properly nested. Write the grammar for all balanced parenthesis strings.`,
    formal: 'L = { w ∈ {(,)}* | w is a balanced parenthesis string }', objective: 'Write a CFG for balanced parentheses.',
    optional: { text: 'Make the grammar UNAMBIGUOUS (every string has exactly one parse tree, checked up to length 8).', check: (g) => !CFG.findAmbiguity(g, ['(', ')'], 8).ambiguous },
    hints: ['A balanced string is empty, or it is (balanced) followed by more balanced stuff.', 'Try S → ( S ) S | ε   (that also happens to be unambiguous).', 'S -> (S)S | ε.  The common alternative S -> SS | (S) | ε is correct but ambiguous.'],
    concepts: ['Dyck language', 'Nested recursion', 'Ambiguity'], testOpts: { maxLen: 8, extra: ['((()))', '()()()', '(()(()))'] } });

  def({ id: 'G3', world: 'cfg', order: 3, kind: 'build', model: 'CFG', allowed: ['CFG'], alphabet: ['a', 'b'], tags: ['cfg'], max: 600, optimal: 5, sizeLabel: 'productions', budget: 8, par: 300, hidden: false, maxLen: 11,
    title: 'Palindrome Grove', tagline: 'Mirror strings of any length', archiveName: 'Palindrome Grammar', pred: palin,
    story: `Trees in the Grove grow outward from the centre. A growth ring reads the same forwards and backwards. Write the grammar for all palindromes over {a,b} — including odd and even lengths and the empty string.`,
    formal: 'L = { w ∈ {a,b}* | w = wᴿ }', objective: 'Write a CFG for palindromes over {a,b}.',
    optional: { text: 'Submit the grammar in Chomsky Normal Form.', check: (g) => CFG.isCNF(g) },
    hints: ['Grow from the middle outwards: wrap the same letter on both sides.', 'Wrapping rules: S → aSa and S → bSb. The middle can be empty (even length) or a single letter (odd length).', 'S -> aSa | bSb | a | b | ε'],
    concepts: ['Palindromes', 'Odd/even centre'], testOpts: { maxLen: 8, extra: ['abbba', 'aabbaa', 'ababa'] } });

  const ambGrammar = JFF('G4_given');
  def({ id: 'G4', world: 'cfg', order: 4, kind: 'ambig', model: 'CFG', allowed: ['CFG'], alphabet: ['a', '+', '*'], tags: ['cfg', 'ambiguity'], max: 600, optimal: 3, sizeLabel: 'productions', budget: 8, par: 420, hidden: false, maxLen: 8,
    title: 'Ambiguity Hunt', tagline: 'Two trees, one string', archiveName: 'Unambiguous Expression Grammar', pred: exprOK, given: ambGrammar,
    story: `This tree grows in two different ways from the SAME seed string — a sign of ambiguity. First, find a string that has two distinct parse trees in the given grammar. Then repair the forest: write an UNAMBIGUOUS grammar for the same language.`,
    formal: 'Given E → E+E | E*E | a:  (1) find w with ≥ 2 parse trees;  (2) write G′ with L(G′) = L(G) and every string having exactly one parse tree.', objective: 'Step 1: expose the ambiguity. Step 2: write an unambiguous grammar.',
    optional: { text: 'Encode precedence: in a+a*a and a*a+a the tree must split at “+” first.', check: (g) => ['a+a*a', 'a*a+a'].every((w) => { const t = CFG.parseTrees(g, w, 2); return t.length === 1 && t[0].children.some((c) => c.term && c.sym === '+'); }) },
    hints: ['Try the shortest strings with two operators, like a+a+a. Which way can it group?', 'a+a+a = (a+a)+a or a+(a+a). Make the grammar force ONE grouping, e.g. right recursion.', 'E -> a | a+E | a*E   (unambiguous). Precedence: E -> T+E | T, T -> a*T | a.'],
    concepts: ['Ambiguity', 'Parse trees', 'Unambiguous grammars'] });

  /** ============================ STACK FACTORY ============================ */
  def({ id: 'P1', world: 'pda', order: 1, kind: 'build', model: 'PDA', allowed: ['PDA'], alphabet: ['a', 'b'], tags: ['pda'], max: 900, optimal: 5, sizeLabel: 'transitions', budget: 8, par: 360, hidden: false, maxLen: 10,
    title: 'The Stack Assembler — aⁿbⁿ', tagline: 'Memory you can see', archiveName: 'aⁿbⁿ Stack PDA', object: 'crate', pred: anbn,
    story: `Crates (a) arrive first and are pushed on the stack; then bays (b) arrive and each pops one crate. The line is balanced only if the stack ends exactly empty. Can a DFA do this? Complete the Memory Check first, then build the PDA.`,
    formal: 'L = { aⁿbⁿ | n ≥ 0 }   (acceptance by final state, bottom marker Z)', objective: 'Build a PDA for aⁿbⁿ.',
    optional: { text: 'Complete the Memory Check lesson: prove no DFA recognises aⁿbⁿ.', check: (_m, ctx) => !!ctx.memoryCheck },
    hints: ['Each a pushes a marker; each b pops one. When the input ends the only thing left on the stack should be the bottom marker Z.', 'q0 reads a’s (push A). A first b moves to q1 (pop A). q1 keeps popping on b. From q0 or q1, an ε-move that pops Z and pushes Z goes to the accepting state q2.', 'q0: a,ε→A loop. q0: b,A→ε to q1. q1: b,A→ε loop. q0: ε,Z→Z to q2. q1: ε,Z→Z to q2. q2 final.'],
    concepts: ['PDA', 'Stack memory', 'Why a DFA is not enough'], lens: 'memory', testOpts: { maxLen: 8, extra: ['aaaaabbbbb', 'aaaaaaabbbbbbb'] } });

  def({ id: 'P2', world: 'pda', order: 2, kind: 'build', model: 'PDA', allowed: ['PDA'], alphabet: ['(', ')'], tags: ['pda'], max: 750, optimal: 3, sizeLabel: 'transitions', budget: 8, par: 360, hidden: false, maxLen: 10,
    title: 'Parenthesis Press', tagline: 'Matching and nesting', archiveName: 'Balanced-Parentheses PDA', pred: balanced,
    story: `The press only works on correctly nested brackets. Each ( pushes a plate; each ) removes one; the press must never try to remove a plate that is not there (stack underflow) and must end empty.`,
    formal: 'L = { w ∈ {(,)}* | w is balanced }', objective: 'Build a PDA for balanced parentheses.',
    optional: { text: 'Use acceptance by EMPTY STACK instead of a final state.', check: (m) => m.acceptMode === 'empty' },
    hints: ['One stack symbol is enough: push on (, pop on ).', 'A ) with nothing to pop has no transition → the computation dies → reject. That is exactly stack underflow.', 'q0: (,ε→A loop. q0: ),A→ε loop. q0: ε,Z→Z → q1 (final).'],
    concepts: ['Stack underflow', 'Final-state vs empty-stack acceptance'], testOpts: { maxLen: 8, extra: ['((()))', '()()()', '(()(()))'] } });

  def({ id: 'P3', world: 'pda', order: 3, kind: 'build', model: 'PDA', allowed: ['PDA'], alphabet: ['a', 'b', 'c'], tags: ['pda'], max: 750, optimal: 6, sizeLabel: 'transitions', budget: 8, par: 420, hidden: false, maxLen: 8,
    title: 'The Mirror Mould — w c wᴿ', tagline: 'Reverse with a stack', archiveName: 'Mirror-Mould PDA', pred: wcwr,
    story: `The mould casts a part from a pattern w, a divider c, then the pattern reversed. A stack reverses strings for free: push while reading w, then pop while reading wᴿ.`,
    formal: 'L = { w c wᴿ | w ∈ {a,b}* }', objective: 'Build a PDA for w c wᴿ over {a,b,c}.',
    optional: { text: 'Make it a DETERMINISTIC PDA (no two applicable moves).', check: (m) => PDA.isDeterministic(m) },
    hints: ['Phase 1: read a/b and push the matching marker. Phase 2: after the c, read a/b and pop the matching marker.', 'The c tells you where the middle is — no guessing needed, so the PDA can be deterministic.', 'q0: a,ε→A; b,ε→B (loops). q0→q1 on c,ε→ε. q1: a,A→ε; b,B→ε (loops). q1: ε,Z→Z → q2 (final).'],
    concepts: ['Stack reversal', 'Deterministic PDA'], testOpts: { maxLen: 6, extra: ['abcba', 'aabcbaa', 'bbcbb'] } });

  /** ============================ TURING LAB ============================ */
  def({ id: 'T1', world: 'tm', order: 1, kind: 'build', model: 'TM', allowed: ['TM'], alphabet: ['0', '1'], tags: ['tm'], max: 500, optimal: 3, sizeLabel: 'transitions', budget: 8, par: 300, tmKind: 'transform', tmMaxLen: 6, transform: flip,
    title: 'The Bit Flipper', tagline: 'Read → write → move', archiveName: 'Bit-Flipper TM',
    story: `The lab's first machine rewrites a tape: every 0 becomes 1 and every 1 becomes 0. The head starts on the leftmost cell. When the machine reaches a final state it halts and the tape is inspected.`,
    formal: 'f(w) = w with every bit complemented. Head starts at the leftmost symbol; the machine must reach a final state with f(w) on the tape.', objective: 'Build a Turing machine that complements the tape.',
    optional: { text: 'Use at most 2 states.', check: (m) => m.states.length <= 2 },
    hints: ['Sweep right once, flipping each cell as you go.', 'On 0 write 1 and move right; on 1 write 0 and move right; on blank (end of input) enter the final state.', 'q0: 0/1,R  q0: 1/0,R  q0: □/□,S → qf (final).'],
    concepts: ['Tape, head, read/write/move'] });

  def({ id: 'T2', world: 'tm', order: 2, kind: 'build', model: 'TM', allowed: ['TM'], alphabet: ['0', '1'], tags: ['tm'], max: 700, optimal: 6, sizeLabel: 'transitions', budget: 8, par: 420, tmKind: 'transform', tmMaxLen: 6, tmSkipEmpty: true, transform: incr, object: 'tape',
    title: 'Binary Incrementer', tagline: 'Arithmetic on a tape', archiveName: 'Binary-Incrementer TM',
    story: `Add one to a binary number written on the tape (most significant bit first). Carries ripple leftwards, and the number may grow by one digit (111 → 1000). The head starts on the leftmost bit.`,
    formal: 'f(w) = binary(value(w) + 1), keeping at least |w| digits.', objective: 'Build a Turing machine that increments a binary number.',
    optional: { text: 'Finish within 2n + 2 steps on every test input.', check: (m) => G.testsFor(G.challengeById('T2')).every((t) => { const r = TM.run(m, t.w, { traceLimit: 0, maxSteps: 400 }); return r.status === 'accepted' && r.steps <= 2 * t.w.length + 2; }) },
    hints: ['Go to the right end first, then work leftwards doing the carry.', 'Moving left: a 1 becomes 0 and the carry continues; the first 0 (or a blank, if the number grew) becomes 1 and you stop.', 'q0: 0,1 → R loop; q0: □ → L to q1. q1: 1/0,L loop; q1: 0/1 → qf; q1: □/1 → qf.'],
    concepts: ['Carry propagation', 'Two-phase TM design'] });

  def({ id: 'T3', world: 'tm', order: 3, kind: 'build', model: 'TM', allowed: ['TM'], alphabet: ['a', 'b'], tags: ['tm'], max: 600, optimal: 11, sizeLabel: 'transitions', budget: 10, par: 600, tmKind: 'decide', tmMaxLen: 8, pred: anbn,
    title: 'The aⁿbⁿ Decider', tagline: 'Mark, match, repeat', archiveName: 'aⁿbⁿ Decider TM',
    story: `A decider must ALWAYS halt: accept strings in the language, reject everything else. Mark one a with X, find one b and mark it Y, return, repeat. If everything is marked in matching pairs, accept.`,
    formal: 'Decide L = { aⁿbⁿ | n ≥ 0 }: halt in a final state iff w ∈ L; otherwise halt (no transition) in a non-final state.', objective: 'Build a decider Turing machine for aⁿbⁿ.',
    optional: { text: 'Use at most 5 states.', check: (m) => m.states.length <= 5 },
    hints: ['Cross off one a (write X), then walk right to the first unmatched b and cross it off (write Y). Come back and repeat.', 'q0 sees a→X (→q1: seek b), Y→(→q3: verify rest is all Y), or □→accept. q1 skips a/Y until b→Y (→q2). q2 walks left to X then steps right back to q0.', 'q0: a/X,R→q1; Y/Y,R→q3; □→qf. q1: a,Y→R; b/Y,L→q2. q2: a,Y→L; X/X,R→q0. q3: Y→R; □→qf.'],
    concepts: ['Deciders', 'Marking technique', 'Halting'] });

  /** ============================ VOID ZONE ============================ */
  /** TM builder for the Void machines: rules = [from, read, write, move, to] */
  const TMB = (start, finals, rules) => {
    const names = [];
    const add = (n) => { if (!names.includes(n)) names.push(n); };
    add(start); rules.forEach((r) => { add(r[0]); add(r[4]); }); finals.forEach(add);
    const m = { type: 'TM', alphabet: [], blank: '_', states: names.map((n) => ({ id: n, name: n, initial: n === start, final: finals.includes(n) })), transitions: rules.map((r, i) => ({ id: 'v' + i, from: r[0], read: r[1], write: r[2], move: r[3], to: r[4] })) };
    return F.autoLayout(m);
  };
  /** binary counter: halts when the counter first shows K consecutive 1s (value 2^K − 1) */
  const counter = (K) => {
    const R = [['init', '>', '>', 'R', 'inc'], ['inc', '1', '0', 'R', 'inc'], ['inc', '0', '1', 'L', 'back'], ['inc', '_', '1', 'L', 'back'],
      ['back', '0', '0', 'L', 'back'], ['back', '1', '1', 'L', 'back'], ['back', '>', '>', 'R', 'c1'],
      ['rew', '0', '0', 'L', 'rew'], ['rew', '1', '1', 'L', 'rew'], ['rew', '>', '>', 'R', 'inc']];
    for (let k = 1; k <= K; k++) { const nx = k === K ? 'e' : 'c' + (k + 1); R.push(['c' + k, '1', '1', 'R', nx], ['c' + k, '0', '0', 'L', 'rew'], ['c' + k, '_', '_', 'L', 'rew']); }
    R.push(['e', '_', '_', 'S', 'H'], ['e', '0', '0', 'L', 'rew'], ['e', '1', '1', 'L', 'rew']);
    return TMB('init', ['H'], R);
  };
  G.VOID_MACHINES = [
    { id: 'A', name: 'Sprinter', input: '1111', machine: JFF('V1_machineA'), truth: 'halts', blurb: 'Runs along the tape of 1s.',
      reveal: 'Sprinter halts after 5 steps. Observation PROVED it halts — halting is semi-decidable: if a machine halts, running it long enough shows that.' },
    { id: 'B', name: 'Slow Counter (K=5)', input: '>', machine: JFF('V1_machineB'), truth: 'halts', blurb: 'Counts up in binary until 11111.',
      reveal: 'Counter(5) halts — but only after hundreds of steps. At 100 steps it looked like it might never stop. Patience paid off!' },
    { id: 'C', name: 'Pacer', input: '', machine: JFF('V1_machineC'), truth: 'loops', blurb: 'Steps right, steps left, forever.',
      reveal: 'Pacer returns to the exact same configuration (same state, same head position, same tape). A repeated configuration PROVES it will never halt — but this trick only works for special machines.' },
    { id: 'D', name: 'Runaway', input: '', machine: JFF('V1_machineD'), truth: 'unknown', hidden: 'never halts', blurb: 'Writes 1s and runs off to the right.',
      reveal: 'Runaway never halts (it writes 1s forever) — but NO number of observed steps could prove it. Its configurations never repeat, so there is no loop to detect.' },
    { id: 'E', name: 'Mystery Counter (K=18)', input: '>', machine: JFF('V1_machineE'), truth: 'unknown', hidden: 'halts after millions of steps', blurb: 'Same program as the Slow Counter… with a bigger K.',
      reveal: 'Mystery Counter is the SAME program as the Slow Counter but with K = 18: it does halt, after millions of steps. At every limit the game offers it looks exactly like Runaway. Observation alone can never tell them apart.' },
  ];
  G.VOID_LIMITS = [10, 100, 1000, 10000, 100000, 1000000];
  def({ id: 'V1', world: 'void', order: 1, kind: 'void', model: 'VOID', allowed: [], alphabet: [], tags: ['void'], max: 600, optimal: 0, sizeLabel: '', budget: 14, par: 420, hidden: false,
    title: 'The Halting Probe', tagline: 'What can running a machine prove?', archiveName: 'Halting Probe Report',
    story: `Five machines hum in the Void. Run each for 10, 100, 1 000 … 1 000 000 steps. For every machine decide what your observations actually PROVE: that it halts, that it never halts, or nothing yet. Careful — a machine that is still running does not prove anything.`,
    formal: 'HALT = { ⟨M, w⟩ | M halts on w } is recognisable (run it) but not decidable.', objective: 'Classify each machine by what your experiments prove.', optional: { text: 'Use at most 14 runs in total.', check: (_m, ctx) => (ctx.tests || 0) <= 14 },
    hints: ['A machine that halts reveals itself — if you run it long enough. Try larger step limits.', 'If a configuration (state, head, tape) ever repeats exactly, the machine is in a loop and can never halt — the probe reports this.', 'Runaway and Mystery Counter both look “still running” at every limit. Neither can be proved either way by observation.'],
    concepts: ['Halting problem', 'Semi-decidability', 'Limits of simulation'] });

  def({ id: 'V2', world: 'void', order: 2, kind: 'void', model: 'VOID', allowed: [], alphabet: [], tags: ['void'], max: 400, optimal: 0, sizeLabel: '', budget: 6, par: 420, hidden: false,
    title: 'The Paradox Machine', tagline: 'Why no algorithm can decide halting', archiveName: 'Paradox Report',
    story: `Suppose a perfect oracle H could decide, for every machine M and input w, whether M halts. Turing's diagonal trick builds a machine D that does the opposite of whatever H predicts about D itself. Walk through the argument — then sort real problems into decidable and undecidable.`,
    formal: 'Assume H decides HALT. Define D(M): if H(M,M) says “halts” then loop forever, else halt. Consider D(D).', objective: 'Answer the questions of the proof, then classify the problems.',
    optional: { text: 'Answer every question correctly on the first try.', check: (_m, ctx) => !!ctx.firstTry },
    hints: ['If H(D,D) answers “halts”, D deliberately loops — so what does D(D) really do?', 'If H(D,D) answers “loops”, D deliberately halts. Either answer is wrong, so H cannot exist.', 'Decidable here: DFA equivalence, DFA emptiness, CFG membership. Undecidable: halting, CFG equivalence, CFG ambiguity, acceptance of a TM (A_TM).'],
    concepts: ['Undecidability', 'Diagonalisation', 'Decidable vs undecidable problems'] });

  G.VOID_PROOF = [
    { id: 'q1', q: 'Suppose H(D, D) answers “D halts on input D”. What does D(D) actually do?', options: ['It halts', 'It loops forever', 'It depends on the tape'], answer: 1, why: 'D loops whenever H says “halts” — so D(D) loops, and H was WRONG.' },
    { id: 'q2', q: 'Now suppose H(D, D) answers “D loops on input D”. What does D(D) actually do?', options: ['It loops forever', 'It halts', 'It crashes'], answer: 1, why: 'D halts whenever H says “loops” — so D(D) halts, and H was WRONG again.' },
    { id: 'q3', q: 'Whichever answer H gives about D(D), it is wrong. What follows?', options: ['H was just badly written', 'No such decider H can exist', 'D must be a faulty machine'], answer: 1, why: 'The only assumption was that H exists and always answers correctly. That assumption is contradictory — HALT is undecidable.' },
  ];
  G.VOID_CLASSIFY = [
    { id: 'c1', text: 'Do two DFAs accept the same language?', answer: 'decidable', why: 'Product automaton + reachability — exactly what Regular City’s verifier does.' },
    { id: 'c2', text: 'Does a Turing machine halt on input w?', answer: 'undecidable', why: 'The Halting Problem.' },
    { id: 'c3', text: 'Does a CFG generate a given string? (CYK)', answer: 'decidable', why: 'CYK parsing in O(n³) — the Grammar Forest uses it.' },
    { id: 'c4', text: 'Do two CFGs generate the same language?', answer: 'undecidable', why: 'Equivalence of CFGs is undecidable — which is why the Forest verifies up to a length bound instead.' },
    { id: 'c5', text: 'Is a given CFG ambiguous?', answer: 'undecidable', why: 'Ambiguity of CFGs is undecidable; we can only search for witnesses.' },
    { id: 'c6', text: 'Is the language of a DFA empty?', answer: 'decidable', why: 'Check reachability of an accepting state.' },
  ];
  /** grade Void answers: returns {correct, total, wrong:[ids]} */
  G.verifyVoid = function (ch, answers) {
    const wrong = [];
    let total = 0;
    if (ch.id === 'V1') {
      for (const m of G.VOID_MACHINES) { total++; if ((answers.verdicts || {})[m.id] !== m.truth) wrong.push(m.id); }
    } else {
      for (const q of G.VOID_PROOF) { total++; if ((answers.proof || {})[q.id] !== q.answer) wrong.push(q.id); }
      for (const q of G.VOID_CLASSIFY) { total++; if ((answers.classify || {})[q.id] !== q.answer) wrong.push(q.id); }
    }
    return { ok: wrong.length === 0 && Object.keys(answers.verdicts || answers.proof || {}).length > 0, correct: total - wrong.length, total, wrong };
  };

  /** ============================ MAINTENANCE CONTRACTS ============================
   * After a machine is deployed its object receives a POLICY UPDATE: the requirement
   * changes, the old machine misbehaves, and the player must patch / replace it. */
  def({ id: 'C1', world: 'regular', contract: true, order: 91, kind: 'build', model: 'FA', allowed: ['DFA', 'NFA', 'ENFA'], alphabet: ['0', '1'], tags: ['dfa', 'contract'], max: 300, optimal: 'auto', sizeLabel: 'states', budget: 8, par: 300, hidden: false, object: 'gate_main',
    title: 'Gate Policy v2', tagline: 'The requirement changed — patch the deployed machine', archiveName: 'Gate Policy v2 DFA',
    story: `Security has issued Policy v2 for the Main Security Gate: a pass-code now needs an even number of 1s AND must end with 0 (so the empty code is no longer valid). The deployed machine from Policy v1 now lets the wrong people through. Debug it, patch it, and redeploy.`,
    formal: 'L₂ = { w ∈ {0,1}* | #₁(w) is even AND w ends with 0 }', objective: 'Modify (or replace) the deployed machine so it satisfies Policy v2.',
    reference: JFF('C1_reference'), optional: { text: 'Use the minimum number of states.', check: (m) => FA.isMinimal(m, ['0', '1']) },
    hints: ['You must remember two things at once: the parity of 1s and whether the last symbol was 0.', 'Product construction: combine the old parity machine with a 2-state “last symbol was 0” machine — the Archive can build products for you.', 'Try states (parity, lastWas0): 4 combinations, accept only (even, last=0).'], concepts: ['Machine reuse', 'Product construction', 'Debugging requirements'] });

  def({ id: 'C2', world: 'regular', contract: true, order: 92, kind: 'build', model: 'FA', allowed: ['DFA', 'NFA', 'ENFA'], alphabet: ['a', 'b'], tags: ['dfa', 'contract'], max: 250, optimal: 'auto', sizeLabel: 'states', budget: 8, par: 300, hidden: false, object: 'vending',
    title: 'Vending Recalibration', tagline: 'Replace the deployed machine', archiveName: 'Vending Policy v2 DFA',
    story: `The vending controller also jams on three presses of a in a row. Policy v2: dispense only sequences with neither “bb” nor “aaa”. Replace the deployed controller.`,
    formal: 'L₂ = { w ∈ {a,b}* | w contains neither "bb" nor "aaa" }', objective: 'Build a machine for Policy v2 and redeploy it.',
    reference: JFF('C2_reference'), optional: { text: 'Use the minimum number of states.', check: (m) => FA.isMinimal(m, ['a', 'b']) },
    hints: ['Track the current run: how many a’s in a row (0,1,2) and whether the last symbol was b.', 'States: start (no trailing run), “a”, “aa”, “b”. Both forbidden patterns lead to the same dead state.', 'Or use the Archive’s Combine tool on the two earlier machines (AND).'], concepts: ['Machine reuse', 'Intersection of regular languages'] });

  /* ---------- JFLAP oracles: the language/function of every grammar, PDA and TM level is defined by its .jff file ----------
   * `check` keeps the independent hand-written JavaScript predicate; the tests assert the .jff agrees with it. */
  const ORACLE = { G1: 'G1_reference', G2: 'G2_reference', G3: 'G3_reference', G4: 'G4_reference', P1: 'P1_reference', P2: 'P2_reference', P3: 'P3_reference', T1: 'T1_reference', T2: 'T2_reference', T3: 'T3_reference' };
  /** make a JFLAP level file the oracle of a grammar / PDA / TM challenge (also used by variants.js for every variant) */
  G.bindOracle = function (ch, file, opts) {
    const m = JFF(file); ch.oracle = m; ch.levelFile = file + '.jff';
    if (!opts || !opts.keepCheck) ch.check = ch.pred || ch.transform;
    if (m.type === 'CFG') ch.pred = (w) => CFG.accepts(m, w);
    else if (m.type === 'PDA') ch.pred = (w) => PDA.accepts(m, w, { maxNodes: 6000, maxStack: 60 });
    else if (ch.tmKind === 'transform') ch.transform = (w) => { const r = TM.run(m, w, { traceLimit: 0, maxSteps: 6000 }); return r.status === 'accepted' ? TM.trimTape(r.output) : null; };
    else ch.pred = (w) => TM.accepts(m, w, { maxSteps: 6000 });
    return ch;
  };
  for (const ch of C) { if (ORACLE[ch.id]) G.bindOracle(ch, ORACLE[ch.id]); }
  for (const ch of C) if (ch.reference && !ch.levelFile && /^[RNC][1-9]$/.test(ch.id) && ch.id !== 'R5') ch.levelFile = ch.id + '_reference.jff';
  /* ---------- derived: 'auto' optimal sizes, predicates ---------- */
  for (const ch of C) {
    if (ch.kind === 'build' && ch.model === 'FA') predOf(ch);
    if (ch.optimal === 'auto') ch.optimal = FA.minimalSize(ch.reference, ch.alphabet);
  }

  /* ======================= VERIFICATION ======================= */
  const lang = (b) => (b ? 'ACCEPT' : 'REJECT');
  const stage = (id, name, status, detail) => ({ id, name, status, detail });
  function summarise(out) { out.ok = out.stages.every((s) => s.status === 'pass' || s.status === 'skip'); return out; }

  function verifyFA(ch, m) {
    const out = { ok: false, stages: [], counterexample: null, errors: [], warnings: [], exact: true };
    if (!ch.allowed.includes(m.type)) { out.stages.push(stage('structure', 'Structure check', 'fail', `This mission needs ${ch.allowed.map((t) => G.TYPE_LABEL[t]).join(' or ')} — you built a ${G.TYPE_LABEL[m.type] || m.type}.`)); out.errors.push(out.stages[0].detail); return out; }
    const v = FA.validate(m, { kind: m.type, alphabet: ch.alphabet });
    out.warnings = v.warnings;
    if (!v.ok) { out.errors = v.errors; out.stages.push(stage('structure', 'Structure check', 'fail', v.errors[0])); return out; }
    out.stages.push(stage('structure', 'Structure check', 'pass', `Valid ${G.TYPE_LABEL[m.type]}: ${m.states.length} states, ${m.transitions.length} transitions.`));
    const tests = G.testsFor(ch);
    const failed = tests.filter((t) => FA.accepts(m, t.w) !== t.accept);
    out.hidden = { passed: tests.length - failed.length, total: tests.length };
    out.stages.push(stage('tests', 'Hidden test suite', failed.length ? 'fail' : 'pass', `${out.hidden.passed} / ${out.hidden.total} hidden test strings behave correctly.`));
    const eq = FA.equivalent(m, ch.reference, ch.alphabet);
    if (eq.equal) out.stages.push(stage('formal', 'Formal verification (exact)', 'pass', `Product-automaton equivalence over Σ = {${ch.alphabet.join(', ')}}: all ${eq.explored} reachable state-pairs agree — EVERY string behaves correctly, not just the tests.`));
    else {
      out.stages.push(stage('formal', 'Formal verification (exact)', 'fail', `Product automaton found a string on which your machine and the language disagree.`));
      out.counterexample = { w: eq.counterexample, expected: lang(eq.in2), actual: lang(eq.in1) };
    }
    if (!out.counterexample && failed.length) out.counterexample = { w: failed[0].w, expected: lang(failed[0].accept), actual: lang(!failed[0].accept) };
    if (ch.requireMinimal && eq.equal) {
      const ok = FA.isMinimal(m, ch.alphabet);
      out.stages.push(stage('minimal', 'Minimality audit', ok ? 'pass' : 'fail', ok ? `Exactly ${FA.minimalSize(ch.reference, ch.alphabet)} states: no state can be merged.` : `Your DFA works but is not minimal — the minimum is ${FA.minimalSize(ch.reference, ch.alphabet)} states (no unreachable or equivalent states allowed).`));
      if (!ok) out.notMinimal = true;
    }
    out.minimal = eq.equal && FA.isMinimal(m, ch.alphabet);
    return summarise(out);
  }

  function checkTerminals(ch, g, out) {
    const bad = CFG.terminals(g).filter((t) => !ch.alphabet.includes(t));
    if (bad.length) { const msg = `Terminal${bad.length > 1 ? 's' : ''} ${bad.map((b) => '“' + b + '”').join(', ')} ${bad.length > 1 ? 'are' : 'is'} not in the alphabet {${ch.alphabet.join(', ')}}. (Nonterminals are UPPER-CASE letters.)`; out.stages.push(stage('structure', 'Structure check', 'fail', msg)); out.errors.push(msg); return false; }
    return true;
  }
  function verifyCFG(ch, g) {
    const out = { ok: false, stages: [], counterexample: null, errors: [], warnings: [], exact: false };
    if (!g || !g.productions || !g.productions.length) { out.stages.push(stage('structure', 'Structure check', 'fail', 'The grammar has no productions.')); out.errors.push('empty grammar'); return out; }
    if (!checkTerminals(ch, g, out)) return out;
    const prod = CFG.productive(g);
    if (!prod.has(g.start)) { out.stages.push(stage('structure', 'Structure check', 'fail', `The start symbol ${g.start} can never derive a terminal string.`)); return out; }
    out.stages.push(stage('structure', 'Structure check', 'pass', `Start symbol ${g.start}, ${g.productions.length} productions, ${CFG.terminals(g).length} terminal(s).`));
    const tests = G.testsFor(ch);
    const failed = tests.filter((t) => CFG.accepts(g, t.w) !== t.accept);
    out.hidden = { passed: tests.length - failed.length, total: tests.length };
    out.stages.push(stage('tests', 'Hidden test suite', failed.length ? 'fail' : 'pass', `${out.hidden.passed} / ${out.hidden.total} hidden strings (checked with CYK parsing).`));
    const r = CFG.checkAgainst(g, ch.pred, ch.alphabet, ch.maxLen);
    if (r.ok) out.stages.push(stage('formal', `Bounded verification (≤ ${ch.maxLen})`, 'pass', `All ${r.tested} strings up to length ${ch.maxLen} agree with the language. (Equivalence of CFGs is undecidable, so verification is bounded — see Void Zone.)`));
    else { out.stages.push(stage('formal', `Bounded verification (≤ ${ch.maxLen})`, 'fail', 'Your grammar and the language disagree on a short string.')); out.counterexample = { w: r.counterexample, expected: lang(r.expected), actual: lang(r.actual) }; }
    if (!out.counterexample && failed.length) out.counterexample = { w: failed[0].w, expected: lang(failed[0].accept), actual: lang(!failed[0].accept) };
    if (ch.kind === 'ambig' && r.ok) {
      const amb = CFG.findAmbiguity(g, ch.alphabet, ch.maxLen);
      out.stages.push(stage('unambiguous', 'Unambiguity check', amb.ambiguous ? 'fail' : 'pass', amb.ambiguous ? `“${amb.word}” still has two different parse trees.` : `Every string up to length ${ch.maxLen} has exactly one parse tree.`));
      if (amb.ambiguous) out.counterexample = { w: amb.word, expected: '1 parse tree', actual: '2+ parse trees', ambiguous: true, trees: amb.trees };
    }
    return summarise(out);
  }

  function verifyPDA(ch, m) {
    const out = { ok: false, stages: [], counterexample: null, errors: [], warnings: [], exact: false };
    const v = PDA.validate(m, { alphabet: ch.alphabet });
    out.warnings = v.warnings;
    if (!v.ok) { out.errors = v.errors; out.stages.push(stage('structure', 'Structure check', 'fail', v.errors[0])); return out; }
    out.stages.push(stage('structure', 'Structure check', 'pass', `Valid PDA: ${m.states.length} states, ${m.transitions.length} transitions, acceptance by ${m.acceptMode === 'empty' ? 'empty stack' : 'final state'}.`));
    const opts = { maxNodes: 4000, maxStack: 40 };
    const t0 = Date.now();
    const tests = G.testsFor(ch);
    let failed = [], timeout = false;
    for (const t of tests) { if (PDA.accepts(m, t.w, opts) !== t.accept) failed.push(t); if (Date.now() - t0 > 4000) { timeout = true; break; } }
    out.hidden = { passed: tests.length - failed.length, total: tests.length };
    out.stages.push(stage('tests', 'Hidden test suite', failed.length || timeout ? 'fail' : 'pass', timeout ? 'Your PDA explores far too many configurations (an ε-loop that keeps pushing?).' : `${out.hidden.passed} / ${out.hidden.total} hidden strings run through the stack machine.`));
    if (timeout) { out.counterexample = null; return summarise(out); }
    let tested = 0, bad = null;
    for (const w of F.strings(ch.alphabet, ch.maxLen)) {
      tested++;
      const exp = !!ch.pred(w), act = PDA.accepts(m, w, opts);
      if (exp !== act) { bad = { w, expected: exp, actual: act }; break; }
      if (Date.now() - t0 > 6000) { out.warnings.push('Verification stopped early (time budget).'); break; }
    }
    if (!bad) out.stages.push(stage('formal', `Bounded verification (≤ ${ch.maxLen})`, 'pass', `All ${tested} strings up to length ${ch.maxLen} behave correctly. (PDA equivalence is undecidable in general — verification is bounded.)`));
    else { out.stages.push(stage('formal', `Bounded verification (≤ ${ch.maxLen})`, 'fail', 'Your PDA disagrees with the language on a short string.')); out.counterexample = { w: bad.w, expected: lang(bad.expected), actual: lang(bad.actual) }; }
    if (!out.counterexample && failed.length) out.counterexample = { w: failed[0].w, expected: lang(failed[0].accept), actual: lang(!failed[0].accept) };
    return summarise(out);
  }

  function verifyTM(ch, m) {
    const out = { ok: false, stages: [], counterexample: null, errors: [], warnings: [], exact: false };
    const v = TM.validate(m, { alphabet: ch.alphabet });
    out.warnings = v.warnings;
    if (!v.ok) { out.errors = v.errors; out.stages.push(stage('structure', 'Structure check', 'fail', v.errors[0])); return out; }
    out.stages.push(stage('structure', 'Structure check', 'pass', `Valid deterministic TM: ${m.states.length} states, ${m.transitions.length} transitions.`));
    const tests = G.testsFor(ch);
    let bad = null, passed = 0;
    for (const t of tests) {
      const r = TM.run(m, t.w, { traceLimit: 0, maxSteps: 6000 });
      let ok, actual, expected;
      if (ch.tmKind === 'transform') { expected = t.expected; ok = r.status === 'accepted' && TM.trimTape(r.output) === t.expected; actual = r.status === 'accepted' ? (TM.trimTape(r.output) || '(blank tape)') : r.status === 'limit' ? 'did not halt (6000 steps)' : 'halted without accepting'; if (expected === '') expected = '(blank tape)'; }
      else { expected = lang(t.expected); ok = r.status !== 'limit' && (r.status === 'accepted') === t.expected; actual = r.status === 'limit' ? 'did not halt (6000 steps)' : lang(r.status === 'accepted'); }
      if (ok) passed++; else if (!bad) bad = { w: t.w, expected, actual };
    }
    out.hidden = { passed, total: tests.length };
    out.stages.push(stage('tests', 'Hidden test suite', bad ? 'fail' : 'pass', `${passed} / ${tests.length} tapes processed correctly.`));
    out.stages.push(stage('formal', `Bounded verification (≤ ${ch.tmMaxLen})`, bad ? 'fail' : 'pass', bad ? 'Your machine fails on a short input.' : `Every input up to length ${ch.tmMaxLen} (${tests.length} tapes) halts with the right result. (TM equivalence is undecidable — verification is bounded.)`));
    if (bad) out.counterexample = bad;
    return summarise(out);
  }

  /** public: verify a player machine/grammar against a challenge */
  G.verify = function (ch, m) {
    try {
      if (ch.model === 'FA') return verifyFA(ch, m);
      if (ch.model === 'CFG') return verifyCFG(ch, m);
      if (ch.model === 'PDA') return verifyPDA(ch, m);
      if (ch.model === 'TM') return verifyTM(ch, m);
    } catch (e) {
      return { ok: false, stages: [stage('structure', 'Structure check', 'fail', 'Internal error while verifying: ' + e.message)], errors: [e.message], counterexample: null, warnings: [] };
    }
    return { ok: false, stages: [], errors: ['unsupported'], counterexample: null, warnings: [] };
  };

  /** Twin Gates round check */
  G.verifyTwin = function (ch, roundIdx, answer) {
    const r = ch.rounds[roundIdx];
    const eq = FA.equivalent(r.a, r.b, r.alphabet);
    if (answer.equivalent) {
      return eq.equal ? { ok: true, msg: 'Correct — the Equivalence Engine confirms L(A) = L(B): every reachable state-pair of the product automaton agrees.', equivalent: true }
        : { ok: false, msg: `Not equivalent! The shortest string that tells them apart is “${eq.counterexample || 'ε'}” (A: ${lang(eq.in1)}, B: ${lang(eq.in2)}).`, shortest: eq.counterexample };
    }
    const w = answer.w;
    if ([...w].some((c) => !r.alphabet.includes(c))) return { ok: false, msg: `Use only symbols from {${r.alphabet.join(', ')}}.` };
    const x = FA.accepts(r.a, w), y = FA.accepts(r.b, w);
    if (x !== y) return { ok: true, msg: `“${w || 'ε'}” works: ${r.nameA} ${lang(x)}S, ${r.nameB} ${lang(y)}S.`, a: x, b: y, isShortest: !eq.equal && w.length === eq.counterexample.length };
    return { ok: false, msg: `Both gates ${lang(x)} “${w || 'ε'}” — that does not distinguish them.`, a: x, b: y };
  };
  /** Ambiguity Hunt step 1 */
  G.verifyAmbiguousWord = function (ch, w) {
    if ([...w].some((c) => !ch.alphabet.includes(c))) return { ok: false, msg: `Use only symbols from {${ch.alphabet.join(', ')}}.` };
    if (!w) return { ok: false, msg: 'The empty string is not generated by this grammar.' };
    if (!CFG.accepts(ch.given, w)) return { ok: false, msg: `The grammar cannot generate “${w}”.` };
    const trees = CFG.parseTrees(ch.given, w, 3);
    if (trees.length < 2) return { ok: false, msg: `“${w}” has only ONE parse tree. Look for a string where operators can group in more than one way.`, trees };
    return { ok: true, msg: `Ambiguous! “${w}” has ${trees.length >= 3 ? 'at least 2' : trees.length} different parse trees.`, trees };
  };

  /* ======================= generic helpers used by deployment & archive ======================= */
  G.machineAlphabet = function (m) {
    if (m.type === 'CFG') return CFG.terminals(m);
    if (m.type === 'PDA') return PDA.alphabetOf(m);
    if (m.type === 'TM') return [...new Set(m.transitions.map((t) => TM.norm(t.read)).filter((c) => c !== '_'))].sort();
    return FA.symbols(m);
  };
  G.runMachine = function (m, w) {
    if (m.type === 'CFG') return CFG.accepts(m, w);
    if (m.type === 'PDA') return PDA.accepts(m, w, { maxNodes: 4000, maxStack: 40 });
    if (m.type === 'TM') return TM.accepts(m, w, { maxSteps: 4000 });
    return FA.accepts(m, w);
  };
  G.machineSize = (m) => (m.type === 'CFG' ? m.productions.length : m.type === 'DFA' || m.type === 'NFA' || m.type === 'ENFA' ? m.states.length : m.transitions.length);

  /** the policy an object currently enforces (version 1 = original challenge, 2 = contract) */
  G.policyFor = function (objectId, version) {
    const o = G.objectById(objectId);
    const cid = o.policy[version] || o.policy[1];
    let ch = G.challengeById(cid);
    /* version 1 = the challenge variant that was deployed (it may differ from the variant rolled for this visit) */
    if ((version <= 1 || !o.policy[version]) && G.Variants) {
      const st = G.Store && G.Store.state, os = st && st.objects && st.objects[objectId], vid = os && os.deployed && os.deployed.variantId;
      if (vid && vid !== (ch.variantId || 'base')) { try { ch = G.Variants.materialize(cid, vid); } catch (e) { /* unknown variant (old save) → current */ } }
    }
    if (ch.model === 'TM' && ch.tmKind === 'transform') return { kind: 'transform', fn: ch.transform, challenge: ch };
    return { kind: 'accept', fn: ch.pred || predOf(ch), challenge: ch };
  };
  G.visitorsFor = function (objectId, version, n = 24) {
    const o = G.objectById(objectId);
    const pol = G.policyFor(objectId, version);
    const rng = F.rng(1000 + objectId.length * 31 + version * 7 + (pol.challenge.variantId && pol.challenge.variantId !== 'base' ? pol.challenge.variantId.length * 13 + pol.challenge.variantId.charCodeAt(0) : 0));
    const out = [];
    if (pol.kind === 'transform') { while (out.length < n) out.push(F.randomString(rng, o.alphabet, 1, 5)); return out; }
    const alpha = o.alphabet;
    const pos = [], neg = [];
    let guard = 0;
    while ((pos.length < n / 2 || neg.length < n / 2) && guard++ < 20000) {
      const w = F.randomString(rng, alpha, 0, 7);
      if (pol.fn(w)) { if (pos.length < n / 2 && !pos.includes(w)) pos.push(w); } else if (neg.length < n / 2 && !neg.includes(w)) neg.push(w);
    }
    if (pol.challenge.model === 'CFG' || pol.challenge.model === 'PDA') { // sparse languages: make sure good strings exist
      for (const w of ['', 'ab', 'aabb', 'aaabbb', 'aaaabbbb']) if (pol.fn(w) && !pos.includes(w) && pos.length < n / 2 + 3) pos.push(w);
      if (pos.length < n / 2) for (const w of F.strings(alpha, 8)) { if (pos.length >= n / 2) break; if (w.length > 1 && !pos.includes(w) && pol.fn(w)) pos.push(w); }
    }
    const mixed = [];
    for (let i = 0; i < Math.max(pos.length, neg.length); i++) { if (neg[i] !== undefined) mixed.push(neg[i]); if (pos[i] !== undefined) mixed.push(pos[i]); }
    return mixed.slice(0, n + 3);
  };
  /** run `rec` against an object's current policy → compliance report */
  G.compliance = function (objectId, machine, version) {
    const pol = G.policyFor(objectId, version);
    const vis = G.visitorsFor(objectId, version);
    const rows = vis.map((w) => {
      if (pol.kind === 'transform') {
        const r = TM.run(machine, w, { traceLimit: 0, maxSteps: 3000 });
        const exp = pol.fn(w), got = r.status === 'accepted' ? TM.trimTape(r.output) : null;
        return { w, expected: exp, got: got === null ? '✗ fault' : got, ok: got === exp };
      }
      const exp = pol.fn(w), got = G.runMachine(machine, w);
      return { w, expected: exp, got, ok: exp === got };
    });
    const ok = rows.filter((r) => r.ok).length;
    return { rows, ok, total: rows.length, pct: rows.length ? Math.round((100 * ok) / rows.length) : 100, kind: pol.kind };
  };
  G.deployCompat = function (rec, obj) {
    if (!rec.verified) return { ok: false, reason: 'Only VERIFIED machines can be deployed.' };
    if (!obj.accepts.includes(rec.type)) return { ok: false, reason: `${obj.name} runs ${obj.accepts.map((t) => G.TYPE_LABEL[t]).join(' / ')} machines — this is a ${G.TYPE_LABEL[rec.type] || rec.type}.` };
    if (rec.type !== 'TM') {
      const extra = G.machineAlphabet(rec.structure).filter((c) => !obj.alphabet.includes(c));
      if (extra.length) return { ok: false, reason: `${obj.name} understands the alphabet {${obj.alphabet.join(', ')}}, but this machine also uses {${extra.join(', ')}}.` };
    }
    return { ok: true };
  };
})();
