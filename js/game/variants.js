/* ============================================================================
 * GAME WORLD LAYER · challenge VARIANTS
 * Every mission slot (R1, R2, … V2) keeps its place and order in the world, but
 * each slot owns a POOL of different challenges. Every time the game loads — i.e.
 * every time a person comes to play — one variant per slot is rolled:
 *   · seeded (the session seed is shown; ?seed=abc reproduces a session exactly)
 *   · never the same variant as last time (history is kept in the save file)
 *   · "Classic challenges" (Profile) pins every slot back to the original variant.
 * The reference machine of every non-classic variant is its own real JFLAP file in
 * jflap/levels/<Slot>_<variant>_<role>.jff (written by tools/seed-variants.js).
 * Each variant also carries an INDEPENDENT hand-written predicate (`check`) that
 * tests/variants.test.js compares against the .jff on every short string.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F, FA = F.FA, CFG = F.CFG, PDA = F.PDA, TM = F.TM;
  const G = (AM.G = AM.G || {});
  const V = (G.Variants = { pools: {}, current: {}, seed: null, count: 0 });
  const pools = V.pools;
  const key = (slot, vid, role) => (vid === 'base' ? `${slot}_${role}` : `${slot}_${vid}_${role}`);
  V.key = key;

  /** def(slot, id, files, make): files = { role: [builderName, args, pick?] } (used only by tools/seed-variants.js);
   *  make(ctx) → patch merged over the original challenge. */
  const def = (slot, id, files, make) => { (pools[slot] = pools[slot] || [{ id: 'base' }]).push({ id, files: files || {}, make }); };

  /* ---------------- small helpers ---------------- */
  const cnt = (w, c) => { let n = 0; for (const x of w) if (x === c) n++; return n; };
  const rev = (w) => [...w].reverse().join('');
  const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const nm = (m, id) => { const s = m.states.find((x) => x.id === id); return (s && s.name) || id; };
  const eps = (x) => (x === '' || x === undefined || x === null ? 'ε' : x);
  /** readable transition table of a finite automaton: "A(start): a→B, b→A · B(accept): …" */
  function tableText(m) {
    const alpha = [...new Set(m.transitions.map((t) => t.read))].filter((x) => x !== '' && x !== undefined).sort();
    return m.states.map((s) => {
      const outs = alpha.map((a) => { const ts = m.transitions.filter((t) => t.from === s.id && t.read === a).map((t) => nm(m, t.to)); return ts.length ? `${a}→${ts.join('/')}` : null; }).filter(Boolean);
      const e = m.transitions.filter((t) => t.from === s.id && (t.read === '' || t.read === undefined)).map((t) => nm(m, t.to));
      if (e.length) outs.push('ε→' + e.join('/'));
      return `${nm(m, s.id)}${s.initial ? ' (start)' : ''}${s.final ? ' (accepting)' : ''}: ${outs.join(', ')}`;
    }).join('  ·  ');
  }
  const pdaText = (m) => m.transitions.map((t) => `${nm(m, t.from)} —${eps(t.read)}, ${eps(t.pop)}→${eps(t.push)}→ ${nm(m, t.to)}`).join(';  ');
  const tmText = (m) => m.transitions.map((t) => `${nm(m, t.from)}: ${t.read}/${t.write},${t.move} → ${nm(m, t.to)}`).join(';  ');
  /** a few of the longest strings the predicate accepts — used as extra hidden tests for sparse languages */
  function longPos(check, alpha, maxL, n = 3) {
    const pos = F.strings(alpha, maxL).filter((w) => w.length >= 4 && check(w));
    return pos.slice(-n);
  }
  const sizeText = (n, what) => `Use at most ${n} ${what}.`;
  const grammarSize = (text) => CFG.parseText(text).grammar.productions.length;

  /* ======================================================================== */
  /*                               REGULAR CITY                               */
  /* ======================================================================== */
  /* ---- R1 · hidden rule counted modulo k ---- */
  [{ id: 'z2', c: '0', k: 2, r: 0 }, { id: 'o3', c: '1', k: 3, r: 0 }, { id: 'o2odd', c: '1', k: 2, r: 1 }, { id: 'z3', c: '0', k: 3, r: 1 }, { id: 'z2odd', c: '0', k: 2, r: 1 }].forEach((p) => {
    const sym = p.c === '1' ? 'one' : 'zero', S = p.c === '1' ? 'One' : 'Zero';
    const rule = p.k === 2 ? `an ${p.r === 0 ? 'EVEN' : 'ODD'} number of ${p.c}s` : `a number of ${p.c}s that leaves remainder ${p.r} when divided by ${p.k}`;
    const sh = p.k === 2 ? `${p.r === 0 ? 'Even' : 'Odd'}-${S}` : `${S}s-Mod-${p.k}`;
    def('R1', p.id, { reference: ['countMod', { c: p.c, k: p.k, r: p.r }] }, (ctx) => ({
      variantLabel: sh,
      title: `The ${sh} Security Gate`, archiveName: `${sh} Security DFA`,
      formal: p.k === 2 ? `L = { w ∈ {0,1}* | w contains an ${p.r === 0 ? 'even' : 'odd'} number of ${p.c}s }` : `L = { w ∈ {0,1}* | #${p.c}(w) ≡ ${p.r} (mod ${p.k}) }`,
      reference: ctx.f('reference'), check: (w) => cnt(w, p.c) % p.k === p.r, optimal: p.k,
      optional: { text: `Use the minimum number of states (${p.k}).`, check: (m) => FA.isMinimal(m, ['0', '1']) },
      hints: [`Formal rule revealed: the gate accepts strings with ${rule}${p.r === 0 ? ' (zero counts, so the empty string is accepted)' : ''}.`,
        `You only need to remember the count of ${p.c}s modulo ${p.k} — that is ${p.k} states.`,
        `States n0…n${p.k - 1} = “${p.c}s so far ≡ i (mod ${p.k})”. Reading ${p.c} moves n_i → n_(i+1 mod ${p.k}); the other symbol loops. n0 is initial; n${p.r} is the only accepting state.`],
    }));
  });

  /* ---- R2 · avoid a pattern ---- */
  ['aa', 'aba', 'bab', 'abb', 'bba'].forEach((p) => {
    def('R2', 'no' + p, { reference: ['avoid', { p }] }, (ctx) => {
      const L = p.length;
      return {
        variantLabel: `No “${p}”`, title: `The Jam-Proof Vending Controller — no “${p}”`, tagline: 'Forbid a pattern', archiveName: `No-${p.toUpperCase()} Vending DFA`,
        story: `The vending controller jams whenever the button pattern “${p}” appears anywhere in a customer's presses. Engineers want a DFA that dispenses (accepts) every button sequence that never contains ${p}. Buttons: a and b.`,
        formal: `L = { w ∈ {a,b}* | w does not contain the substring "${p}" }`, objective: `Build a DFA over {a,b} that rejects exactly the strings containing ${p}.`,
        reference: ctx.f('reference'), check: (w) => !w.includes(p), optimal: 'auto',
        hints: [`Think about what you need to remember: how much of “${p}” has been matched at the end of the input so far.`,
          `States s0…s${L - 1} record how many symbols of “${p}” are currently matched. Completing the pattern (reaching s${L}) is forbidden — a missing transition rejects automatically.`,
          `The finished machine: ${tableText(ctx.f('reference'))}`],
      };
    });
  });

  /* ---- R3 · binary multiples of k ---- */
  [5, 4, 6].forEach((k) => {
    def('R3', 'div' + k, { reference: ['divBy', { k }] }, (ctx) => {
      const rows = []; for (let r = 0; r < k; r++) rows.push(`r${r}: 0→r${(2 * r) % k}, 1→r${(2 * r + 1) % k}`);
      return {
        variantLabel: `÷ ${k}`, title: `Checkpoint Delta — Divisible by ${k === 4 ? 'Four' : k === 5 ? 'Five' : 'Six'}`, archiveName: `Div-by-${k} Checkpoint DFA`,
        formal: `L = { w ∈ {0,1}* | the binary number w is divisible by ${k} }   (ε counts as 0)`, objective: `Build the minimal-memory DFA for binary multiples of ${k}.`,
        reference: ctx.f('reference'), check: (w) => parseInt(w || '0', 2) % k === 0, optimal: 'auto',
        optional: { text: 'Use exactly the minimum number of states.', check: (m) => FA.isMinimal(m, ['0', '1']) },
        hints: [`Formal rule revealed: w is accepted iff its binary value is a multiple of ${k} (the empty string is 0).`,
          `Track the remainder mod ${k}. Reading bit b turns value v into 2v + b, so the new remainder is (2r + b) mod ${k}.`,
          `States r0 (initial, accepting) … r${k - 1}.  ${rows.join('   ')}.  Some remainders may behave identically — merge them for the minimum.`],
      };
    });
  });

  /* ---- R4 · minimise a bloated counter ---- */
  [{ m: 4, d: 2 }, { m: 8, d: 4 }, { m: 9, d: 3 }, { m: 10, d: 5 }, { m: 6, d: 2 }].forEach(({ m, d }) => {
    def('R4', `m${m}d${d}`, { blueprint: ['counter', { m, d }], reference: ['counter', { m: d, d }] }, (ctx) => ({
      variantLabel: `mod ${m} → ${d}`, archiveName: `Minimal Reactor DFA (÷${d})`,
      story: `The legacy reactor controller counts pulses (a) modulo ${m} but only cares whether the count is divisible by ${d} — it wastes power on ${m} states. The audit demands a replacement that accepts the SAME language with the minimum possible number of states.`,
      formal: `Replace the ${m}-state blueprint by a minimal DFA with the same language: L = { w | #a(w) ≡ 0 (mod ${d}) }.`,
      reference: ctx.f('reference'), blueprint: ctx.f('blueprint'), blueprintLabel: `Legacy reactor DFA (${m} states)`, check: (w) => cnt(w, 'a') % d === 0, optimal: d,
      hints: ['States are equivalent if no string can tell them apart. Which of the states behave identically?', `State c_i and c_(i+${d}) have the same future behaviour (the blueprint counts modulo ${m}, but only the remainder mod ${d} matters).`, `Open the Minimization Lens (costs a hint): partition refinement shows exactly which states merge → ${d} states.`],
    }));
  });

  /* ---- R5 · twin gates: three pairs per variant (some equivalent, some not) ---- */
  const twinVariants = [
    { id: 'tw1', label: 'Set 1', rounds: [{ lang: 'noAA', same: false, pick: 0 }, { lang: 'div5', same: true, pick: 0 }, { lang: 'c1m3', same: false, pick: 1 }] },
    { id: 'tw2', label: 'Set 2', rounds: [{ lang: 'c0m2', same: true, pick: 0 }, { lang: 'hasABB', same: false, pick: 0 }, { lang: 'c0m4', same: false, pick: 2 }] },
    { id: 'tw3', label: 'Set 3', rounds: [{ lang: 'a3', same: false, pick: 0 }, { lang: 'noABA', same: true, pick: 0 }, { lang: 'div3', same: false, pick: 1 }] },
    { id: 'tw4', label: 'Set 4', rounds: [{ lang: 'endsAB', same: true, pick: 0 }, { lang: 'c1m2', same: false, pick: 1 }, { lang: 'hasBAB', same: true, pick: 0 }] },
  ];
  const LET = ['A', 'B', 'C', 'D', 'E', 'F'];
  const alphaOfLang = (k) => (/^(c\d|div)/.test(k) ? ['0', '1'] : ['a', 'b']);
  twinVariants.forEach((tv) => {
    const files = {};
    tv.rounds.forEach((r, i) => { files[`round${i + 1}_${LET[2 * i]}`] = ['twinPair', r, 0]; files[`round${i + 1}_${LET[2 * i + 1]}`] = ['twinPair', r, 1]; });
    def('R5', tv.id, files, (ctx) => {
      const rounds = tv.rounds.map((r, i) => ({ label: `Round ${i + 1}`, alphabet: alphaOfLang(r.lang), a: ctx.f(`round${i + 1}_${LET[2 * i]}`), b: ctx.f(`round${i + 1}_${LET[2 * i + 1]}`), nameA: `Gate ${LET[2 * i]}`, nameB: `Gate ${LET[2 * i + 1]}` }));
      const facts = rounds.map((r, i) => { const e = FA.equivalent(r.a, r.b, r.alphabet); return e.equal ? `Round ${i + 1} are equivalent (declare it!)` : `Round ${i + 1}: the shortest distinguishing string has length ${e.counterexample.length}`; });
      return {
        variantLabel: tv.label, rounds, hints: ['Probe each pair with the empty string and with each single symbol first — differences are often tiny.', 'A gate that looks bigger or different may still compute the same language. Compare what each gate actually remembers.', facts.join(';  ') + '.'],
        optional: { text: 'Submit the SHORTEST possible distinguishing string in every round that differs.', check: (_m, ctx2) => !!ctx2.shortestBoth },
      };
    });
  });

  /* ---- R6 · detect a pattern in the stream ---- */
  ['abb', 'bab', 'aab', 'baa', 'abab', 'bba'].forEach((p) => {
    def('R6', 'has' + p, { reference: ['contains', { p }] }, (ctx) => {
      const L = p.length;
      return {
        variantLabel: `“${p}”`, archiveName: `Pattern-${p.toUpperCase()} Sequencer DFA`,
        formal: `L = { w ∈ {a,b}* | w contains the substring "${p}" }`, reference: ctx.f('reference'), check: (w) => w.includes(p), optimal: 'auto',
        optional: { text: 'Use exactly the minimum number of states.', check: (m) => FA.isMinimal(m, ['a', 'b']) },
        hints: [`Formal rule revealed: accept every string that contains the substring ${p}.`, `Remember how much of “${p}” you have matched so far — from nothing up to the whole pattern.`,
          `States s0…s${L} = matched 0…${L} symbols; s${L} is accepting and loops on everything. The finished machine: ${tableText(ctx.f('reference'))}`],
      };
    });
  });

  /* ======================================================================== */
  /*                            NONDETERMINISTIC DISTRICT                      */
  /* ======================================================================== */
  /* ---- N1 · ends with a pattern ---- */
  ['ba', 'aa', 'bb', 'abb', 'aba', 'bab'].forEach((p) => {
    def('N1', 'end' + p, { reference: ['endsWithNFA', { p }] }, (ctx) => ({
      variantLabel: `ends “${p}”`, archiveName: `Ends-With-${p.toUpperCase()} Clone NFA`,
      story: `You step into a maze with many possible paths. At a fork your character SPLITS into clones — each clone explores one path. If ANY clone reaches the exit the input is accepted. Dead clones simply vanish. Build the NFA whose exit opens exactly when the input ends in “${p}”.`,
      formal: `L = { w ∈ {a,b}* | w ends with "${p}" }`, objective: `Build an NFA (or ε-NFA) for the language of strings that end with ${p}.`,
      reference: ctx.f('reference'), check: (w) => w.endsWith(p), optimal: p.length + 1,
      hints: [`The NFA can GUESS that the final “${p}” starts right now. A clone that guesses wrong just dies.`, `State s0 loops on a and b. On “${p[0]}” it may ALSO move to s1 (the guess). Then the remaining symbols of the pattern are read one by one.`, `The finished machine: ${tableText(ctx.f('reference'))}`],
    }));
  });

  /* ---- N2 · three districts in a different order ---- */
  ['cba', 'bac', 'acb', 'bca', 'cab'].forEach((o) => {
    def('N2', 'ord' + o, { reference: ['chain', { order: o }] }, (ctx) => ({
      variantLabel: `${o[0]}*${o[1]}*${o[2]}*`, archiveName: `${o[0].toUpperCase()}*${o[1].toUpperCase()}*${o[2].toUpperCase()}* Portal ε-NFA`,
      story: `Three districts are chained together: first only ${o[0]}-streets, then only ${o[1]}-streets, then only ${o[2]}-streets. Between districts sit ε-portals — they teleport your clone without consuming any input symbol. Build an ε-NFA for walks that visit the districts in order (any district may be skipped).`,
      formal: `L = { ${o[0]}ⁱ ${o[1]}ʲ ${o[2]}ᵏ | i, j, k ≥ 0 }  (${o[0]}*${o[1]}*${o[2]}*)`, objective: `Build an ε-NFA for ${o[0]}*${o[1]}*${o[2]}* using ε-portals.`,
      reference: ctx.f('reference'), check: (w) => new RegExp(`^${o[0]}*${o[1]}*${o[2]}*$`).test(w), optimal: 3,
      hints: ['Give each district its own state that loops on its own letter.', 'A portal (ε-transition) lets a clone move on to the next district without reading anything — this also lets districts be skipped.', `q0 loops ${o[0]}, q1 loops ${o[1]}, q2 loops ${o[2]}. Add ε from q0→q1 and q1→q2; q2 is accepting (the portals let you skip districts).`],
    }));
  });

  /* ---- N3 · k-th symbol from the end ---- */
  [{ k: 2, s: '1' }, { k: 4, s: '1' }, { k: 3, s: '0' }, { k: 2, s: '0' }, { k: 4, s: '0' }].forEach(({ k, s }) => {
    def('N3', `k${k}s${s}`, { reference: ['kthFromEnd', { k, s }] }, (ctx) => ({
      variantLabel: `${ORD[k]} from end = ${s}`, title: `${cap(ORD[k])} From the Last${s === '0' ? ' (zeros)' : ''}`, archiveName: `${cap(ORD[k])}-From-Last-${s} NFA`,
      story: `A prophecy engine reads a binary stream. It fires when the ${ORD[k].toUpperCase()} symbol from the end is a ${s}. A DFA must remember the last ${k} symbols (${2 ** k} states!), but a clone can simply guess “this is the ${ORD[k]}-to-last symbol” and verify ${k - 1} more. Solve it using as few probes as you can — reason, don't guess.`,
      formal: `L = { w ∈ {0,1}* | |w| ≥ ${k} and the ${ORD[k]} symbol from the right is ${s} }`, objective: `Build an NFA with ${k + 1} states.`, reference: ctx.f('reference'), check: (w) => w.length >= k && w[w.length - k] === s, optimal: k + 1,
      hints: [`Let one state loop on everything, waiting. On a ${s} it can ALSO guess “this ${s} is the one”.`, `After the guessed ${s}, exactly ${k - 1} more symbol${k > 2 ? 's' : ''} (any) must follow, then the string must end.`, `The finished machine: ${tableText(ctx.f('reference'))}`],
    }));
  });

  /* ---- N4 · subset construction of a (random but fixed) NFA ---- */
  [9, 14, 20, 28].forEach((seed, i) => {
    def('N4', 'nfa' + seed, { reference: ['randomNFA', { seed }] }, (ctx) => {
      const N = ctx.f('reference'), alpha = ['a', 'b'];
      const start = N.states.filter((s) => s.initial).map((s) => s.id);
      const mv = (set, a) => [...new Set(N.transitions.filter((t) => set.includes(t.from) && t.read === a).map((t) => t.to))];
      const show = (set) => '{' + set.map((x) => nm(N, x)).join(',') + '}';
      const fin = N.states.filter((s) => s.final).map((s) => nm(N, s.id));
      return {
        variantLabel: `NFA #${i + 1}`, archiveName: `Forged Subset DFA #${i + 1}`,
        story: `The district's ancient NFA works, but the Forge only accepts deterministic machines. Convert it! The trick is subset construction: all clones alive at the same moment are merged into ONE super-state {p,q,…}. Build a DFA with exactly the same language as this NFA.`,
        formal: 'Find a DFA D with L(D) = L(N) where N is the blueprint NFA.', reference: ctx.f('reference'), blueprint: ctx.f('reference'), blueprintLabel: 'Blueprint NFA', optimal: 'auto',
        hints: ['Start from the set of start states. For each symbol compute where ALL states of the set can go — that set is a new DFA state.', `${show(start)} —a→ ${show(mv(start, 'a'))},  ${show(start)} —b→ ${show(mv(start, 'b'))}.  A set is accepting if it contains an accepting state of N (${fin.join(', ') || 'none'}). Continue until no new sets appear.`, 'Open the Subset Lab (costs a hint): it builds the subset-construction table step by step.'],
      };
    });
  });

  /* ======================================================================== */
  /*                               GRAMMAR FOREST                              */
  /* ======================================================================== */
  const grammarPatch = (slot, vid, text, base) => def(slot, vid, { reference: ['grammar', { text }] }, (ctx) => {
    const n = grammarSize(text), alpha = base.alphabet || ['a', 'b'];
    return Object.assign({ oracleFile: 'reference', optimal: n, alphabet: alpha,
      optional: { text: sizeText(n, 'productions'), check: (g) => g.productions.length <= n },
      testOpts: { maxLen: alpha.length > 3 ? 6 : 8, extra: longPos(base.check, alpha, alpha.length > 3 ? 6 : 9) } }, base);
  });
  /* ---- G1 · different "grow together" trees ---- */
  [['anb2n', 'Double-Root Trees — aⁿb²ⁿ', 'twice as many b-leaves on the right as a-leaves on the left', 'L = { aⁿb²ⁿ | n ≥ 0 }', 'S -> aSbb | ε', (w) => /^a*b*$/.test(w) && cnt(w, 'b') === 2 * cnt(w, 'a'), 'Every a on the left needs TWO b’s on the right.', 'S -> aSbb | ε   (two productions).'],
    ['a2nbn', 'Twin-Branch Trees — a²ⁿbⁿ', 'twice as many a-leaves on the left as b-leaves on the right', 'L = { a²ⁿbⁿ | n ≥ 0 }', 'S -> aaSb | ε', (w) => /^a*b*$/.test(w) && cnt(w, 'a') === 2 * cnt(w, 'b'), 'Every b on the right is matched by TWO a’s on the left.', 'S -> aaSb | ε   (two productions).'],
    ['sapling', 'Sapling Trees — aⁿbⁿ, n ≥ 1', 'equal numbers of a-leaves and b-leaves — but a seed must always grow at least one pair', 'L = { aⁿbⁿ | n ≥ 1 }', 'S -> aSb | ab', (w) => /^a*b*$/.test(w) && w.length > 0 && cnt(w, 'a') === cnt(w, 'b'), 'The smallest tree is “ab”: the empty string is NOT allowed.', 'S -> aSb | ab   (two productions).'],
    ['leaning', 'Leaning Trees — aⁿbᵐ, n ≤ m', 'at least as many b-leaves as a-leaves (the right side leans)', 'L = { aⁿbᵐ | 0 ≤ n ≤ m }', 'S -> aSb | Sb | ε', (w) => /^a*b*$/.test(w) && cnt(w, 'a') <= cnt(w, 'b'), 'Pairs a…b grow together, but extra b’s may also be added on the right.', 'S -> aSb | Sb | ε   (three productions).'],
    ['scales', 'Balanced Scale Trees — #a = #b', 'equal numbers of a- and b-leaves in ANY order', 'L = { w ∈ {a,b}* | #a(w) = #b(w) }', 'S -> aSbS | bSaS | ε', (w) => cnt(w, 'a') === cnt(w, 'b'), 'Order does not matter, only the counts. Think: the first letter is matched with some later opposite letter.', 'S -> aSbS | bSaS | ε   (three productions).'],
  ].forEach(([vid, title, desc, formal, text, check, h1, h3]) => grammarPatch('G1', vid, text, {
    variantLabel: title.split(' — ')[1] || vid, title, archiveName: title.split(' — ')[0] + ' Grammar', check,
    story: `In the Grammar Forest, production rules are SEEDS. Each rule expands a nonterminal and the derivation tree grows. This grove grows trees with ${desc}. Write the grammar that grows exactly them.`, formal, objective: `Write a context-free grammar for ${formal.replace('L = ', '')}.`,
    hints: [h1, 'Wrap a smaller tree on both sides (a recursive production) and give the recursion a way to stop.', h3],
  }));

  /* ---- G2 · balanced brackets of other kinds ---- */
  const balancedOf = (pairs) => (w) => { const st = []; for (const c of w) { if (pairs[c]) st.push(pairs[c]); else if (st.pop() !== c) return false; } return st.length === 0; };
  [{ id: 'square', o: '[', c: ']', name: 'Square Canopy — Brackets' }, { id: 'curly', o: '{', c: '}', name: 'Curly Canopy — Braces' }].forEach(({ id, o, c, name }) => {
    grammarPatch('G2', id, `S -> ${o}S${c}S | ε`, { variantLabel: name.split(' — ')[1], alphabet: [o, c], title: name, archiveName: `Balanced-${name.split(' — ')[1]} Grammar`, check: balancedOf({ [o]: c }),
      story: `The canopy is held up by balanced branches: every ${o} must be closed by a matching ${c}, properly nested. Write the grammar for all balanced ${o}${c} strings.`,
      formal: `L = { w ∈ {${o},${c}}* | w is a balanced ${o}${c} string }`, objective: `Write a CFG for balanced ${o}${c} strings.`, maxLen: 11,
      optional: { text: 'Make the grammar UNAMBIGUOUS (every string has exactly one parse tree, checked up to length 8).', check: (g) => !CFG.findAmbiguity(g, [o, c], 8).ambiguous },
      hints: ['A balanced string is empty, or it is (balanced) followed by more balanced stuff.', `Try S → ${o} S ${c} S | ε   (that also happens to be unambiguous).`, `S -> ${o}S${c}S | ε.  The common alternative S -> SS | ${o}S${c} | ε is correct but ambiguous.`] });
  });
  grammarPatch('G2', 'dyck2', 'S -> (S)S | [S]S | ε', { variantLabel: 'Two kinds of branches', alphabet: ['(', ')', '[', ']'], title: 'Twin Canopy — Two Kinds of Branches', archiveName: 'Two-Bracket Grammar', check: balancedOf({ '(': ')', '[': ']' }), maxLen: 6,
    story: 'The canopy has two kinds of branches: round ( ) and square [ ]. Each must be closed by its own kind, properly nested — a round branch can never be closed by a square one. Write the grammar for all well-nested strings.',
    formal: 'L = { w ∈ {(,),[,]}* | every bracket is closed by its own kind, properly nested }', objective: 'Write a CFG for well-nested round-and-square brackets.',
    optional: { text: 'Make the grammar UNAMBIGUOUS (checked up to length 6).', check: (g) => !CFG.findAmbiguity(g, ['(', ')', '[', ']'], 6).ambiguous },
    hints: ['Each kind of branch works like parentheses, and they may be nested in each other.', 'S → ( S ) S | [ S ] S | ε.', 'S -> (S)S | [S]S | ε   (three productions, unambiguous).'] });

  /* ---- G3 · other mirror languages ---- */
  [['even', 'Even Mirror Grove — wwᴿ', 'a ring that mirrors perfectly around its centre (even length only)', 'L = { w wᴿ | w ∈ {a,b}* }', 'S -> aSa | bSb | ε', (w) => w.length % 2 === 0 && w === rev(w), 'There is no middle letter: the centre is empty.', 'S -> aSa | bSb | ε'],
    ['odd', 'Odd Mirror Grove — odd palindromes', 'a ring with a single middle letter (odd length only)', 'L = { w ∈ {a,b}* | w = wᴿ and |w| is odd }', 'S -> aSa | bSb | a | b', (w) => w.length % 2 === 1 && w === rev(w), 'The centre is exactly ONE letter.', 'S -> aSa | bSb | a | b'],
    ['lopsided', 'Lopsided Grove — aⁱbʲ, i ≠ j', 'a-leaves on the left and b-leaves on the right, but NEVER the same number', 'L = { aⁱbʲ | i ≠ j }', 'S -> aSb | A | B\nA -> aA | a\nB -> bB | b', (w) => /^a*b*$/.test(w) && cnt(w, 'a') !== cnt(w, 'b'), 'Grow matched pairs a…b, then add at least one EXTRA a or at least one extra b.', 'S -> aSb | A | B;  A -> aA | a;  B -> bB | b'],
    ['nonempty', 'Short-Ring Grove — non-empty palindromes', 'non-empty rings that read the same in both directions', 'L = { w ∈ {a,b}+ | w = wᴿ }', 'S -> aSa | bSb | aa | bb | a | b', (w) => w.length > 0 && w === rev(w), 'The empty ring does not exist.', 'S -> aSa | bSb | aa | bb | a | b'],
  ].forEach(([vid, title, desc, formal, text, check, h1, h3]) => grammarPatch('G3', vid, text, {
    variantLabel: title.split(' — ')[1], title, archiveName: title.split(' — ')[0] + ' Grammar', check, alphabet: ['a', 'b'],
    story: `Trees in the Grove grow outward from the centre. This grove grows ${desc}. Write the grammar over {a,b}.`, formal, objective: `Write a CFG for ${formal.replace('L = ', '')}.`,
    hints: [h1, 'Grow from the middle outwards: wrap the same letter on both sides.', h3],
  }));

  /* ---- G4 · find the ambiguity, then repair it ---- */
  const dangling = (w) => { const memo = new Map(); const S = (s) => { if (memo.has(s)) return memo.get(s); let r = false; if (s === 'a') r = true; else if (s[0] === 'i') { if (S(s.slice(1))) r = true; else for (let k = 1; k < s.length - 1 && !r; k++) if (s[k] === 'e' && S(s.slice(1, k)) && S(s.slice(k + 1))) r = true; } memo.set(s, r); return r; }; return S(w); };
  [{ id: 'plus', given: 'E -> E+E | a', ref: 'E -> a | a+E', alpha: ['a', '+'], check: (w) => /^a(\+a)*$/.test(w), ex: 'a+a+a', title: 'Ambiguity Hunt — Sums', formal: 'Given E → E+E | a:' },
    { id: 'minus', given: 'E -> E-E | a', ref: 'E -> a | a-E', alpha: ['a', '-'], check: (w) => /^a(-a)*$/.test(w), ex: 'a-a-a', title: 'Ambiguity Hunt — Differences', formal: 'Given E → E-E | a:' },
    { id: 'concat', given: 'S -> SS | a | b', ref: 'S -> aS | bS | a | b', alpha: ['a', 'b'], check: (w) => /^[ab]+$/.test(w), ex: 'aaa', title: 'Ambiguity Hunt — Concatenation', formal: 'Given S → SS | a | b:' },
    { id: 'dangling', given: 'S -> iS | iSeS | a', ref: 'S -> M | U\nM -> iMeM | a\nU -> iS | iMeU', alpha: ['i', 'e', 'a'], check: dangling, ex: 'iiaea', title: 'Ambiguity Hunt — The Dangling else', formal: 'Given S → iS | iSeS | a   (i = if, e = else, a = action):', maxLen: 7 },
  ].forEach((p) => def('G4', p.id, { given: ['grammar', { text: p.given }], reference: ['grammar', { text: p.ref }] }, (ctx) => {
    const n = grammarSize(p.ref);
    return { variantLabel: p.title.split(' — ')[1], title: p.title, archiveName: 'Unambiguous ' + p.title.split(' — ')[1] + ' Grammar', alphabet: p.alpha, maxLen: p.maxLen || 8, given: ctx.f('given'), oracleFile: 'reference', check: p.check, optimal: n,
      story: 'This tree grows in two different ways from the SAME seed string — a sign of ambiguity. First, find a string that has two distinct parse trees in the given grammar. Then repair the forest: write an UNAMBIGUOUS grammar for the same language.',
      formal: `${p.formal} (1) find w with ≥ 2 parse trees;  (2) write G′ with L(G′) = L(G) and every string having exactly one parse tree.`,
      optional: { text: sizeText(n, 'productions'), check: (g) => g.productions.length <= n },
      hints: [`Try the shortest strings with the repeated pattern, like ${p.ex}. Which way can it group?`, 'Make the grammar force ONE way of grouping — for example by recursing only on one side.', `One unambiguous answer: ${p.ref.replace(/\n/g, ';  ')}`] };
  }));

  /* ======================================================================== */
  /*                                STACK FACTORY                              */
  /* ======================================================================== */
  const PKIND = { le: 'anbmLe', equal: 'eqAB', evenpal: 'evenPal' };
  const pdaPatch = (slot, vid, kind, extra, base) => def(slot, vid, { reference: ['pda', Object.assign({ kind: PKIND[kind] || kind }, extra || {})] }, (ctx) => {
    const ref = ctx.f('reference'), alpha = base.alphabet || ['a', 'b'], big = alpha.length > 3;
    return Object.assign({ oracleFile: 'reference', optimal: ref.transitions.length, alphabet: alpha, maxLen: big ? 6 : alpha.length === 3 ? 8 : 10,
      testOpts: { maxLen: big ? 6 : 8, extra: longPos(base.check, alpha, big ? 6 : alpha.length === 3 ? 7 : 9) },
      hints: [base.h1, base.h2, `A reference solution: ${pdaText(ref)}`] }, base);
  });
  /* ---- P1 ---- */
  [['anb2n', 'The Double-Bay Assembler — aⁿb²ⁿ', 'Every crate needs TWO bays: each a is matched by two b’s.', 'L = { aⁿb²ⁿ | n ≥ 0 }', (w) => /^a*b*$/.test(w) && cnt(w, 'b') === 2 * cnt(w, 'a'), 'Crates (a) arrive first and are pushed on the stack — but every crate must be answered by TWO bays (b).', 'Push TWO markers for every a (or pop one marker per two b’s).'],
    ['a2nbn', 'The Twin-Crate Assembler — a²ⁿbⁿ', 'Crates come in pairs: every bay (b) unloads TWO crates (a).', 'L = { a²ⁿbⁿ | n ≥ 0 }', (w) => /^a*b*$/.test(w) && cnt(w, 'a') === 2 * cnt(w, 'b'), 'Crates (a) arrive first and are pushed; every bay (b) unloads TWO of them.', 'Push a marker only for every SECOND a (the machine needs a state to remember the parity).'],
    ['le', 'The Surplus Assembler — aᵐ…bⁿ, n ≤ m', 'The line may end with crates left over, but never run out: no more bays than crates.', 'L = { aⁿbᵐ | 0 ≤ m ≤ n }', (w) => /^a*b*$/.test(w) && cnt(w, 'b') <= cnt(w, 'a'), 'Leftover crates are fine — the stack does not need to end empty, but a bay with no crate to unload is an underflow.', 'Both q0 and q1 can be accepting: leftover crates are allowed.'],
    ['equal', 'The Shuffle Assembler — #a = #b', 'Crates and bays arrive in ANY order; the line balances when there are as many as the other.', 'L = { w ∈ {a,b}* | #a(w) = #b(w) }', (w) => cnt(w, 'a') === cnt(w, 'b'), 'The stack holds the SURPLUS: either a pile of a-markers or a pile of b-markers, never both.', 'If the top is the opposite marker (or Z) — act accordingly: pop on opposite, push on same/Z.'],
  ].forEach(([vid, title, tag, formal, check, h1, h2]) => pdaPatch('P1', vid, vid, null, {
    variantLabel: title.split(' — ')[1] || vid, title, tagline: tag, archiveName: title.split(' — ')[0].replace('The ', '') + ' Stack PDA', check, alphabet: ['a', 'b'],
    story: `${h1} Can a DFA do this? Complete the Memory Check first, then build the PDA.`, formal: `${formal}   (acceptance by final state, bottom marker Z)`, objective: `Build a PDA for ${formal.replace('L = ', '')}.`, h1, h2,
  }));
  /* ---- P2 · other bracket kinds ---- */
  [['square', '[', ']', 'Bracket Press'], ['curly', '{', '}', 'Brace Press']].forEach(([vid, o, c, name]) => pdaPatch('P2', vid, 'dyck1', { o, c }, { variantLabel: name, title: name, archiveName: `Balanced-${name.split(' ')[0]} PDA`, alphabet: [o, c], check: balancedOf({ [o]: c }),
    story: `The press only works on correctly nested ${o} ${c}. Each ${o} pushes a plate; each ${c} removes one; the press must never try to remove a plate that is not there (stack underflow) and must end empty.`,
    formal: `L = { w ∈ {${o},${c}}* | w is balanced }`, objective: `Build a PDA for balanced ${o}${c} strings.`, h1: 'One stack symbol is enough: push on the opener, pop on the closer.', h2: 'A closer with nothing to pop has no transition → the computation dies → reject. That is exactly stack underflow.' }));
  pdaPatch('P2', 'dyck2', 'dyck2', null, { variantLabel: 'Twin Press', title: 'Twin Press — Two Kinds of Plates', archiveName: 'Two-Bracket PDA', alphabet: ['(', ')', '[', ']'], check: balancedOf({ '(': ')', '[': ']' }),
    story: 'The twin press stamps round ( ) plates and square [ ] plates. Each closer must remove the plate of ITS OWN kind — so the stack has to remember WHICH kind each plate is.', formal: 'L = { w ∈ {(,),[,]}* | all brackets are matched by their own kind, properly nested }', objective: 'Build a PDA for round-and-square brackets.',
    h1: 'Use two stack symbols, one per kind of plate.', h2: 'On ( push P; on [ push K. On ) the top must be P; on ] the top must be K — otherwise there is no transition and the run dies.' });
  /* ---- P3 ---- */
  [['anbmcn', 'The Split-Rail Mould — aⁿbᵐcⁿ', 'Crates a … then any number of b … then as many c as the crates a.', 'L = { aⁿ bᵐ cⁿ | n, m ≥ 0 }', (w) => /^a*b*c*$/.test(w) && cnt(w, 'a') === cnt(w, 'c'), ['a', 'b', 'c'], 'Push on a, ignore the b’s completely, pop on c.', 'The b’s do not touch the stack at all.'],
    ['anbncm', 'The Tail Rail Mould — aⁿbⁿcᵐ', 'Equal a’s and b’s, followed by any number of c’s.', 'L = { aⁿ bⁿ cᵐ | n, m ≥ 0 }', (w) => /^a*b*c*$/.test(w) && cnt(w, 'a') === cnt(w, 'b'), ['a', 'b', 'c'], 'First match a’s with b’s using the stack, then accept any c’s once the stack is empty.', 'Move to a “tail” state that loops on c — only when Z is on top.'],
    ['evenpal', 'The Blind Mirror Mould — wwᴿ', 'A pattern then its reverse, with NO divider: the machine must guess where the middle is.', 'L = { w wᴿ | w ∈ {a,b}* }', (w) => w.length % 2 === 0 && w === rev(w), ['a', 'b'], 'Push while reading w, then pop while reading wᴿ — but nothing tells you where the middle is.', 'Use an ε-transition to GUESS the middle (nondeterminism is essential here).'],
  ].forEach(([vid, title, tag, formal, check, alpha, h1, h2]) => def('P3', vid, { reference: ['pda', { kind: PKIND[vid] || vid }] }, (ctx) => {
    const ref = ctx.f('reference'), big = alpha.length > 2;
    return { variantLabel: title.split(' — ')[1], title, tagline: tag, archiveName: title.split(' — ')[0] + ' PDA', alphabet: alpha, oracleFile: 'reference', check, optimal: ref.transitions.length, maxLen: big ? 8 : 10, testOpts: { maxLen: big ? 6 : 8, extra: longPos(check, alpha, big ? 7 : 9) },
      story: `${tag} A stack remembers the first half for the second.`, formal, objective: `Build a PDA for ${formal.replace('L = ', '')}.`,
      optional: { text: sizeText(ref.transitions.length, 'transitions'), check: (m) => m.transitions.length <= ref.transitions.length },
      hints: [h1, h2, `A reference solution: ${pdaText(ref)}`] };
  }));

  /* ======================================================================== */
  /*                                 TURING LAB                                */
  /* ======================================================================== */
  const tmPatch = (slot, vid, kind, base) => def(slot, vid, { reference: ['tm', { kind }] }, (ctx) => {
    const ref = ctx.f('reference');
    return Object.assign({ oracleFile: 'reference', optimal: ref.transitions.length, optional: { text: `Use at most ${ref.states.length} states.`, check: (m) => m.states.length <= ref.states.length },
      hints: [base.h1, base.h2, `A reference solution: ${tmText(ref)}`] }, base);
  });
  const trans = (title, tag, story, formal, h1, h2, f) => ({ variantLabel: title, title, tagline: tag, archiveName: title + ' TM', story, formal, objective: `Build a Turing machine for this task — ${formal.split('. ')[0]}.`, h1, h2, check: f });
  /* ---- T1 ---- */
  [['allOnes', trans('The Flood Machine', 'Overwrite everything', 'The lab\'s flood machine turns every cell of the tape into 1 — whatever was written there before. The head starts on the leftmost cell.', 'f(w) = 1^|w| (every cell becomes 1). Head starts at the leftmost symbol.', 'Sweep right once, writing 1 on each cell.', 'On 0 write 1, on 1 write 1, both move right; on blank enter the final state.', (w) => '1'.repeat(w.length))],
    ['append1', trans('The Tail Writer', 'Write past the end', 'The tail writer walks to the end of the number and writes one extra 1 on the first blank cell after it.', 'f(w) = w1 (append a 1). Head starts at the leftmost symbol.', 'Walk right over the input without changing it.', 'On the first blank cell write 1 and halt in the final state.', (w) => w + '1')],
    ['double', trans('The Doubler', 'Multiply by two', 'In binary, appending a 0 doubles a number. Build the machine that doubles the tape.', 'f(w) = w0 (append a 0 = multiply by 2). Head starts at the leftmost symbol.', 'Walk right over the input without changing it.', 'On the first blank write 0 and halt in the final state.', (w) => w + '0')],
    ['first1', trans('The Leader', 'Change only the first cell', 'The leader machine forces the FIRST bit of the tape to 1 and leaves everything else alone.', 'f(w) = 1 followed by w without its first bit (empty stays empty). Head starts at the leftmost symbol.', 'You never need to move: act on the first cell immediately.', 'On 0 or 1 write 1 and go to the final state; on a blank (empty tape) just halt.', (w) => (w.length ? '1' + w.slice(1) : ''))],
    ['parity', trans('The Parity Stamper', 'Remember with states', 'The stamper walks the tape and appends a parity bit: 1 if the number of 1s is odd, otherwise 0.', 'f(w) = w · (#1(w) mod 2). Head starts at the leftmost symbol.', 'The machine needs to remember whether it has seen an even or an odd number of 1s — that is two states.', 'States e/o: a 1 flips between them, 0 does nothing. At the blank write 0 (from e) or 1 (from o).', (w) => w + (cnt(w, '1') % 2))],
  ].forEach(([kind, b]) => tmPatch('T1', kind, kind, Object.assign({ tmKind: 'transform' }, b)));
  /* ---- T2 ---- */
  const T2optional = (m, ctx0) => G.testsFor(G.challengeById('T2')).every((t) => { const r = TM.run(m, t.w, { traceLimit: 0, maxSteps: 400 }); return r.status === 'accepted' && r.steps <= 2 * t.w.length + 2; });
  [['dec', trans('Binary Decrementer', 'Borrowing on a tape', 'Subtract one from a binary number written on the tape (most significant bit first). Borrows ripple leftwards: 1000 → 0111. The number is never zero, and keeps its length. The head starts on the leftmost bit.', 'f(w) = binary(value(w) − 1) with |w| digits (inputs that are all zeros are never given).', 'Go to the right end first, then work leftwards doing the borrow.', 'Moving left: a 0 becomes 1 and the borrow continues; the first 1 becomes 0 and you stop.', (w) => (parseInt(w, 2) - 1).toString(2).padStart(w.length, '0')), { tmFilter: (w) => /1/.test(w) }],
    ['incwrap', trans('Wrap-Around Counter', 'Overflow wraps to zero', 'An odometer on the tape: add one to the binary number, but an overflow wraps around — the tape keeps its width (111 → 000). The head starts on the leftmost bit.', 'f(w) = (value(w) + 1) mod 2^|w|, written with |w| digits.', 'Go to the right end first, then carry leftwards.', 'A 1 becomes 0 and the carry continues; the first 0 becomes 1 and you stop. If the carry falls off the left end just stop.', (w) => ((parseInt(w, 2) + 1) % 2 ** w.length).toString(2).padStart(w.length, '0')), {}],
    ['flipLast', trans('Last-Bit Flipper', 'Edit at the far end', 'Only the LAST bit of the number is complemented — useful for toggling a number\'s parity. The head starts on the leftmost bit.', 'f(w) = w with its last bit complemented.', 'Walk to the right end first, then step back one cell.', 'On the blank step left; on 0 write 1 (halt); on 1 write 0 (halt).', (w) => w.slice(0, -1) + (w.slice(-1) === '0' ? '1' : '0')), {}],
  ].forEach(([kind, b, extra]) => tmPatch('T2', kind === 'flipLast' ? 'flast' : kind, kind, Object.assign({ tmKind: 'transform', tmSkipEmpty: true, optional: { text: 'Finish within 2n + 2 steps on every test input.', check: T2optional } }, extra, b)));
  /* ---- T3 ---- */
  [['palin', trans('The Palindrome Decider', 'Compare the ends', 'A decider must ALWAYS halt. This one accepts palindromes: erase the first letter, run to the far end, check the last letter matches, erase it, and repeat.', 'Decide L = { w ∈ {a,b}* | w = wᴿ }: halt in a final state iff w ∈ L; otherwise halt (no transition) in a non-final state.', 'Remember the first letter in a state, erase it, walk to the right end and compare.', 'If the ends match, erase the last letter, walk back to the left end and repeat; if only one letter (or none) is left, accept.', (w) => w === rev(w)), { alphabet: ['a', 'b'], tmMaxLen: 8 }],
    ['equal', trans('The Balance Decider', 'Count without counting', 'A decider for strings with the same number of a’s and b’s, in ANY order: cross off one a and one b at a time.', 'Decide L = { w ∈ {a,b}* | #a(w) = #b(w) }: halt in a final state iff w ∈ L.', 'Cross off the first unmarked letter, then find an unmarked letter of the OTHER kind and cross it off too.', 'Rewind to the left end after every pair. When nothing unmarked is left, accept; if you cannot find a partner, reject.', (w) => cnt(w, 'a') === cnt(w, 'b')), { alphabet: ['a', 'b'], tmMaxLen: 8 }],
    ['abc', trans('The Triple Decider', 'Three letters, one count', 'Mark one a, one b and one c per round. If all three letters run out together, accept.', 'Decide L = { aⁿbⁿcⁿ | n ≥ 0 }: halt in a final state iff w ∈ L.', 'Cross off one a (X), then one b (Y), then one c (Z), and return to the left.', 'When no a is left, verify that only Y’s and Z’s remain; any leftover letter means reject.', (w) => /^a*b*c*$/.test(w) && cnt(w, 'a') === cnt(w, 'b') && cnt(w, 'b') === cnt(w, 'c')), { alphabet: ['a', 'b', 'c'], tmMaxLen: 6 }],
  ].forEach(([kind, b, extra]) => tmPatch('T3', kind === 'equal' ? 'equalab' : kind, kind === 'equal' ? 'equalAB' : kind === 'abc' ? 'anbncn' : kind, Object.assign({ tmKind: 'decide' }, extra, b)));

  /* ======================================================================== */
  /*                                  VOID ZONE                                */
  /* ======================================================================== */
  const runSteps = (m, input, max) => TM.run(m, input, { traceLimit: 0, maxSteps: max, detectLoop: true });
  [{ id: 'dock', K1: 4, K2: 19, n: 7, pace: 4, runaway: 'zebra', names: ['Dasher', 'Ticker', 'Patroller', 'Zebra', 'Hidden Ticker'] },
    { id: 'pier', K1: 6, K2: 20, n: 3, pace: 2, runaway: 'ones', names: ['Sprint-3', 'Odometer', 'Shuttle', 'Flood', 'Giant Odometer'] },
    { id: 'quay', K1: 5, K2: 19, n: 9, pace: 4, runaway: 'ones', names: ['Runner', 'Counter', 'Circuit', 'Gusher', 'Deep Counter'] }].forEach((p) => {
    const files = { A: ['voidSet', p, 'A'], B: ['voidSet', p, 'B'], C: ['voidSet', p, 'C'], D: ['voidSet', p, 'D'], E: ['voidSet', p, 'E'] };
    def('V1', p.id, files, (ctx) => {
      const mA = ctx.f('A'), mB = ctx.f('B'), mC = ctx.f('C'), mD = ctx.f('D'), mE = ctx.f('E');
      const stepsB = runSteps(mB, '>', 2e6).steps, inputA = '1'.repeat(p.n), stepsA = runSteps(mA, inputA, 1000).steps;
      const machines = [
        { id: 'A', name: p.names[0], input: inputA, machine: mA, truth: 'halts', blurb: `Runs along a tape of ${p.n} ones.`, reveal: `${p.names[0]} halts after ${stepsA} steps. Observation PROVED it halts — halting is semi-decidable: if a machine halts, running it long enough shows that.` },
        { id: 'B', name: `${p.names[1]} (K=${p.K1})`, input: '>', machine: mB, truth: 'halts', blurb: `Counts up in binary until ${'1'.repeat(p.K1)}.`, reveal: `${p.names[1]}(${p.K1}) halts — but only after ${stepsB.toLocaleString('en-US')} steps. At small step limits it looked like it might never stop. Patience paid off!` },
        { id: 'C', name: p.names[2], input: '', machine: mC, truth: 'loops', blurb: p.pace === 2 ? 'Steps right, steps left, forever.' : 'Walks two cells right, then two cells left, forever.', reveal: `${p.names[2]} returns to the exact same configuration (same state, same head position, same tape). A repeated configuration PROVES it will never halt — but this trick only works for special machines.` },
        { id: 'D', name: p.names[3], input: '', machine: mD, truth: 'unknown', hidden: 'never halts', blurb: p.runaway === 'ones' ? 'Writes 1s and runs off to the right.' : 'Writes 1,0,1,0… and runs off to the right.', reveal: `${p.names[3]} never halts (it keeps writing to fresh cells) — but NO number of observed steps could prove it. Its configurations never repeat, so there is no loop to detect.` },
        { id: 'E', name: `${p.names[4]} (K=${p.K2})`, input: '>', machine: mE, truth: 'unknown', hidden: 'halts after millions of steps', blurb: `Same program as ${p.names[1]}… with a bigger K.`, reveal: `${p.names[4]} is the SAME program as ${p.names[1]} but with K = ${p.K2}: it does halt, after millions of steps. At every limit the game offers it looks exactly like ${p.names[3]}. Observation alone can never tell them apart.` },
      ];
      return { variantLabel: `Batch ${p.id}`, title: `The Halting Probe — ${cap(p.id)} Batch`, void: { machines },
        hints: ['A machine that halts reveals itself — if you run it long enough. Try larger step limits.', 'If a configuration (state, head, tape) ever repeats exactly, the machine is in a loop and can never halt — the probe reports this.', `${p.names[3]} and ${p.names[4]} both look “still running” at every limit. Neither can be proved either way by observation.`] };
    });
  });

  const PROOF_NAMES = [['Oracle', 'Rebel'], ['Judge', 'Contrarian'], ['Seer', 'Spoiler']];
  const POOL_DEC = [
    { id: 'd1', text: 'Do two DFAs accept the same language?', why: 'Product automaton + reachability — exactly what Regular City’s verifier does.' },
    { id: 'd2', text: 'Does a CFG generate a given string? (CYK)', why: 'CYK parsing in O(n³) — the Grammar Forest uses it.' },
    { id: 'd3', text: 'Is the language of a DFA empty?', why: 'Check reachability of an accepting state.' },
    { id: 'd4', text: 'Does a given DFA accept a given string?', why: 'Just run it: one step per symbol.' },
    { id: 'd5', text: 'Is the language of a CFG empty?', why: 'Compute the productive nonterminals; the language is empty iff the start symbol is not productive.' },
    { id: 'd6', text: 'Does a given PDA accept a given string?', why: 'Convert to a CFG and run CYK — or search the (finite) space of configurations with a length bound.' },
    { id: 'd7', text: 'Is a DFA’s language equal to Σ* (accepts everything)?', why: 'Complement it and check emptiness by reachability.' },
  ];
  const POOL_UND = [
    { id: 'u1', text: 'Does a Turing machine halt on input w?', why: 'The Halting Problem.' },
    { id: 'u2', text: 'Do two CFGs generate the same language?', why: 'Equivalence of CFGs is undecidable — which is why the Forest verifies up to a length bound instead.' },
    { id: 'u3', text: 'Is a given CFG ambiguous?', why: 'Ambiguity of CFGs is undecidable; we can only search for witnesses.' },
    { id: 'u4', text: 'Does a Turing machine accept input w? (A_TM)', why: 'A_TM is undecidable (and semi-decidable): reduce from the Halting Problem.' },
    { id: 'u5', text: 'Does a Turing machine accept NO input at all? (E_TM)', why: 'Emptiness of a TM’s language is undecidable (Rice’s theorem).' },
    { id: 'u6', text: 'Is the language of a given Turing machine regular?', why: 'Any non-trivial property of the language of a TM is undecidable (Rice’s theorem).' },
    { id: 'u7', text: 'Does a CFG generate EVERY string over its alphabet?', why: 'Universality of CFGs is undecidable (although it is decidable for DFAs).' },
  ];
  [{ id: 'oracle', names: PROOF_NAMES[0], dec: [0, 3, 6], und: [1, 3, 5], rot: 1 }, { id: 'judge', names: PROOF_NAMES[1], dec: [1, 4, 5], und: [0, 4, 6], rot: 2 }, { id: 'seer', names: PROOF_NAMES[2], dec: [2, 3, 4], und: [2, 1, 6], rot: 0 }].forEach((p) => {
    def('V2', p.id, {}, () => {
      const [H, D] = p.names;
      const rot = (arr, ans) => { const r = p.rot % arr.length, o = arr.slice(r).concat(arr.slice(0, r)); return { options: o, answer: o.indexOf(arr[ans]) }; };
      const o1 = rot(['It halts', 'It loops forever', 'It depends on the tape'], 1), o2 = rot(['It loops forever', 'It halts', 'It crashes'], 1), o3 = rot([`${H} was just badly written`, `No such decider ${H} can exist`, `${D} must be a faulty machine`], 1);
      const proof = [
        { id: 'q1', q: `Suppose ${H}(${D}, ${D}) answers “${D} halts on input ${D}”. What does ${D}(${D}) actually do?`, options: o1.options, answer: o1.answer, why: `${D} loops whenever ${H} says “halts” — so ${D}(${D}) loops, and ${H} was WRONG.` },
        { id: 'q2', q: `Now suppose ${H}(${D}, ${D}) answers “${D} loops on input ${D}”. What does ${D}(${D}) actually do?`, options: o2.options, answer: o2.answer, why: `${D} halts whenever ${H} says “loops” — so ${D}(${D}) halts, and ${H} was WRONG again.` },
        { id: 'q3', q: `Whichever answer ${H} gives about ${D}(${D}), it is wrong. What follows?`, options: o3.options, answer: o3.answer, why: `The only assumption was that ${H} exists and always answers correctly. That assumption is contradictory — HALT is undecidable.` },
      ];
      const items = []; for (let i = 0; i < 3; i++) { items.push(Object.assign({}, POOL_DEC[p.dec[i]], { answer: 'decidable' })); items.push(Object.assign({}, POOL_UND[p.und[i]], { answer: 'undecidable' })); }
      const classify = items.map((x, i) => ({ id: 'c' + (i + 1), text: x.text, answer: x.answer, why: x.why }));
      return { variantLabel: `${H} & ${D}`, title: `The Paradox Machine — ${D} vs ${H}`, void: { proof, classify },
        story: `Suppose a perfect oracle ${H} could decide, for every machine M and input w, whether M halts. Turing's diagonal trick builds a machine ${D} that does the opposite of whatever ${H} predicts about ${D} itself. Walk through the argument — then sort real problems into decidable and undecidable.`,
        formal: `Assume ${H} decides HALT. Define ${D}(M): if ${H}(M,M) says “halts” then loop forever, else halt. Consider ${D}(${D}).`,
        hints: [`If ${H}(${D},${D}) answers “halts”, ${D} deliberately loops — so what does ${D}(${D}) really do?`, `If ${H}(${D},${D}) answers “loops”, ${D} deliberately halts. Either answer is wrong, so ${H} cannot exist.`, 'Rice’s theorem: any non-trivial question about WHAT a Turing machine computes is undecidable. Questions about finite automata are decidable.'] };
    });
  });

  /* ======================================================================== */
  /*                         engine: materialise / roll / activate             */
  /* ======================================================================== */
  const BASE = {}, cache = new Map();
  let inited = false;
  V.init = function () {
    if (inited) return; inited = true;
    for (const slot of Object.keys(pools)) {
      const ch = G.challengeById(slot);
      BASE[slot] = Object.assign({}, ch, { variantId: 'base', variantLabel: 'Classic' });
      if (slot === 'V1') BASE[slot].void = { machines: G.VOID_MACHINES.slice() };
      if (slot === 'V2') BASE[slot].void = { proof: G.VOID_PROOF.slice(), classify: G.VOID_CLASSIFY.slice() };
      Object.assign(ch, { variantId: 'base', variantLabel: 'Classic' });
      V.current[slot] = 'base';
    }
  };
  V.slots = () => Object.keys(pools);
  V.poolOf = (slot) => (pools[slot] || [{ id: 'base' }]).map((e) => e.id);
  V.fileSpecs = () => { const out = []; for (const [slot, list] of Object.entries(pools)) for (const e of list) for (const [role, spec] of Object.entries(e.files || {})) out.push({ slot, vid: e.id, role, key: key(slot, e.id, role), spec }); return out; };
  /** which variant a level-file key belongs to ('base' for the classic files) */
  V.fileVariant = (k) => { const slot = k.split('_')[0]; for (const e of pools[slot] || []) if (e.id !== 'base' && k.startsWith(slot + '_' + e.id + '_')) return e.id; return 'base'; };
  V.totalVariants = () => Object.values(pools).reduce((a, l) => a + l.length, 0);

  function finish(ch, patch) {
    if (patch.oracleFile) {
      G.bindOracle(ch, key(ch.id, ch.variantId, patch.oracleFile), { keepCheck: true });
      if (patch.optimal === undefined) ch.optimal = G.sizeOf(ch, ch.oracle);
    } else if (patch.reference) {
      const ref = patch.reference; ch.levelFile = ref.levelFile;
      ch.pred = (w) => FA.accepts(ref, w);
      if (ch.optimal === 'auto') ch.optimal = FA.minimalSize(ref, ch.alphabet);
    }
    if (ch.kind === 'twin') for (const r of ch.rounds) { /* machines already loaded */ void r; }
    ch.extraExamples = patch.extraExamples || [];
  }
  /** build (and cache) the complete challenge object for a variant — does NOT touch the live challenge */
  V.materialize = function (slot, vid) {
    V.init();
    const k = slot + ':' + vid;
    if (cache.has(k)) return cache.get(k);
    let out;
    if (vid === 'base' || !pools[slot]) out = Object.assign({}, BASE[slot] || G.challengeById(slot));
    else {
      const e = pools[slot].find((x) => x.id === vid);
      if (!e) throw new Error(`Unknown variant ${slot}/${vid}`);
      const ctx = { f: (role) => G.loadLevelFile(key(slot, vid, role)) };
      const patch = e.make(ctx);
      out = Object.assign({}, BASE[slot], patch, { variantId: vid });
      finish(out, patch);
    }
    cache.set(k, out); return out;
  };
  function applyVoid(v) {
    if (!v) return;
    if (v.machines) G.VOID_MACHINES.splice(0, G.VOID_MACHINES.length, ...v.machines);
    if (v.proof) G.VOID_PROOF.splice(0, G.VOID_PROOF.length, ...v.proof);
    if (v.classify) G.VOID_CLASSIFY.splice(0, G.VOID_CLASSIFY.length, ...v.classify);
  }
  /** make `vid` the live challenge for the slot (the challenge object keeps its identity) */
  V.activate = function (slot, vid) {
    const m = V.materialize(slot, vid), ch = G.challengeById(slot);
    for (const k of Object.keys(ch)) delete ch[k];
    Object.assign(ch, m);
    applyVoid(m.void);
    V.current[slot] = vid;
    return ch;
  };
  V.info = function (slot) {
    const ch = G.challengeById(slot), ids = V.poolOf(slot);
    return { slot, id: ch.variantId || 'base', label: ch.variantLabel || 'Classic', index: Math.max(0, ids.indexOf(ch.variantId || 'base')) + 1, total: ids.length, seed: V.seed };
  };
  V.rerollable = (slot) => V.poolOf(slot).length > 1;

  /* ---------------- rolling ---------------- */
  const hash = (str) => { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const history = () => { const s = G.Store && G.Store.state; if (!s) return {}; return (s.variantHistory = s.variantHistory || {}); };
  const remember = (slot, vid) => { const h = history(), a = (h[slot] = h[slot] || []); a.push(vid); h[slot] = a.slice(-3); };
  function pick(slot, rng, fixed) {
    const ids = V.poolOf(slot), recent = fixed ? [] : (history()[slot] || []).slice(-(ids.length >= 4 ? 2 : 1));
    let cands = ids.filter((i) => !recent.includes(i)); if (!cands.length) cands = ids;
    return cands[Math.floor(rng() * cands.length)];
  }
  V.newSeed = () => Math.random().toString(36).slice(2, 8);
  /** roll one variant per slot. opts: { seed, classic } */
  V.rollAll = function (opts = {}) {
    V.init();
    const classic = opts.classic !== undefined ? opts.classic : !!(G.Store && G.Store.state && G.Store.state.settings.randomize === false);
    const fixed = !!opts.seed; V.seed = opts.seed || V.newSeed(); V.classic = classic;
    for (const slot of V.slots()) {
      let vid = 'base';
      if (!classic) vid = pick(slot, F.rng(hash(V.seed + ':' + slot)), fixed);
      V.activate(slot, vid); if (!classic && !fixed) remember(slot, vid);
    }
    if (G.Store && G.Store.state) G.Store.save();
    return V.snapshot();
  };
  /** swap a single slot to a different variant than the current one */
  V.reroll = function (slot) {
    V.init();
    const ids = V.poolOf(slot), cur = V.current[slot] || 'base';
    const cands = ids.filter((i) => i !== cur); if (!cands.length) return G.challengeById(slot);
    const rng = F.rng(hash(`${V.seed}:${slot}:${++V.count}:${Date.now()}`));
    const vid = cands[Math.floor(rng() * cands.length)];
    V.activate(slot, vid); remember(slot, vid);
    if (G.Store && G.Store.state) G.Store.save();
    return G.challengeById(slot);
  };
  V.snapshot = () => { const o = {}; for (const s of V.slots()) o[s] = V.current[s]; return o; };
  V.init();
})();
