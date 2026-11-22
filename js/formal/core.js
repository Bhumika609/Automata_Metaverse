/* ============================================================================
 * AUTOMATA METAVERSE — FORMAL LAYER · core utilities
 * Pure logic. No DOM. Works in the browser (global `AM`) and in Node (tests).
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = (AM.F = AM.F || {});

  F.EPS = 'ε';
  /** true for every spelling of the empty symbol */
  F.isEps = (s) => s === '' || s === 'ε' || s === 'λ' || s === null || s === undefined;
  F.clone = (o) => JSON.parse(JSON.stringify(o));

  /** all strings over `alphabet` up to `maxLen`, shortest first (shortlex) */
  F.strings = function (alphabet, maxLen) {
    const out = [''];
    let layer = [''];
    for (let l = 1; l <= maxLen; l++) {
      const next = [];
      for (const p of layer) for (const a of alphabet) next.push(p + a);
      for (const s of next) out.push(s);
      layer = next;
    }
    return out;
  };

  /** deterministic PRNG (mulberry32) so that "random" content is reproducible */
  F.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  F.pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  F.randomString = function (rng, alphabet, minLen, maxLen) {
    const len = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
    return s;
  };

  /** Layered auto-layout (BFS from the initial state) for generated machines */
  F.autoLayout = function (m, W = 760, H = 440) {
    const n = m.states.length;
    if (!n) return m;
    const init = m.states.find((s) => s.initial) || m.states[0];
    const adj = new Map(m.states.map((s) => [s.id, []]));
    for (const t of m.transitions) if (adj.has(t.from)) adj.get(t.from).push(t.to);
    const layer = new Map([[init.id, 0]]);
    const q = [init.id];
    while (q.length) {
      const u = q.shift();
      for (const v of adj.get(u) || []) if (!layer.has(v)) { layer.set(v, layer.get(u) + 1); q.push(v); }
    }
    let maxL = Math.max(0, ...layer.values());
    for (const s of m.states) if (!layer.has(s.id)) layer.set(s.id, ++maxL);
    const cols = new Map();
    for (const s of m.states) {
      const l = layer.get(s.id);
      if (!cols.has(l)) cols.set(l, []);
      cols.get(l).push(s);
    }
    const keys = [...cols.keys()].sort((a, b) => a - b);
    const L = keys.length;
    keys.forEach((l, ci) => {
      const col = cols.get(l);
      const x = L === 1 ? W / 2 : 80 + (ci * (W - 160)) / (L - 1);
      const gap = Math.min(120, (H - 110) / Math.max(1, col.length - 1));
      col.forEach((s, i) => {
        s.x = Math.round(x);
        s.y = Math.round(H / 2 + (i - (col.length - 1) / 2) * gap);
      });
    });
    return m;
  };

  /** Create an empty machine skeleton */
  F.newMachine = function (type) {
    const m = { type, states: [], transitions: [], alphabet: [] };
    if (type === 'PDA') { m.acceptMode = 'final'; m.initialStack = 'Z'; }
    if (type === 'TM') { m.blank = '_'; }
    if (type === 'CFG') { return { type: 'CFG', start: 'S', productions: [] }; }
    return m;
  };

  F.stateIndex = (m) => new Map(m.states.map((s) => [s.id, s]));

  let _tid = 0;
  F.nextTransitionId = () => 't' + ++_tid;

  /** compact textual signature (for caching / change detection) */
  F.signature = (m) => JSON.stringify([m.type, m.states.map((s) => [s.id, s.name, !!s.initial, !!s.final]), m.transitions.map((t) => [t.from, t.to, t.read, t.pop, t.push, t.write, t.move]), m.acceptMode, m.initialStack, m.productions && m.productions.map((p) => [p.left, p.right]), m.start]);
})();
