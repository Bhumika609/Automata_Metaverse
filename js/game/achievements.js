/* ============================================================================
 * GAME WORLD LAYER · achievements (blueprint §8 — all nine — plus a few extras)
 * Each achievement is a pure function of the saved state, so it can never get
 * out of sync, and `progress()` powers the locked-badge progress bars.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const G = (AM.G = AM.G || {});

  const cnt = (s, pred) => Object.entries(s.progress).filter(([id, p]) => p.completed && pred(id, p)).length;

  G.ACHIEVEMENTS = [
    { id: 'finite_mind', name: 'Finite Mind', icon: '🧠', color: '#22d3ee', desc: 'Solve 5 DFA challenges without hints.', goal: 5,
      progress: (s) => cnt(s, (id, p) => p.noHintSolved && G.challengeById(id) && G.challengeById(id).tags.includes('dfa')) },
    { id: 'branch_master', name: 'Branch Master', icon: '🌿', color: '#c084fc', desc: 'Solve an NFA challenge using fewer than 5 test strings.', goal: 1,
      progress: (s) => (s.stats.branchMaster ? 1 : 0) },
    { id: 'stack_engineer', name: 'Stack Engineer', icon: '🏭', color: '#fbbf24', desc: 'Recognize aⁿbⁿ using a PDA.', goal: 1,
      progress: (s) => (s.progress.P1 && s.progress.P1.completed ? 1 : 0) },
    { id: 'grammar_gardener', name: 'Grammar Gardener', icon: '🌳', color: '#4ade80', desc: 'Generate 10 valid strings from a CFG.', goal: 10,
      progress: (s) => Math.min(10, s.stats.gardenStrings.length) },
    { id: 'tape_master', name: 'Tape Master', icon: '📼', color: '#60a5fa', desc: 'Build a correct Turing Machine.', goal: 1,
      progress: (s) => (cnt(s, (id) => G.challengeById(id) && G.challengeById(id).world === 'tm') ? 1 : 0) },
    { id: 'machine_collector', name: 'Machine Collector', icon: '🗄️', color: '#a78bfa', desc: 'Create 10 verified machines.', goal: 10,
      progress: (s) => Math.min(10, s.machines.filter((m) => m.verified).length) },
    { id: 'minimalist', name: 'Minimalist', icon: '✂️', color: '#34d399', desc: 'Construct a minimal DFA.', goal: 1,
      progress: (s) => (s.stats.minimalDFA ? 1 : 0) },
    { id: 'counterexample_hunter', name: 'Counterexample Hunter', icon: '🔎', color: '#f472b6', desc: 'Find a distinguishing string between two machines.', goal: 1,
      progress: (s) => Math.min(1, s.stats.distinguished) },
    { id: 'world_builder', name: 'World Builder', icon: '🏗️', color: '#fb923c', desc: 'Deploy 5 verified machines into the game world.', goal: 5,
      progress: (s) => Math.min(5, s.stats.deployedMachineIds.length) },
    /* extras */
    { id: 'cartographer', name: 'Cartographer', icon: '🗺️', color: '#38bdf8', desc: 'Visit all six regions of the metaverse.', goal: 6, extra: true,
      progress: (s) => G.WORLDS.filter((w) => s.visited[w.id]).length },
    { id: 'ambiguity_hunter', name: 'Ambiguity Hunter', icon: '🌲', color: '#86efac', desc: 'Find a string with two different parse trees.', goal: 1, extra: true,
      progress: (s) => Math.min(1, s.stats.ambiguousFound) },
    { id: 'perfect_machine', name: 'Perfect Machine', icon: '💎', color: '#e879f9', desc: 'Earn the maximum score on any challenge.', goal: 1, extra: true,
      progress: (s) => (Object.entries(s.progress).some(([id, p]) => G.challengeById(id) && p.best >= G.challengeById(id).max) ? 1 : 0) },
    { id: 'halting_sage', name: 'Halting Sage', icon: '🌀', color: '#fb7185', desc: 'Complete the Void Zone.', goal: 2, extra: true,
      progress: (s) => cnt(s, (id) => G.challengeById(id) && G.challengeById(id).world === 'void') },
    { id: 'maintainer', name: 'Maintainer', icon: '🛠️', color: '#facc15', desc: 'Patch a deployed machine after a policy update.', goal: 1, extra: true,
      progress: (s) => cnt(s, (id) => G.challengeById(id) && G.challengeById(id).contract) > 0 ? 1 : 0 },
  ];
  G.achievementById = (id) => G.ACHIEVEMENTS.find((a) => a.id === id);

  /** unlock whatever is newly satisfied; returns the newly unlocked definitions */
  G.evaluateAchievements = function (state) {
    const fresh = [];
    for (const a of G.ACHIEVEMENTS) {
      if (state.achievements[a.id]) continue;
      if (a.progress(state) >= a.goal) { state.achievements[a.id] = { at: new Date().toISOString() }; fresh.push(a); }
    }
    return fresh;
  };
})();
