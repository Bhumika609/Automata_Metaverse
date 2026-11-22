/* ============================================================================
 * FORMAL LAYER · Turing machines (deterministic, single tape, two-way infinite)
 * Transition:  read → write, move(L|R|S).  Blank = '_' (shown as □).
 * The machine ACCEPTS the moment it enters a final state; it REJECTS when no
 * transition applies in a non-final state; otherwise it keeps running (or hits the
 * step limit, which proves nothing — see Void Zone).
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F;
  const TM = (F.TM = {});
  const BLANK = '_';
  TM.BLANK = BLANK;
  const norm = (s) => (s === undefined || s === null || s === '' || s === '□' ? BLANK : s);
  TM.norm = norm;

  TM.validate = function (m, { alphabet = null } = {}) {
    const errors = [], warnings = [];
    if (!m.states.length) errors.push('Add at least one state.');
    const names = new Map();
    for (const s of m.states) { const n = (s.name || '').trim(); if (!n) errors.push('A state has an empty name.'); names.set(n, (names.get(n) || 0) + 1); }
    for (const [n, c] of names) if (n && c > 1) errors.push(`Duplicate state name "${n}".`);
    const inits = m.states.filter((s) => s.initial);
    if (m.states.length && inits.length !== 1) errors.push(inits.length ? 'More than one initial state.' : 'Mark exactly one state as initial.');
    if (m.states.length && !m.states.some((s) => s.final)) warnings.push('No final state — the machine can never accept.');
    const ids = new Set(m.states.map((s) => s.id));
    const seen = new Map();
    const nameOf = (id) => (m.states.find((s) => s.id === id) || {}).name || id;
    for (const t of m.transitions) {
      if (!ids.has(t.from) || !ids.has(t.to)) { errors.push('A transition points to a missing state.'); continue; }
      const r = norm(t.read), wr = norm(t.write);
      if (r.length > 1 || wr.length > 1) errors.push(`Tape symbols must be one character (${nameOf(t.from)}→${nameOf(t.to)}).`);
      if (!['L', 'R', 'S'].includes(t.move)) errors.push(`Move must be L, R or S (${nameOf(t.from)}→${nameOf(t.to)}).`);
      const k = t.from + '\u0001' + r;
      if (seen.has(k)) errors.push(`State ${nameOf(t.from)} has two transitions reading "${r === BLANK ? '□' : r}" — a deterministic TM allows only one.`);
      seen.set(k, t);
      if (alphabet && r !== BLANK && !alphabet.includes(r) && !(m.tapeSymbols || []).includes(r)) { /* work symbols are allowed */ }
    }
    return { errors, warnings, ok: errors.length === 0 };
  };

  /**
   * Run the machine. opts: { maxSteps, traceLimit, detectLoop }
   * Returns { status: 'accepted'|'rejected'|'limit'|'loop', steps, output, trace, ... }
   */
  TM.run = function (m, input, opts = {}) {
    const maxSteps = opts.maxSteps || 10000;
    const traceLimit = opts.traceLimit === undefined ? 2500 : opts.traceLimit;
    const init = m.states.find((s) => s.initial);
    if (!init) return { status: 'rejected', steps: 0, output: '', trace: [], error: 'No initial state' };
    const finals = new Set(m.states.filter((s) => s.final).map((s) => s.id));
    const delta = new Map();
    for (const t of m.transitions) { const k = t.from + '\u0001' + norm(t.read); if (!delta.has(k)) delta.set(k, t); }
    const tape = new Map();
    [...input].forEach((c, i) => tape.set(i, c));
    let state = init.id, head = 0, steps = 0, min = 0, max = Math.max(0, input.length - 1);
    const trace = [];
    let traceTruncated = false;
    const render = () => { let s = ''; for (let i = min; i <= max; i++) s += tape.get(i) || BLANK; return s; };
    const snap = (via) => ({ step: steps, state, head, off: min, cells: render(), via: via || null });
    if (traceLimit) trace.push(snap());
    const tapeKey = () => [...tape.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[0] + ':' + e[1]).join(',');
    // Brent cycle detection (O(1) memory): proves non-termination only when a configuration repeats exactly
    let saved = null, power = 1, lam = 0;
    const finish = (status, extra = {}) => {
      let lo = Infinity, hi = -Infinity;
      for (const k of tape.keys()) { if (k < lo) lo = k; if (k > hi) hi = k; }
      let out = '';
      if (lo !== Infinity) for (let i = lo; i <= hi; i++) out += tape.get(i) || BLANK;
      return { status, steps, state, head, output: out, trace, traceTruncated, tapeCells: render(), tapeOffset: min, ...extra };
    };
    for (;;) {
      if (finals.has(state)) return finish('accepted');
      const sym = tape.get(head) || BLANK;
      const t = delta.get(state + '\u0001' + sym);
      if (!t) return finish('rejected', { reason: 'no transition' });
      if (steps >= maxSteps) return finish('limit');
      const wr = norm(t.write);
      if (wr === BLANK) tape.delete(head); else tape.set(head, wr);
      head += t.move === 'R' ? 1 : t.move === 'L' ? -1 : 0;
      if (head < min) min = head;
      if (head > max) max = head;
      state = t.to;
      steps++;
      if (traceLimit) { if (trace.length < traceLimit) trace.push(snap(t.id)); else traceTruncated = true; }
      if (opts.detectLoop) {
        if (saved && saved.state === state && saved.head === head && saved.key === tapeKey()) return finish('loop');
        if (++lam === power) { saved = { state, head, key: tapeKey() }; power *= 2; lam = 0; }
      }
    }
  };
  TM.accepts = (m, w, o) => TM.run(m, w, { traceLimit: 0, maxSteps: 5000, ...(o || {}) }).status === 'accepted';

  /** ε-free helper: strip blanks on both ends */
  TM.trimTape = (s) => s.replace(/^_+|_+$/g, '');
})();
