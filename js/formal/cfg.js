/* ============================================================================
 * FORMAL LAYER · Context-free grammars
 *   parse text · CNF conversion (with steps) · CYK membership · parse trees ·
 *   ambiguity detection · leftmost derivations · bounded generation/verification
 * Convention (same as JFLAP): a NONTERMINAL is an upper-case letter, optionally
 * followed by apostrophes (S, S', A''). Everything else is a terminal. ε = empty.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F;
  const CFG = (F.CFG = {});

  const isNT = (t) => /^[A-Z]'*$/.test(t);
  CFG.isNT = isNT;

  CFG.tokenize = function (str) {
    const s = [...(str || '')];
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === 'ε' || c === 'λ') continue;
      if (/[A-Z]/.test(c)) {
        let tok = c;
        while (s[i + 1] === "'") { tok += "'"; i++; }
        out.push(tok);
      } else out.push(c);
    }
    return out;
  };

  /** Parse "S -> aSb | ε" style text. Returns { grammar, errors, warnings } */
  CFG.parseText = function (text) {
    const errors = [], warnings = [];
    const prods = [];
    const lines = String(text || '').split(/\r?\n/);
    lines.forEach((raw, ln) => {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) return;
      const m = line.match(/^(.*?)\s*(->|→|::=|=>|:)\s*(.*)$/);
      if (!m) { errors.push(`Line ${ln + 1}: expected "A -> α | β" but found "${line}".`); return; }
      const left = m[1].trim();
      if (!isNT(left)) { errors.push(`Line ${ln + 1}: left side "${left}" must be a single upper-case nonterminal (e.g. S, A, S').`); return; }
      const alts = m[3].split('|');
      for (const alt of alts) {
        const a = alt.trim();
        const right = /^(ε|λ|eps|epsilon|)$/i.test(a) ? [] : CFG.tokenize(a);
        prods.push({ left, right });
      }
    });
    const lefts = new Set(prods.map((p) => p.left));
    const start = lefts.has('S') ? 'S' : prods.length ? prods[0].left : 'S';
    const g = { type: 'CFG', start, productions: prods.map((p, i) => ({ id: 'p' + i, ...p })) };
    const undefd = new Set();
    for (const p of prods) for (const t of p.right) if (isNT(t) && !lefts.has(t)) undefd.add(t);
    if (undefd.size) warnings.push(`Nonterminal(s) ${[...undefd].join(', ')} are used but never defined — they can never be eliminated, so no string derives through them.`);
    if (!prods.length) errors.push('Write at least one production, e.g.  S -> aSb | ε');
    const seen = new Set();
    for (const p of prods) { const k = p.left + '>' + p.right.join(' '); if (seen.has(k)) warnings.push(`Duplicate production ${CFG.prodText(p)}.`); seen.add(k); }
    return { grammar: g, errors, warnings };
  };
  CFG.prodText = (p) => `${p.left} → ${p.right.length ? p.right.join('') : 'ε'}`;
  CFG.toText = function (g) {
    const order = [];
    const by = new Map();
    for (const p of g.productions) { if (!by.has(p.left)) { by.set(p.left, []); order.push(p.left); } by.get(p.left).push(p.right.length ? p.right.join('') : 'ε'); }
    return order.map((l) => `${l} -> ${by.get(l).join(' | ')}`).join('\n');
  };
  CFG.clone = (g) => ({ type: 'CFG', start: g.start, productions: g.productions.map((p, i) => ({ id: p.id || 'p' + i, left: p.left, right: [...p.right] })) });
  CFG.terminals = (g) => [...new Set(g.productions.flatMap((p) => p.right.filter((t) => !isNT(t))))].sort();
  CFG.nonterminals = (g) => [...new Set([g.start, ...g.productions.flatMap((p) => [p.left, ...p.right.filter(isNT)])])];

  /* ---------- analysis ---------- */
  CFG.nullable = function (g) {
    const nul = new Set();
    let ch = true;
    while (ch) {
      ch = false;
      for (const p of g.productions) if (!nul.has(p.left) && p.right.every((t) => isNT(t) && nul.has(t))) { nul.add(p.left); ch = true; }
    }
    return nul;
  };
  CFG.productive = function (g) {
    const pr = new Set();
    let ch = true;
    while (ch) {
      ch = false;
      for (const p of g.productions) if (!pr.has(p.left) && p.right.every((t) => !isNT(t) || pr.has(t))) { pr.add(p.left); ch = true; }
    }
    return pr;
  };
  CFG.reachableNT = function (g) {
    const r = new Set([g.start]);
    let ch = true;
    while (ch) {
      ch = false;
      for (const p of g.productions) if (r.has(p.left)) for (const t of p.right) if (isNT(t) && !r.has(t)) { r.add(t); ch = true; }
    }
    return r;
  };
  CFG.isCNF = function (g) {
    const startOnRhs = g.productions.some((p) => p.right.includes(g.start));
    return g.productions.every((p) => {
      if (p.right.length === 0) return p.left === g.start && !startOnRhs;
      if (p.right.length === 1) return !isNT(p.right[0]);
      if (p.right.length === 2) return isNT(p.right[0]) && isNT(p.right[1]) && p.right[0] !== g.start && p.right[1] !== g.start;
      return false;
    });
  };

  /* ---------- Chomsky Normal Form (with a teaching log) ---------- */
  function freshNT(used, hint) {
    const letters = 'ABCDEFGHIJKLMNOPQRTUVWXYZ';
    if (hint && /^[A-Z]$/.test(hint) && !used.has(hint)) { used.add(hint); return hint; }
    for (const l of letters) if (!used.has(l)) { used.add(l); return l; }
    let t = 'Z\'';
    while (used.has(t)) t += "'";
    used.add(t);
    return t;
  }
  const dedupe = (prods) => {
    const seen = new Set(), out = [];
    for (const p of prods) { const k = p.left + '>' + p.right.join('\u0001'); if (!seen.has(k)) { seen.add(k); out.push(p); } }
    return out;
  };
  const snap = (prods, start) => CFG.toText({ start, productions: prods });

  CFG.toCNF = function (g) {
    let prods = g.productions.map((p) => ({ left: p.left, right: [...p.right] }));
    let start = g.start;
    const used = new Set(CFG.nonterminals(g));
    const steps = [];
    const log = (title, why) => steps.push({ title, why, text: snap(prods, start), count: prods.length });
    log('Original grammar', 'The grammar as you wrote it.');

    // 1. START
    if (prods.some((p) => p.right.includes(start))) {
      const ns = start + "'";
      let n = ns; while (used.has(n)) n += "'";
      used.add(n);
      prods.unshift({ left: n, right: [start] });
      start = n;
      log('START — fresh start symbol', 'The start symbol appears on a right-hand side, so we introduce a new start symbol ' + n + ' → ' + prods[0].right[0] + '.');
    }
    // 2. DEL (ε-productions)
    {
      const nul = CFG.nullable({ start, productions: prods });
      const next = [];
      for (const p of prods) {
        const nulPos = p.right.map((t, i) => (isNT(t) && nul.has(t) ? i : -1)).filter((i) => i >= 0);
        const total = 1 << Math.min(nulPos.length, 12);
        for (let mask = 0; mask < total; mask++) {
          const drop = new Set(nulPos.filter((_, k) => mask & (1 << k)));
          const right = p.right.filter((_, i) => !drop.has(i));
          if (right.length === 0) continue;
          next.push({ left: p.left, right });
        }
      }
      if (nul.has(start)) next.push({ left: start, right: [] });
      prods = dedupe(next);
      log('DEL — remove ε-productions', `Nullable nonterminals: ${[...nul].join(', ') || 'none'}. Every production gets copies with each nullable symbol optionally dropped; A → ε is removed${nul.has(start) ? ' (except for the start symbol, because ε ∈ L)' : ''}.`);
    }
    // 3. UNIT
    {
      const nts = [...new Set(prods.map((p) => p.left))];
      const unit = new Map(nts.map((a) => [a, new Set([a])]));
      let ch = true;
      while (ch) {
        ch = false;
        for (const p of prods) if (p.right.length === 1 && isNT(p.right[0])) {
          for (const [a, set] of unit) if (set.has(p.left) && !set.has(p.right[0])) { set.add(p.right[0]); ch = true; }
        }
      }
      const next = [];
      for (const [a, set] of unit) for (const b of set) for (const p of prods) if (p.left === b && !(p.right.length === 1 && isNT(p.right[0]))) next.push({ left: a, right: [...p.right] });
      prods = dedupe(next);
      log('UNIT — remove unit productions', 'Every A → B (one nonterminal) is replaced by copying the non-unit rules of B (and of everything B reaches by unit steps) into A.');
    }
    // 4. USELESS
    {
      const pr = CFG.productive({ start, productions: prods });
      prods = prods.filter((p) => pr.has(p.left) && p.right.every((t) => !isNT(t) || pr.has(t)));
      const re = CFG.reachableNT({ start, productions: prods });
      prods = prods.filter((p) => re.has(p.left));
      log('CLEAN — remove useless symbols', 'Drop nonterminals that derive no string or are unreachable from the start symbol.');
    }
    // 5. TERM
    {
      const termNT = new Map();
      const next = [];
      for (const p of prods) {
        if (p.right.length >= 2 && p.right.some((t) => !isNT(t))) {
          const right = p.right.map((t) => {
            if (isNT(t)) return t;
            if (!termNT.has(t)) termNT.set(t, freshNT(used, /[a-z]/.test(t) ? t.toUpperCase() : undefined));
            return termNT.get(t);
          });
          next.push({ left: p.left, right });
        } else next.push(p);
      }
      for (const [t, nt] of termNT) next.push({ left: nt, right: [t] });
      prods = dedupe(next);
      log('TERM — isolate terminals', termNT.size ? 'In rules with 2+ symbols every terminal is replaced by a new nonterminal: ' + [...termNT].map(([t, n]) => `${n}→${t}`).join(', ') + '.' : 'Nothing to do: no mixed right-hand sides.');
    }
    // 6. BIN
    {
      const next = [];
      let made = 0;
      for (const p of prods) {
        if (p.right.length <= 2) { next.push(p); continue; }
        let left = p.left;
        const syms = p.right;
        for (let i = 0; i < syms.length - 2; i++) {
          const nn = freshNT(used);
          made++;
          next.push({ left, right: [syms[i], nn] });
          left = nn;
        }
        next.push({ left, right: [syms[syms.length - 2], syms[syms.length - 1]] });
      }
      prods = dedupe(next);
      log('BIN — binarize', made ? `Long right-hand sides are split into chains of two (${made} helper nonterminal${made > 1 ? 's' : ''}).` : 'Nothing to do: no right-hand side longer than 2.');
    }
    const cnf = { type: 'CFG', start, productions: prods.map((p, i) => ({ id: 'p' + i, ...p })) };
    return { cnf, steps };
  };

  /* ---------- CYK membership ---------- */
  const cache = new Map();
  function compile(g) {
    const k = g.start + '\n' + CFG.toText(g);
    if (cache.has(k)) return cache.get(k);
    const { cnf } = CFG.toCNF(g);
    const term = new Map(), bins = [];
    let startNullable = false;
    for (const p of cnf.productions) {
      if (p.right.length === 0) startNullable = true;
      else if (p.right.length === 1) { if (!term.has(p.right[0])) term.set(p.right[0], new Set()); term.get(p.right[0]).add(p.left); }
      else bins.push(p);
    }
    const c = { start: cnf.start, term, bins, startNullable };
    if (cache.size > 80) cache.clear();
    cache.set(k, c);
    return c;
  }
  CFG.accepts = function (g, w) {
    if (!g.productions.length) return false;
    const c = compile(g);
    const s = [...w];
    const n = s.length;
    if (n === 0) return c.startNullable;
    const T = Array.from({ length: n }, () => Array.from({ length: n }, () => new Set()));
    for (let i = 0; i < n; i++) { const set = c.term.get(s[i]); if (set) for (const a of set) T[i][i].add(a); }
    for (let len = 2; len <= n; len++) {
      for (let i = 0; i + len <= n; i++) {
        const j = i + len - 1, cell = T[i][j];
        for (let k = i; k < j; k++) {
          const L = T[i][k], R = T[k + 1][j];
          if (!L.size || !R.size) continue;
          for (const p of c.bins) if (L.has(p.right[0]) && R.has(p.right[1])) cell.add(p.left);
        }
      }
    }
    return T[0][n - 1].has(c.start);
  };

  /* ---------- parse trees ---------- */
  /** Returns up to `cap` distinct derivation trees of w (cyclic ε/unit derivations are cut off). */
  CFG.parseTrees = function (g, w, cap = 2) {
    const s = [...w];
    const by = new Map();
    g.productions.forEach((p, idx) => { if (!by.has(p.left)) by.set(p.left, []); by.get(p.left).push({ idx, right: p.right }); });
    const memo = new Map(), inprog = new Set();
    let work = 0;
    function derive(A, i, j) {
      const k = A + '|' + i + '|' + j;
      if (memo.has(k)) return memo.get(k);
      if (inprog.has(k) || ++work > 60000) return [];
      inprog.add(k);
      const res = [];
      for (const p of by.get(A) || []) {
        for (const kids of seq(p.right, 0, i, j)) {
          res.push({ sym: A, prod: p.idx, children: kids.length ? kids : [{ sym: 'ε', term: true, eps: true }] });
          if (res.length >= cap) break;
        }
        if (res.length >= cap) break;
      }
      inprog.delete(k);
      memo.set(k, res);
      return res;
    }
    function seq(right, idx, i, j) {
      if (idx === right.length) return i === j ? [[]] : [];
      const sym = right[idx];
      if (!isNT(sym)) {
        if (i < j && s[i] === sym) return seq(right, idx + 1, i + 1, j).map((r) => [{ sym, term: true }, ...r]);
        return [];
      }
      const out = [];
      for (let k = i; k <= j; k++) {
        const L = derive(sym, i, k);
        if (!L.length) continue;
        const R = seq(right, idx + 1, k, j);
        if (!R.length) continue;
        for (const l of L) for (const r of R) { out.push([l, ...r]); if (out.length >= cap) return out; }
      }
      return out;
    }
    return derive(g.start, 0, s.length);
  };
  CFG.countTrees = (g, w, cap = 2) => CFG.parseTrees(g, w, cap).length;

  /** sentential forms of the leftmost derivation encoded by a parse tree */
  CFG.leftmostDerivation = function (tree, g) {
    const steps = [];
    let form = [tree];
    const str = (f) => f.map((n) => (n.eps ? '' : n.sym)).join('') || 'ε';
    steps.push({ form: str(form), prod: null });
    for (let guard = 0; guard < 500; guard++) {
      const i = form.findIndex((n) => !n.term);
      if (i < 0) break;
      const n = form[i];
      const kids = n.children.filter((c) => !c.eps);
      form = [...form.slice(0, i), ...kids, ...form.slice(i + 1)];
      const p = g && g.productions[n.prod];
      steps.push({ form: str(form), prod: p ? CFG.prodText(p) : n.sym + ' → …', node: n });
    }
    return steps;
  };
  CFG.treeYield = (t) => (t.term ? (t.eps ? '' : t.sym) : t.children.map(CFG.treeYield).join(''));

  /** BFS over leftmost derivations → strings (≤ maxLen) the grammar generates */
  CFG.generate = function (g, maxLen = 8, limit = 200) {
    const out = [], seen = new Set();
    const q = [[g.start]];
    const forms = new Set([g.start]);
    const by = new Map();
    for (const p of g.productions) { if (!by.has(p.left)) by.set(p.left, []); by.get(p.left).push(p); }
    let guard = 0;
    while (q.length && out.length < limit && guard++ < 40000) {
      const f = q.shift();
      const i = f.findIndex(isNT);
      if (i < 0) { const w = f.join(''); if (w.length <= maxLen && !seen.has(w)) { seen.add(w); out.push(w); } continue; }
      for (const p of by.get(f[i]) || []) {
        const nf = [...f.slice(0, i), ...p.right, ...f.slice(i + 1)];
        if (nf.filter((t) => !isNT(t)).length > maxLen || nf.length > maxLen + 6) continue;
        const k = nf.join('\u0001');
        if (!forms.has(k)) { forms.add(k); q.push(nf); }
      }
    }
    return out.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  };

  /** all strings up to maxLen: compare grammar with a reference predicate. Shortest counterexample first. */
  CFG.checkAgainst = function (g, ref, alphabet, maxLen) {
    let tested = 0;
    for (const w of F.strings(alphabet, maxLen)) {
      tested++;
      const exp = !!ref(w), act = CFG.accepts(g, w);
      if (exp !== act) return { ok: false, counterexample: w, expected: exp, actual: act, tested };
    }
    return { ok: true, tested };
  };
  /** shortest string (≤ maxLen) with ≥ 2 distinct parse trees */
  CFG.findAmbiguity = function (g, alphabet, maxLen) {
    for (const w of F.strings(alphabet, maxLen)) {
      if (!CFG.accepts(g, w)) continue;
      const t = CFG.parseTrees(g, w, 2);
      if (t.length >= 2) return { ambiguous: true, word: w, trees: t };
    }
    return { ambiguous: false };
  };

  /* ---------- Garden (manual growth) ---------- */
  CFG.randomDerivation = function (g, rng, maxSteps = 30) {
    const by = new Map();
    for (const p of g.productions) { if (!by.has(p.left)) by.set(p.left, []); by.get(p.left).push(p); }
    const root = { sym: g.start, children: [] };
    const open = [root];
    let steps = 0;
    const pr = CFG.productive(g);
    while (open.length) {
      const n = open.shift();
      const opts = (by.get(n.sym) || []).filter((p) => p.right.every((t) => !isNT(t) || pr.has(t)));
      if (!opts.length) return null;
      steps++;
      // as we approach the step limit, prefer terminating productions
      const pool = steps > maxSteps ? opts.filter((p) => p.right.every((t) => !isNT(t))).concat(opts.length ? [] : []) : opts;
      const p = (pool.length ? pool : opts)[Math.floor(rng() * (pool.length ? pool : opts).length)];
      n.prod = g.productions.indexOf(p);
      n.children = p.right.length ? p.right.map((t) => (isNT(t) ? { sym: t, children: [] } : { sym: t, term: true })) : [{ sym: 'ε', term: true, eps: true }];
      for (const c of n.children) if (!c.term) open.push(c);
      if (steps > 400) return null;
    }
    return root;
  };
})();
