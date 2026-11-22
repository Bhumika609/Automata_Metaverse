/* ============================================================================
 * GAME WORLD LAYER · scoring (pure functions — no UI, no storage)
 * Implements blueprint §7: Level Score, World Score, Overall Score.
 *
 *   Correct automaton ..... +500   Main academic correctness  (all-or-nothing)
 *   Efficient machine ..... +150   Fewer unnecessary states / rules
 *   Query / test efficiency +100   Good reasoning and probing
 *   No hints .............. +100   Independent solving
 *   Fast completion ....... + 50   Small bonus for efficient execution
 *   Optional objective .... +100   Advanced challenge completion
 *                          ─────
 *                          1000    (scaled by each challenge's `max`)
 *
 * DESIGN RULE (§7.3): correctness dominates. If the machine is not verified the
 * ENTIRE score is 0 — speed, hints or probing can never buy points for a wrong machine.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const G = (AM.G = AM.G || {});
  const S = (G.Score = {});

  S.PARTS = [
    { id: 'correct', label: 'Correct automaton', pts: 500, weight: '50%', why: 'Formally verified against the language' },
    { id: 'efficiency', label: 'Efficient machine', pts: 150, weight: '15%', why: 'Fewer states / rules than needed' },
    { id: 'query', label: 'Query efficiency', pts: 100, weight: '10%', why: 'Few probes & test strings' },
    { id: 'hints', label: 'No hints', pts: 100, weight: '10%', why: 'Solved independently' },
    { id: 'speed', label: 'Fast completion', pts: 50, weight: '5%', why: 'Finished near the par time' },
    { id: 'optional', label: 'Optional objective', pts: 100, weight: '10%', why: 'Bonus goal completed' },
  ];
  S.MAX_BASE = 1000;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  /** factor ∈ [0,1] for every non-correctness part */
  S.factors = function (ch, ctx) {
    const opt = ch.optimal || 0;
    const size = ctx.size == null ? opt : ctx.size;
    const extra = Math.max(0, size - opt);
    const efficiency = opt ? clamp01(1 - extra / Math.max(2, opt)) : 1;
    const budget = ch.budget || 8;
    const tests = ctx.tests || 0;
    const query = tests <= budget ? 1 : clamp01(1 - (tests - budget) / (3 * budget));
    const hints = [1, 0.5, 0.2, 0][Math.min(3, ctx.hints || 0)];
    const par = ch.par || 240;
    const t = ctx.time || 0;
    const speed = t <= par ? 1 : clamp01(1 - (t - par) / (2 * par));
    const optional = ctx.optionalMet ? 1 : 0;
    return { efficiency, query, hints, speed, optional };
  };

  /**
   * compute(ch, ctx) → { total, max, parts:[{id,label,pts,got,factor}], correct }
   *   ctx = { correct:boolean, size, tests, hints, time(sec), optionalMet:boolean }
   */
  S.compute = function (ch, ctx) {
    const unit = (ch.max || S.MAX_BASE) / S.MAX_BASE;
    const f = S.factors(ch, ctx);
    const parts = S.PARTS.map((p) => {
      const factor = p.id === 'correct' ? (ctx.correct ? 1 : 0) : ctx.correct ? f[p.id] : 0; // wrong machine ⇒ nothing else counts
      return { id: p.id, label: p.label, pts: Math.round(p.pts * unit), got: Math.round(p.pts * unit * factor), factor, why: p.why, weight: p.weight };
    });
    return { total: parts.reduce((a, p) => a + p.got, 0), max: parts.reduce((a, p) => a + p.pts, 0), parts, correct: !!ctx.correct };
  };

  /* ---------- aggregates ---------- */
  S.worldScore = (progress, challenges, worldId) => challenges.filter((c) => c.world === worldId && !c.contract).reduce((a, c) => a + ((progress[c.id] && progress[c.id].best) || 0), 0);
  S.worldMax = (challenges, worldId) => challenges.filter((c) => c.world === worldId && !c.contract).reduce((a, c) => a + c.max, 0);
  S.contractBonus = (progress, challenges) => challenges.filter((c) => c.contract).reduce((a, c) => a + ((progress[c.id] && progress[c.id].best) || 0), 0);
  S.overall = (progress, challenges, worlds) => worlds.reduce((a, w) => a + S.worldScore(progress, challenges, w.id), 0) + S.contractBonus(progress, challenges);

  /* ---------- XP & levels ---------- */
  S.xpForScore = (score) => Math.round(score / 10);
  S.levelFromXp = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40));
  S.xpForLevel = (lvl) => 40 * (lvl - 1) * (lvl - 1);
  S.levelInfo = function (xp) {
    const level = S.levelFromXp(xp);
    const lo = S.xpForLevel(level), hi = S.xpForLevel(level + 1);
    return { level, lo, hi, into: xp - lo, span: hi - lo, pct: clamp01((xp - lo) / (hi - lo)), rank: G.RANKS ? G.RANKS[Math.min(G.RANKS.length - 1, level - 1)] : '' };
  };
})();
